import { Injectable, NotFoundException } from "@nestjs/common";
import { ServiceName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { isConfidentSubstringMatch, normalizeCarrierName } from "../upload/provider-normalize";
import {
  OnNetMnoRow,
  ProviderCoverageStats,
  ProviderDetail,
  ProviderStatsSource,
  ProviderSuggestion,
  ProviderSummary,
} from "@ccip/shared-types";

const EMPTY_STATS: ProviderCoverageStats = { totalCountries: 0, totalMnos: 0, sccpCount: 0, dsxCount: 0, ipxCount: 0 };
const SUGGESTION_LIMIT = 10;

@Injectable()
export class ProviderService {
  constructor(private prisma: PrismaService) {}

  /** Matches `q` against the canonical ProviderMaster.providerName as well
   * as every known alias in ProviderAlias — e.g. searching "Belgacom"
   * finds the "BICS" row it's aliased to, not just literal name matches.
   * `source=IR21`/`REACH_LIST` returns one row per provider with that
   * single source's footprint. `source=BOTH` returns *two* rows per
   * provider — one IR21-only, one REACH_LIST-only — so the two footprints
   * can be compared side by side instead of blended into one union number.
   * `includeEmpty` bypasses the zero-MNO filter below — admin tooling (e.g.
   * locating a duplicate/junk provider to merge or delete) needs to find a
   * row regardless of its current footprint, not just what's normally
   * shown to end users. */
  async search(
    q?: string,
    source: ProviderStatsSource = ProviderStatsSource.BOTH,
    includeEmpty = false,
  ): Promise<ProviderSummary[]> {
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
    const providerIds = providers.map((p) => p.id);

    const toRow = (r: (typeof providers)[number], stats: ProviderCoverageStats, rowSource?: ProviderStatsSource): ProviderSummary => ({
      id: r.id,
      providerName: r.providerName,
      providerType: r.providerType,
      headquarters: r.headquarters,
      website: r.website,
      stats,
      source: rowSource,
    });

    // Providers with zero MNOs under the selected source are almost always
    // stray/junk ProviderMaster rows (bad IR.21 text fragments, "0.0.0.0",
    // etc.) rather than real carriers with genuinely no footprint — dropping
    // them keeps the list to providers actually visible in that source.
    if (source === ProviderStatsSource.BOTH) {
      const [ir21Stats, reachStats] = await Promise.all([
        this.computeFootprints(providerIds, ProviderStatsSource.IR21),
        this.computeFootprints(providerIds, ProviderStatsSource.REACH_LIST),
      ]);
      const rows: ProviderSummary[] = [];
      for (const r of providers) {
        const ir21 = ir21Stats.get(r.id) ?? EMPTY_STATS;
        const reach = reachStats.get(r.id) ?? EMPTY_STATS;
        if (includeEmpty || ir21.totalMnos > 0) rows.push(toRow(r, ir21, ProviderStatsSource.IR21));
        if (includeEmpty || reach.totalMnos > 0) rows.push(toRow(r, reach, ProviderStatsSource.REACH_LIST));
      }
      return rows;
    }

    const statsById = await this.computeFootprints(providerIds, source);
    return providers
      .map((r) => toRow(r, statsById.get(r.id) ?? EMPTY_STATS))
      .filter((row) => includeEmpty || row.stats.totalMnos > 0);
  }

  /** Lightweight matches for the Provider Search autocomplete — canonical
   * names first, then alias-only matches (so typing "Belgacom" suggests
   * "BICS" with the matched alias shown, not just literal name hits).
   * Fetched on every keystroke (debounced client-side). */
  async suggestions(q: string): Promise<ProviderSuggestion[]> {
    if (!q.trim()) return [];

    const nameMatches = await this.prisma.providerMaster.findMany({
      where: { providerName: { contains: q, mode: "insensitive" } },
      select: { id: true, providerName: true },
      orderBy: { providerName: "asc" },
      take: SUGGESTION_LIMIT,
    });
    const results: ProviderSuggestion[] = nameMatches.map((p) => ({
      id: p.id,
      providerName: p.providerName,
      matchedAlias: null,
    }));

    if (results.length < SUGGESTION_LIMIT) {
      const normalized = normalizeCarrierName(q);
      const aliasMatches = await this.prisma.providerAlias.findMany({
        where: {
          aliasPattern: { contains: normalized, mode: "insensitive" },
          providerId: { notIn: results.map((r) => r.id) },
        },
        include: { provider: { select: { id: true, providerName: true } } },
        take: SUGGESTION_LIMIT - results.length,
      });
      const seen = new Set(results.map((r) => r.id));
      for (const a of aliasMatches) {
        if (seen.has(a.provider.id)) continue;
        seen.add(a.provider.id);
        results.push({ id: a.provider.id, providerName: a.provider.providerName, matchedAlias: a.aliasPattern });
      }
    }

    return results;
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

    const pdfFlags = await this.prisma.mnoMasterConnectivity.findMany({
      where: { mnoId: { in: Array.from(byMno.keys()) } },
      select: { mnoId: true, hasPdfDocument: true },
    });
    const hasPdfByMno = new Map(pdfFlags.map((p) => [p.mnoId, p.hasPdfDocument]));

    const onNetMnos: OnNetMnoRow[] = Array.from(byMno.entries())
      .map(([mnoId, r]) => ({
        mnoId,
        country: r.country,
        operatorName: r.operatorName,
        tadigCode: r.tadigCode,
        sccp: r.sccp,
        dsx: r.dsx,
        ipx: r.ipx,
        hasPdfDocument: hasPdfByMno.get(mnoId) ?? false,
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
   * across Ir21Connectivity and/or ProviderReachlist (per `source`) in up
   * to two queries total, rather than one round-trip per row. */
  private async computeFootprints(
    providerIds: number[],
    source: ProviderStatsSource,
  ): Promise<Map<number, ProviderCoverageStats>> {
    if (providerIds.length === 0) return new Map();

    const includeIr21 = source !== ProviderStatsSource.REACH_LIST;
    const includeReachList = source !== ProviderStatsSource.IR21;

    const [ir21Rows, reachRows] = await Promise.all([
      includeIr21
        ? this.prisma.ir21Connectivity.findMany({
            where: { providerId: { in: providerIds } },
            select: { providerId: true, mnoId: true, mno: { select: { country: true } }, service: { select: { serviceName: true } } },
          })
        : Promise.resolve([]),
      includeReachList
        ? this.prisma.providerReachlist.findMany({
            where: { providerId: { in: providerIds } },
            select: { providerId: true, mnoId: true, mno: { select: { country: true } }, service: { select: { serviceName: true } } },
          })
        : Promise.resolve([]),
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
