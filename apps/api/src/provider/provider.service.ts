import { Injectable, NotFoundException } from "@nestjs/common";
import { ServiceName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { isConfidentSubstringMatch, normalizeCarrierName } from "../upload/provider-normalize";
import { OnNetMnoRow, ProviderCoverageStats, ProviderDetail, ProviderSummary } from "@ccip/shared-types";

const EMPTY_STATS: ProviderCoverageStats = { totalCountries: 0, totalMnos: 0, sccpCount: 0, dsxCount: 0, ipxCount: 0 };

@Injectable()
export class ProviderService {
  constructor(private prisma: PrismaService) {}

  /** Matches `q` against the canonical ProviderMaster.providerName as well
   * as every known alias in ProviderAlias — e.g. searching "Belgacom"
   * finds the "BICS" row it's aliased to, not just literal name matches. */
  async search(q?: string): Promise<ProviderSummary[]> {
    let aliasMatchIds: number[] = [];
    if (q) {
      const normalized = normalizeCarrierName(q);
      const aliasRows = await this.prisma.providerAlias.findMany({
        where: { aliasPattern: { contains: normalized, mode: "insensitive" } },
        select: { providerId: true },
      });
      aliasMatchIds = aliasRows.map((r) => r.providerId);
    }

    const providers = await this.prisma.providerMaster.findMany({
      where: q
        ? {
            OR: [
              { providerName: { contains: q, mode: "insensitive" } },
              ...(aliasMatchIds.length > 0 ? [{ id: { in: aliasMatchIds } }] : []),
            ],
          }
        : undefined,
      orderBy: { providerName: "asc" },
    });

    const statsById = await this.computeFootprints(providers.map((p) => p.id));

    return providers.map((r) => ({
      id: r.id,
      providerName: r.providerName,
      providerType: r.providerType,
      headquarters: r.headquarters,
      website: r.website,
      stats: statsById.get(r.id) ?? EMPTY_STATS,
    }));
  }

  async detail(id: number): Promise<ProviderDetail> {
    const provider = await this.prisma.providerMaster.findUnique({ where: { id } });
    if (!provider) throw new NotFoundException("Provider not found");

    const [ir21Rows, reachRows] = await Promise.all([
      this.prisma.ir21Connectivity.findMany({
        where: { providerId: id },
        include: { mno: true, service: true },
      }),
      this.prisma.providerReachlist.findMany({
        where: { providerId: id },
        include: { mno: true, service: true },
      }),
    ]);

    const byMno = new Map<
      number,
      { country: string; operatorName: string; tadigCode: string; sccp: boolean; dsx: boolean; ipx: boolean }
    >();

    const touch = (mnoId: number, mno: { country: string; operatorName: string; tadigCode: string }, service: string) => {
      const row = byMno.get(mnoId) ?? {
        country: mno.country,
        operatorName: mno.operatorName,
        tadigCode: mno.tadigCode,
        sccp: false,
        dsx: false,
        ipx: false,
      };
      if (service === "SCCP") row.sccp = true;
      if (service === "DSX") row.dsx = true;
      if (service === "IPX") row.ipx = true;
      byMno.set(mnoId, row);
    };

    for (const r of ir21Rows) touch(r.mnoId, r.mno, r.service.serviceName);
    for (const r of reachRows) touch(r.mnoId, r.mno, r.service.serviceName);

    const onNetMnos: OnNetMnoRow[] = Array.from(byMno.values())
      .map((r) => ({
        country: r.country,
        operatorName: r.operatorName,
        tadigCode: r.tadigCode,
        sccp: r.sccp,
        dsx: r.dsx,
        ipx: r.ipx,
      }))
      .sort((a, b) => a.country.localeCompare(b.country) || a.operatorName.localeCompare(b.operatorName));

    const { aliases, observedRawStrings } = await this.provenance(provider.id, provider.providerName);

    return {
      id: provider.id,
      providerName: provider.providerName,
      providerType: provider.providerType,
      headquarters: provider.headquarters,
      website: provider.website,
      stats: {
        totalCountries: new Set(onNetMnos.map((m) => m.country)).size,
        totalMnos: onNetMnos.length,
        sccpCount: onNetMnos.filter((m) => m.sccp).length,
        dsxCount: onNetMnos.filter((m) => m.dsx).length,
        ipxCount: onNetMnos.filter((m) => m.ipx).length,
      },
      onNetMnos,
      aliases,
      observedRawStrings,
    };
  }

  /** All known alias patterns for this provider, plus every distinct raw
   * carrier string across all MNOs' XML data (MnoMasterConnectivity —
   * Reach List raw text isn't persisted anywhere, so it can't be included
   * here) observed to resolve to this provider — the audit trail behind
   * "why does this show BICS". */
  private async provenance(providerId: number, providerName: string): Promise<{ aliases: string[]; observedRawStrings: string[] }> {
    const aliasRows = await this.prisma.providerAlias.findMany({
      where: { providerId },
      orderBy: { aliasPattern: "asc" },
    });
    const aliases = aliasRows.map((a) => a.aliasPattern);
    const patterns = [normalizeCarrierName(providerName), ...aliases];

    const allConnectivity = await this.prisma.mnoMasterConnectivity.findMany({
      select: { primarySccpCarrier: true, backupSccpCarriers: true, grxIpxProviders: true, lteIpxProviders: true },
    });

    const observed = new Set<string>();
    for (const c of allConnectivity) {
      const candidates = [c.primarySccpCarrier, ...c.backupSccpCarriers, ...c.grxIpxProviders, ...c.lteIpxProviders].filter(
        (v): v is string => !!v,
      );
      for (const raw of candidates) {
        const normalized = normalizeCarrierName(raw);
        if (patterns.some((p) => isConfidentSubstringMatch(normalized, p))) observed.add(raw);
      }
    }

    return { aliases, observedRawStrings: Array.from(observed) };
  }

  /** Batch version of detail()'s stats computation, for the search list —
   * counts distinct MNOs (and countries/services among them) per provider
   * across both Ir21Connectivity and ProviderReachlist in two queries
   * total, rather than one round-trip per row. */
  private async computeFootprints(providerIds: number[]): Promise<Map<number, ProviderCoverageStats>> {
    if (providerIds.length === 0) return new Map();

    const [ir21Rows, reachRows] = await Promise.all([
      this.prisma.ir21Connectivity.findMany({
        where: { providerId: { in: providerIds } },
        select: { providerId: true, mnoId: true, mno: { select: { country: true } }, service: { select: { serviceName: true } } },
      }),
      this.prisma.providerReachlist.findMany({
        where: { providerId: { in: providerIds } },
        select: { providerId: true, mnoId: true, mno: { select: { country: true } }, service: { select: { serviceName: true } } },
      }),
    ]);

    type Acc = { mnos: Set<number>; countries: Set<string>; sccp: Set<number>; dsx: Set<number>; ipx: Set<number> };
    const acc = new Map<number, Acc>();
    const touch = (providerId: number, mnoId: number, country: string, service: ServiceName) => {
      let a = acc.get(providerId);
      if (!a) {
        a = { mnos: new Set(), countries: new Set(), sccp: new Set(), dsx: new Set(), ipx: new Set() };
        acc.set(providerId, a);
      }
      a.mnos.add(mnoId);
      a.countries.add(country);
      if (service === "SCCP") a.sccp.add(mnoId);
      if (service === "DSX") a.dsx.add(mnoId);
      if (service === "IPX") a.ipx.add(mnoId);
    };

    for (const r of ir21Rows) touch(r.providerId, r.mnoId, r.mno.country, r.service.serviceName);
    for (const r of reachRows) touch(r.providerId, r.mnoId, r.mno.country, r.service.serviceName);

    const out = new Map<number, ProviderCoverageStats>();
    for (const [providerId, a] of acc) {
      out.set(providerId, {
        totalCountries: a.countries.size,
        totalMnos: a.mnos.size,
        sccpCount: a.sccp.size,
        dsxCount: a.dsx.size,
        ipxCount: a.ipx.size,
      });
    }
    return out;
  }
}
