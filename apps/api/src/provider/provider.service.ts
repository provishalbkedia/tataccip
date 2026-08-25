import { Injectable, NotFoundException } from "@nestjs/common";
import { ServiceName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { isConfidentSubstringMatch, normalizeCarrierName } from "../upload/provider-normalize";
import { ProviderResolverService } from "../upload/provider-resolver.service";
import {
  OnNetMnoRow,
  ProviderCompareMatrixItem,
  ProviderCoverageStats,
  ProviderDetail,
  ProviderStatsSource,
  ProviderSuggestion,
  ProviderSummary,
  ServicePresence,
} from "@ccip/shared-types";

const EMPTY_STATS: ProviderCoverageStats = { totalCountries: 0, totalMnos: 0, sccpCount: 0, dsxCount: 0, ipxCount: 0 };
const SUGGESTION_LIMIT = 10;

type MultiHomedProviderIndex = Map<number, Map<ServiceName, Map<number, { operatorName: string; country: string; tadigCode: string }>>>;

@Injectable()
export class ProviderService {
  constructor(
    private prisma: PrismaService,
    private providerResolver: ProviderResolverService,
  ) {}

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
    service?: ServiceName,
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
    const passesServiceFilter = (stats: ProviderCoverageStats) => {
      if (!service) return true;
      if (service === "SCCP") return stats.sccpCount > 0;
      if (service === "DSX") return stats.dsxCount > 0;
      return stats.ipxCount > 0;
    };

    if (source === ProviderStatsSource.BOTH) {
      const [ir21Stats, reachStats] = await Promise.all([
        this.computeFootprints(providerIds, ProviderStatsSource.IR21),
        this.computeFootprints(providerIds, ProviderStatsSource.REACH_LIST),
      ]);
      const rows: ProviderSummary[] = [];
      for (const r of providers) {
        const ir21 = ir21Stats.get(r.id) ?? EMPTY_STATS;
        const reach = reachStats.get(r.id) ?? EMPTY_STATS;
        if ((includeEmpty || ir21.totalMnos > 0) && passesServiceFilter(ir21)) rows.push(toRow(r, ir21, ProviderStatsSource.IR21));
        if ((includeEmpty || reach.totalMnos > 0) && passesServiceFilter(reach)) rows.push(toRow(r, reach, ProviderStatsSource.REACH_LIST));
      }
      return rows;
    }

    const statsById = await this.computeFootprints(providerIds, source);
    return providers
      .map((r) => toRow(r, statsById.get(r.id) ?? EMPTY_STATS))
      .filter((row) => (includeEmpty || row.stats.totalMnos > 0) && passesServiceFilter(row.stats));
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

  /** `source` controls both which declarations count toward presence/stats
   * and what gets exposed per row: IR21/REACH_LIST restrict onNetMnos to
   * MNOs that source actually declares, using only that source's flags;
   * BOTH (default) keeps the historical merged (OR'd) sccp/dsx/ipx flags
   * for backward compatibility, plus attaches the per-source ir21/reachList
   * breakdown so the UI can show both side by side. */
  async detail(id: number, source: ProviderStatsSource = ProviderStatsSource.BOTH): Promise<ProviderDetail> {
    const provider = await this.prisma.providerMaster.findUnique({ where: { id } });
    if (!provider) throw new NotFoundException("Provider not found");

    const [ir21Rows, reachRows, multiHomedIndex] = await Promise.all([
      this.prisma.ir21Connectivity.findMany({
        where: { providerId: id },
        include: { mno: true, service: true },
      }),
      this.prisma.providerReachlist.findMany({
        where: { providerId: id },
        include: { mno: true, service: true },
      }),
      source !== ProviderStatsSource.REACH_LIST
        ? this.buildMultiHomedProviderIndex([id])
        : Promise.resolve<MultiHomedProviderIndex>(new Map()),
    ]);

    type Bucket = { country: string; operatorName: string; tadigCode: string; ir21: ServicePresence; reachList: ServicePresence };
    const byMno = new Map<number, Bucket>();

    const touch = (
      mnoId: number,
      mno: { country: string; operatorName: string; tadigCode: string },
      service: string,
      key: "ir21" | "reachList",
    ) => {
      const row = byMno.get(mnoId) ?? {
        country: mno.country,
        operatorName: mno.operatorName,
        tadigCode: mno.tadigCode,
        ir21: { sccp: false, dsx: false, ipx: false },
        reachList: { sccp: false, dsx: false, ipx: false },
      };
      if (service === "SCCP") row[key].sccp = true;
      if (service === "DSX") row[key].dsx = true;
      if (service === "IPX") row[key].ipx = true;
      byMno.set(mnoId, row);
    };

    for (const r of ir21Rows) touch(r.mnoId, r.mno, r.service.serviceName, "ir21");
    for (const r of reachRows) touch(r.mnoId, r.mno, r.service.serviceName, "reachList");
    // Multi-homed catch-up — see buildMultiHomedProviderIndex.
    for (const [service, byMno] of multiHomedIndex.get(id) ?? []) {
      for (const [mnoId, mno] of byMno) touch(mnoId, mno, service, "ir21");
    }

    const pdfFlags = await this.prisma.mnoMasterConnectivity.findMany({
      where: { mnoId: { in: Array.from(byMno.keys()) } },
      select: { mnoId: true, hasPdfDocument: true },
    });
    const hasPdfByMno = new Map(pdfFlags.map((p) => [p.mnoId, p.hasPdfDocument]));

    const includeIr21 = source !== ProviderStatsSource.REACH_LIST;
    const includeReach = source !== ProviderStatsSource.IR21;
    const hasAny = (p: ServicePresence) => p.sccp || p.dsx || p.ipx;

    const onNetMnos: OnNetMnoRow[] = Array.from(byMno.entries())
      .filter(([, r]) => (includeIr21 && hasAny(r.ir21)) || (includeReach && hasAny(r.reachList)))
      .map(([mnoId, r]) => {
        const row: OnNetMnoRow = {
          mnoId,
          country: r.country,
          operatorName: r.operatorName,
          tadigCode: r.tadigCode,
          sccp: (includeIr21 && r.ir21.sccp) || (includeReach && r.reachList.sccp),
          dsx: (includeIr21 && r.ir21.dsx) || (includeReach && r.reachList.dsx),
          ipx: (includeIr21 && r.ir21.ipx) || (includeReach && r.reachList.ipx),
          hasPdfDocument: hasPdfByMno.get(mnoId) ?? false,
        };
        if (source === ProviderStatsSource.BOTH) {
          row.ir21 = r.ir21;
          row.reachList = r.reachList;
        }
        return row;
      })
      .sort((a, b) => a.country.localeCompare(b.country) || a.operatorName.localeCompare(b.operatorName));

    const { aliases, observedRawStrings } = await this.provenance(provider.id, provider.providerName);

    return {
      id: provider.id,
      providerName: provider.providerName,
      providerType: provider.providerType,
      headquarters: provider.headquarters,
      website: provider.website,
      source,
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

  /** Multi-provider side-by-side footprint comparison (2-5 providers) —
   * one row per MNO covered by ANY selected provider, with each provider's
   * own IR.21/Reach List service breakdown nested under its id. Powers
   * /search/provider/compare's grouped-column matrix. */
  async compareMatrix(providerIds: number[]): Promise<ProviderCompareMatrixItem[]> {
    const providers = await this.prisma.providerMaster.findMany({ where: { id: { in: providerIds } } });
    const providerNameById = new Map(providers.map((p) => [p.id, p.providerName]));

    const [ir21Rows, reachRows, multiHomedIndex] = await Promise.all([
      this.prisma.ir21Connectivity.findMany({
        where: { providerId: { in: providerIds } },
        include: { mno: true, service: true },
      }),
      this.prisma.providerReachlist.findMany({
        where: { providerId: { in: providerIds } },
        include: { mno: true, service: true },
      }),
      this.buildMultiHomedProviderIndex(providerIds),
    ]);

    const byMno = new Map<number, ProviderCompareMatrixItem>();
    const touch = (
      mnoId: number,
      mno: { operatorName: string; country: string; tadigCode: string },
      providerId: number,
      service: string,
      key: "ir21" | "reachList",
    ) => {
      let item = byMno.get(mnoId);
      if (!item) {
        item = { mnoId, operatorName: mno.operatorName, country: mno.country, tadigCode: mno.tadigCode, providers: {} };
        byMno.set(mnoId, item);
      }
      let p = item.providers[providerId];
      if (!p) {
        p = {
          providerName: providerNameById.get(providerId) ?? String(providerId),
          ir21: { sccp: false, dsx: false, ipx: false },
          reachList: { sccp: false, dsx: false, ipx: false },
        };
        item.providers[providerId] = p;
      }
      if (service === "SCCP") p[key].sccp = true;
      if (service === "DSX") p[key].dsx = true;
      if (service === "IPX") p[key].ipx = true;
    };

    for (const r of ir21Rows) touch(r.mnoId, r.mno, r.providerId, r.service.serviceName, "ir21");
    for (const r of reachRows) touch(r.mnoId, r.mno, r.providerId, r.service.serviceName, "reachList");
    // Multi-homed catch-up — see buildMultiHomedProviderIndex.
    for (const [providerId, byService] of multiHomedIndex) {
      for (const [service, mnosForService] of byService) {
        for (const [mnoId, mno] of mnosForService) touch(mnoId, mno, providerId, service, "ir21");
      }
    }

    return Array.from(byMno.values()).sort(
      (a, b) => a.country.localeCompare(b.country) || a.operatorName.localeCompare(b.operatorName),
    );
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

  /** Ir21Connectivity stores exactly one resolved provider per (mnoId,
   * serviceId) — the MNO's single declared *primary* carrier — even when
   * its source XML lists several (a backup SCCP carrier, or anything past
   * index [0] of the GRX/IPX or LTE/Diameter arrays). A provider that's
   * only ever secondary for every MNO it touches would then never appear
   * in its own On-Net MNO Footprint, even though the Operator Detail page
   * (MnoService.resolveAllDeclaredProviders) correctly shows it in that
   * MNO's Comparison Grid — that mismatch is the bug this closes.
   *
   * Re-resolves every raw carrier string in MnoMasterConnectivity (primary
   * + backup SCCP, full GRX/IPX and LTE/Diameter arrays) against the same
   * alias cache ingestion uses, once, for every provider in a single pass —
   * the reverse of resolveAllDeclaredProviders (which starts from one MNO
   * and finds its providers; this starts from providers and finds their
   * MNOs), batched so computing this for many providers at once (e.g. the
   * whole Provider Search result list) still costs one table scan, not one
   * per provider. `providerIds`, when given, only narrows which providers'
   * results are kept — the scan itself is unavoidably full since any raw
   * string could resolve to any provider. Read-only, no side effects. */
  private async buildMultiHomedProviderIndex(providerIds?: number[]): Promise<MultiHomedProviderIndex> {
    const rows = await this.prisma.mnoMasterConnectivity.findMany({
      select: {
        mnoId: true,
        primarySccpCarrier: true,
        backupSccpCarriers: true,
        grxIpxProviders: true,
        lteIpxProviders: true,
        mno: { select: { operatorName: true, country: true, tadigCode: true } },
      },
    });

    const wanted = providerIds ? new Set(providerIds) : null;
    const index: MultiHomedProviderIndex = new Map();

    const mark = (providerId: number, service: ServiceName, mnoId: number, mno: { operatorName: string; country: string; tadigCode: string }) => {
      if (wanted && !wanted.has(providerId)) return;
      let byService = index.get(providerId);
      if (!byService) {
        byService = new Map();
        index.set(providerId, byService);
      }
      let byMno = byService.get(service);
      if (!byMno) {
        byMno = new Map();
        byService.set(service, byMno);
      }
      byMno.set(mnoId, mno);
    };

    for (const c of rows) {
      const checks: [ServiceName, (string | null)[]][] = [
        ["SCCP", [c.primarySccpCarrier, ...c.backupSccpCarriers]],
        ["DSX", c.lteIpxProviders],
        ["IPX", c.grxIpxProviders],
      ];
      for (const [service, candidates] of checks) {
        for (const raw of candidates) {
          if (!raw) continue;
          const normalized = this.providerResolver.normalize(raw);
          if (!normalized) continue;
          const providerId = this.providerResolver.matchAlias(normalized);
          if (providerId) mark(providerId, service, c.mnoId, c.mno);
        }
      }
    }

    return index;
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

    const [ir21Rows, reachRows, multiHomedIndex] = await Promise.all([
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
      includeIr21
        ? this.buildMultiHomedProviderIndex(providerIds)
        : Promise.resolve<MultiHomedProviderIndex>(new Map()),
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
    // Multi-homed catch-up — see buildMultiHomedProviderIndex.
    for (const [providerId, byService] of multiHomedIndex) {
      for (const [service, mnosForService] of byService) {
        for (const [mnoId, mno] of mnosForService) touch(providerId, mnoId, mno.country, service);
      }
    }

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
