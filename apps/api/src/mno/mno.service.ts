import { Injectable, NotFoundException } from "@nestjs/common";
import { ServiceName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { isConfidentSubstringMatch, normalizeCarrierName } from "../upload/provider-normalize";
import { ProviderResolverService } from "../upload/provider-resolver.service";
import { SupabaseStorageService } from "../upload/supabase-storage.service";
import {
  ConnectivityMatrixRow,
  Ir21DeclaredProvider,
  MnoDetail,
  MnoSuggestion,
  MnoSummary,
  OperatorCompareMatrixProviderRow,
  OperatorCompareMatrixResponse,
  ProviderResolutionInfo,
} from "@ccip/shared-types";

const SUGGESTION_LIMIT = 10;
// Suggestions are re-ranked by relevance in JS (see operatorMatchRank), not
// by the DB's alphabetical order — so a plain `take: SUGGESTION_LIMIT` at
// the query level would risk cutting off a highly-relevant match (e.g.
// "Etisalat Egypt") in favor of an earlier-alphabetically but less relevant
// one. Over-fetch this many candidates first, rank, then slice down.
const SUGGESTION_CANDIDATE_POOL = 50;

const SERVICE_ORDER: ServiceName[] = ["SCCP", "DSX", "IPX"];

type ProvidersByService = { SCCP: Set<string>; DSX: Set<string>; IPX: Set<string> };

function newProvidersByService(): ProvidersByService {
  return { SCCP: new Set(), DSX: new Set(), IPX: new Set() };
}

/** Ranks how a row matched a free-text search term, lowest number wins —
 * operator identity (name, then TADIG, then name-substring, then country/
 * MCC-MNC) always outranks a match that only came from connected-carrier
 * text (SCCP/GRX-IPX/LTE-Diameter provider names) or anything else, so
 * e.g. searching "etis" surfaces Etisalat's own MNOs before operators that
 * merely list Etisalat as a transit carrier. */
function operatorMatchRank(
  query: string,
  row: { operatorName: string; tadigCode: string; country: string; mccMncList?: string[] },
): number {
  const q = query.toLowerCase();
  const name = row.operatorName.toLowerCase();
  if (name.startsWith(q)) return 1;
  if (row.tadigCode.toLowerCase().startsWith(q)) return 2;
  if (name.includes(q)) return 3;
  const mccMncHit = row.mccMncList?.some((m) => m.toLowerCase().startsWith(q)) ?? false;
  if (row.country.toLowerCase().startsWith(q) || mccMncHit) return 4;
  return 5;
}

@Injectable()
export class MnoService {
  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
    private providerResolver: ProviderResolverService,
  ) {}

  /** Searches MnoMaster (the canonical operator identity table — every MNO
   * the platform knows about, from any ingestion path) enriched with
   * MnoMasterConnectivity where an IR.21 XML has been ingested for it. MNOs
   * without a connectivity snapshot yet still appear, with networkType/
   * lastEffectiveDate null, rather than disappearing from search until
   * someone uploads their XML — the connectivity table is an enrichment
   * layer, not the operator registry. The consolidated SCCP/DSX/IPX
   * Provider(s) columns, however, come from resolved Ir21Connectivity +
   * ProviderReachlist (canonical ProviderMaster names) rather than the raw
   * XML snapshot text — an MNO whose connectivity only ever came through a
   * Reach List upload (or seed data) has no MnoMasterConnectivity row at
   * all, but still has real resolved provider data that needs to show up
   * here exactly as it does on the detail page's comparison grid. `q`
   * free-text matches across TADIG/operator/country plus the XML-sourced
   * networkType, primarySccpCarrier, backupSccpCarriers, and the GRX/IPX/
   * LTE provider name arrays (via a raw substring-on-array-element query —
   * Prisma's array filters only support exact-element matches). */
  async search(params: { q?: string; tadig?: string; country?: string; mcc?: string; mnc?: string }): Promise<MnoSummary[]> {
    const { q, tadig, country, mcc, mnc } = params;

    let arrayMatchMnoIds: number[] = [];
    if (q) {
      const rows = await this.prisma.$queryRaw<{ mnoId: number }[]>`
        SELECT "mnoId" FROM "MnoMasterConnectivity"
        WHERE EXISTS (SELECT 1 FROM unnest("mccMncList") x WHERE x ILIKE ${"%" + q + "%"})
           OR EXISTS (SELECT 1 FROM unnest("grxIpxProviders") x WHERE x ILIKE ${"%" + q + "%"})
           OR EXISTS (SELECT 1 FROM unnest("lteIpxProviders") x WHERE x ILIKE ${"%" + q + "%"})
           OR EXISTS (SELECT 1 FROM unnest("backupSccpCarriers") x WHERE x ILIKE ${"%" + q + "%"})
      `;
      arrayMatchMnoIds = rows.map((r) => r.mnoId);
    }

    const rows = await this.prisma.mnoMaster.findMany({
      where: {
        AND: [
          q
            ? {
                OR: [
                  { operatorName: { contains: q, mode: "insensitive" } },
                  { tadigCode: { contains: q, mode: "insensitive" } },
                  { country: { contains: q, mode: "insensitive" } },
                  { connectivity: { networkType: { contains: q, mode: "insensitive" } } },
                  { connectivity: { primarySccpCarrier: { contains: q, mode: "insensitive" } } },
                  ...(arrayMatchMnoIds.length > 0 ? [{ id: { in: arrayMatchMnoIds } }] : []),
                ],
              }
            : {},
          tadig ? { tadigCode: { contains: tadig, mode: "insensitive" } } : {},
          country ? { country: { contains: country, mode: "insensitive" } } : {},
          mcc ? { mcc } : {},
          mnc ? { mnc } : {},
        ],
      },
      include: { connectivity: true },
      orderBy: { operatorName: "asc" },
    });

    // Relevance-ranked when there's a free-text query — the alphabetical
    // DB order above stays as-is otherwise (and doubles as the tie-breaker
    // within a rank tier here, since Array.sort is stable).
    const orderedRows = q
      ? [...rows].sort(
          (a, b) =>
            operatorMatchRank(q, { operatorName: a.operatorName, tadigCode: a.tadigCode, country: a.country, mccMncList: a.connectivity?.mccMncList }) -
            operatorMatchRank(q, { operatorName: b.operatorName, tadigCode: b.tadigCode, country: b.country, mccMncList: b.connectivity?.mccMncList }),
        )
      : rows;

    const mnoIds = rows.map((r) => r.id);
    const providersByMno = await this.resolvedProvidersByMno(mnoIds);

    return orderedRows.map((r) => {
      const p = providersByMno.get(r.id);
      return {
        id: r.id,
        operatorName: r.operatorName,
        country: r.country,
        tadigCode: r.tadigCode,
        mcc: r.mcc,
        mnc: r.mnc,
        status: r.status,
        networkType: r.connectivity?.networkType ?? null,
        sccpProviders: p ? Array.from(p.SCCP) : [],
        dsxProviders: p ? Array.from(p.DSX) : [],
        ipxProviders: p ? Array.from(p.IPX) : [],
        lastEffectiveDate: r.connectivity?.lastEffectiveDate?.toISOString() ?? null,
        hasPdfDocument: r.connectivity?.hasPdfDocument ?? false,
      };
    });
  }

  /** Lightweight matches for the Operator Search autocomplete — fetched on
   * every keystroke (debounced client-side), so this stays a single small
   * query rather than the full search() join. */
  async suggestions(q: string): Promise<MnoSuggestion[]> {
    if (!q.trim()) return [];
    const rows = await this.prisma.mnoMaster.findMany({
      where: {
        OR: [
          { operatorName: { contains: q, mode: "insensitive" } },
          { tadigCode: { contains: q, mode: "insensitive" } },
          { country: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, operatorName: true, tadigCode: true, country: true },
      orderBy: { operatorName: "asc" },
      take: SUGGESTION_CANDIDATE_POOL,
    });
    return [...rows]
      .sort((a, b) => operatorMatchRank(q, a) - operatorMatchRank(q, b))
      .slice(0, SUGGESTION_LIMIT);
  }

  /** Canonical (resolved) provider names per service for a batch of MNOs,
   * merging Ir21Connectivity and ProviderReachlist — the authoritative
   * source for "which provider(s) serve this MNO", independent of whether
   * an actual IR.21 XML was ever uploaded (MnoMasterConnectivity is XML-
   * only, so it's null for reach-list-only or seeded MNOs). */
  private async resolvedProvidersByMno(mnoIds: number[]): Promise<Map<number, ProvidersByService>> {
    if (mnoIds.length === 0) return new Map();

    const [ir21Rows, reachRows] = await Promise.all([
      this.prisma.ir21Connectivity.findMany({
        where: { mnoId: { in: mnoIds } },
        select: { mnoId: true, service: { select: { serviceName: true } }, provider: { select: { providerName: true } } },
      }),
      this.prisma.providerReachlist.findMany({
        where: { mnoId: { in: mnoIds } },
        select: { mnoId: true, service: { select: { serviceName: true } }, provider: { select: { providerName: true } } },
      }),
    ]);

    const byMno = new Map<number, ProvidersByService>();
    const touch = (mnoId: number, service: ServiceName, providerName: string) => {
      let p = byMno.get(mnoId);
      if (!p) {
        p = newProvidersByService();
        byMno.set(mnoId, p);
      }
      p[service].add(providerName);
    };
    for (const r of ir21Rows) touch(r.mnoId, r.service.serviceName, r.provider.providerName);
    for (const r of reachRows) touch(r.mnoId, r.service.serviceName, r.provider.providerName);
    return byMno;
  }

  async detail(id: number): Promise<MnoDetail> {
    const mno = await this.prisma.mnoMaster.findUnique({
      where: { id },
      include: {
        ir21Entries: { include: { service: true, provider: true } },
        reachlistEntries: { include: { service: true, provider: true } },
        connectivity: true,
      },
    });
    if (!mno) throw new NotFoundException("MNO not found");

    const providers = newProvidersByService();
    for (const e of mno.ir21Entries) providers[e.service.serviceName].add(e.provider.providerName);
    for (const e of mno.reachlistEntries) providers[e.service.serviceName].add(e.provider.providerName);

    const matrix: ConnectivityMatrixRow[] = await Promise.all(
      SERVICE_ORDER.map(async (service) => {
        const ir21 = mno.ir21Entries.find((e) => e.service.serviceName === service);
        const reach = mno.reachlistEntries.filter((e) => e.service.serviceName === service);
        const candidates = this.rawCandidatesFor(service, mno.connectivity);
        return {
          service,
          ir21Provider: ir21?.provider.providerName ?? null,
          ir21Providers: await this.resolveAllDeclaredProviders(candidates, ir21?.providerId ?? null),
          reachlistProviders: reach.map((r) => r.provider.providerName),
          ir21ProviderResolution: ir21 ? await this.resolveProvenance(ir21.providerId, candidates) : null,
        };
      }),
    );

    return {
      id: mno.id,
      operatorName: mno.operatorName,
      country: mno.country,
      tadigCode: mno.tadigCode,
      mcc: mno.mcc,
      mnc: mno.mnc,
      status: mno.status,
      networkType: mno.connectivity?.networkType ?? null,
      sccpProviders: Array.from(providers.SCCP),
      dsxProviders: Array.from(providers.DSX),
      ipxProviders: Array.from(providers.IPX),
      lastEffectiveDate: mno.connectivity?.lastEffectiveDate?.toISOString() ?? null,
      hasPdfDocument: mno.connectivity?.hasPdfDocument ?? false,
      connectivityMatrix: matrix,
      connectivitySnapshot: mno.connectivity
        ? {
            networkType: mno.connectivity.networkType,
            mccMncList: mno.connectivity.mccMncList,
            primarySccpCarrier: mno.connectivity.primarySccpCarrier,
            backupSccpCarriers: mno.connectivity.backupSccpCarriers,
            sccpPointCodes: mno.connectivity.sccpPointCodes,
            grxIpxProviders: mno.connectivity.grxIpxProviders,
            lteIpxProviders: mno.connectivity.lteIpxProviders,
            interPmnIpRanges: mno.connectivity.interPmnIpRanges,
            diameterEdgeAgentFqdn: mno.connectivity.diameterEdgeAgentFqdn,
            authoritativeDnsIps: mno.connectivity.authoritativeDnsIps,
            epcRealms: mno.connectivity.epcRealms,
            roamingCoordinatorEmail: mno.connectivity.roamingCoordinatorEmail,
            ts24x7Email: mno.connectivity.ts24x7Email,
            distributionEmail: mno.connectivity.distributionEmail,
            xmlFileVersion: mno.connectivity.xmlFileVersion,
            lastEffectiveDate: mno.connectivity.lastEffectiveDate?.toISOString() ?? null,
            lastParsedAt: mno.connectivity.lastParsedAt.toISOString(),
          }
        : null,
    };
  }

  /** Multi-operator side-by-side connectivity comparison (2-5 operators) —
   * one row per canonical provider connected to ANY selected operator, per
   * service, with each operator's IR.21-declared / Reach-List-claimed
   * status nested under its id. Reuses resolveAllDeclaredProviders so a
   * provider shows up here even when it's not the single one
   * Ir21Connectivity happens to store for that (MNO, service) — same fix
   * as the Operator Detail Comparison Grid, applied here too so this new
   * matrix doesn't reintroduce that bug. Powers /search/mno/compare. */
  async compareMatrix(mnoIds: number[]): Promise<OperatorCompareMatrixResponse> {
    const mnos = await this.prisma.mnoMaster.findMany({
      where: { id: { in: mnoIds } },
      include: { connectivity: true, ir21Entries: { include: { service: true } } },
    });

    const reachRows = await this.prisma.providerReachlist.findMany({
      where: { mnoId: { in: mnoIds } },
      include: { provider: true, service: true },
    });

    type RowAcc = {
      providerName: string;
      operatorStatus: Map<number, { ir21Declared: boolean; reachListClaimed: boolean; rawDeclaredString?: string }>;
    };
    const byService: Record<ServiceName, Map<number, RowAcc>> = { SCCP: new Map(), DSX: new Map(), IPX: new Map() };

    const touch = (
      service: ServiceName,
      providerId: number,
      providerName: string,
      mnoId: number,
      patch: Partial<{ ir21Declared: boolean; reachListClaimed: boolean; rawDeclaredString: string }>,
    ) => {
      const rows = byService[service];
      let row = rows.get(providerId);
      if (!row) {
        row = { providerName, operatorStatus: new Map() };
        rows.set(providerId, row);
      }
      const existing = row.operatorStatus.get(mnoId) ?? { ir21Declared: false, reachListClaimed: false };
      row.operatorStatus.set(mnoId, { ...existing, ...patch });
    };

    for (const service of SERVICE_ORDER) {
      for (const mno of mnos) {
        const ir21Entry = mno.ir21Entries.find((e) => e.service.serviceName === service);
        const candidates = this.rawCandidatesFor(service, mno.connectivity);
        const declared = await this.resolveAllDeclaredProviders(candidates, ir21Entry?.providerId ?? null);
        for (const d of declared) {
          touch(service, d.id, d.name, mno.id, { ir21Declared: true, rawDeclaredString: d.rawDeclaredString || undefined });
        }
      }
    }

    for (const r of reachRows) {
      touch(r.service.serviceName, r.providerId, r.provider.providerName, r.mnoId, { reachListClaimed: true });
    }

    const toArray = (rows: Map<number, RowAcc>): OperatorCompareMatrixProviderRow[] =>
      Array.from(rows.entries())
        .map(([providerId, row]) => ({
          providerId,
          providerName: row.providerName,
          operatorStatus: Object.fromEntries(row.operatorStatus),
        }))
        .sort((a, b) => a.providerName.localeCompare(b.providerName));

    return {
      operators: mnos.map((m) => ({
        id: m.id,
        operatorName: m.operatorName,
        country: m.country,
        tadigCode: m.tadigCode,
        mccMncList: m.connectivity?.mccMncList ?? [],
        hasPdfDocument: m.connectivity?.hasPdfDocument ?? false,
      })),
      matrix: {
        sccp: toArray(byService.SCCP),
        dsx: toArray(byService.DSX),
        ipx: toArray(byService.IPX),
      },
    };
  }

  /** Fetches the official IR.21 PDF paired with this MNO's XML at ingestion
   * time (see UploadService.matchPdfForTadig), streamed from Supabase
   * Storage. Throws if no PDF was ever paired for this MNO. */
  async getPdf(id: number): Promise<{ buffer: Buffer; fileName: string }> {
    const connectivity = await this.prisma.mnoMasterConnectivity.findUnique({ where: { mnoId: id } });
    if (!connectivity?.hasPdfDocument || !connectivity.pdfStoragePath) {
      throw new NotFoundException("No IR.21 PDF is available for this operator");
    }
    const buffer = await this.storage.download(connectivity.pdfStoragePath);
    return { buffer, fileName: connectivity.pdfFileName ?? `${connectivity.tadigCode}.pdf` };
  }

  /** The raw (unresolved) declared strings that could have fed a given
   * service's Ir21Connectivity row, per the SCCP/DSX/IPX consolidation
   * convention (dsxProviders <- lteIpxProviders, ipxProviders <-
   * grxIpxProviders) — see MnoSummary. */
  private rawCandidatesFor(
    service: ServiceName,
    connectivity: { primarySccpCarrier: string | null; backupSccpCarriers: string[]; grxIpxProviders: string[]; lteIpxProviders: string[] } | null,
  ): string[] {
    if (!connectivity) return [];
    if (service === "SCCP") return [connectivity.primarySccpCarrier, ...connectivity.backupSccpCarriers].filter((v): v is string => !!v);
    if (service === "DSX") return connectivity.lteIpxProviders;
    if (service === "IPX") return connectivity.grxIpxProviders;
    return [];
  }

  /** Resolves EVERY raw declared string for a service — not just the single
   * one Ir21Connectivity stores, since it's unique per (mnoId, serviceId)
   * by design (GSMA IR.21 is one MNO's single published truth per service —
   * see schema.prisma) even when the source XML declares several carriers
   * (e.g. THAWN's 8-9 GRX/IPX providers). Read-only, using the same
   * in-memory alias cache ingestion uses (ProviderResolverService.
   * matchAlias) — doesn't touch Ir21Connectivity or queue anything as
   * unmapped, purely for the Operator Detail Comparison Grid's display.
   * Multiple raw strings resolving to the same provider (e.g. "BICS" and
   * "Belgacom") collapse into one entry. The provider actually stored in
   * Ir21Connectivity is always included and flagged isPrimary — even if it
   * came from an admin override rather than matching any of these raw
   * strings, so the Comparison Grid never drops it. */
  private async resolveAllDeclaredProviders(
    candidateRawStrings: string[],
    currentIr21ProviderId: number | null,
  ): Promise<Ir21DeclaredProvider[]> {
    const rawByProviderId = new Map<number, string>();
    for (const raw of candidateRawStrings) {
      const normalized = this.providerResolver.normalize(raw);
      if (!normalized) continue;
      const providerId = this.providerResolver.matchAlias(normalized);
      if (providerId && !rawByProviderId.has(providerId)) rawByProviderId.set(providerId, raw);
    }
    if (currentIr21ProviderId && !rawByProviderId.has(currentIr21ProviderId)) {
      rawByProviderId.set(currentIr21ProviderId, "");
    }
    if (rawByProviderId.size === 0) return [];

    const providers = await this.prisma.providerMaster.findMany({
      where: { id: { in: Array.from(rawByProviderId.keys()) } },
    });
    const nameById = new Map(providers.map((p) => [p.id, p.providerName]));

    return Array.from(rawByProviderId.entries()).map(([id, rawDeclaredString]) => ({
      id,
      name: nameById.get(id) ?? String(id),
      rawDeclaredString,
      isPrimary: currentIr21ProviderId === id,
    }));
  }

  /** Given the provider a service resolved to and the candidate raw strings
   * that could have produced it, finds which of those raw strings actually
   * match (via the same normalize+substring logic ingestion uses) and
   * whether an alias — as opposed to the provider's own literal name — did
   * the matching. Powers the "why does this show BICS" audit view. */
  private async resolveProvenance(providerId: number, candidateRawStrings: string[]): Promise<ProviderResolutionInfo | null> {
    const provider = await this.prisma.providerMaster.findUnique({ where: { id: providerId } });
    if (!provider) return null;

    const ownPattern = normalizeCarrierName(provider.providerName);
    const aliases = await this.prisma.providerAlias.findMany({ where: { providerId } });

    const rawDeclaredStrings: string[] = [];
    let resolvedViaAlias: string | null = null;
    for (const raw of candidateRawStrings) {
      const normalized = normalizeCarrierName(raw);
      if (isConfidentSubstringMatch(normalized, ownPattern)) {
        rawDeclaredStrings.push(raw);
        continue;
      }
      const alias = aliases.find((a) => isConfidentSubstringMatch(normalized, a.aliasPattern));
      if (alias) {
        rawDeclaredStrings.push(raw);
        resolvedViaAlias ??= alias.aliasPattern;
      }
    }

    return {
      canonicalProviderId: provider.id,
      canonicalProviderName: provider.providerName,
      rawDeclaredStrings: Array.from(new Set(rawDeclaredStrings)),
      resolvedViaAlias,
    };
  }
}
