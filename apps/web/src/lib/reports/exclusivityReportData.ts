import { getCountryName } from "@/lib/countries";
import type { MnoSummaryWithExclusivity } from "@/app/search/mno/page";

export interface ExclusivityReportInput {
  generatedAt: Date;
  scope: {
    datasetScope: string;
    region: string;
    exclusivityMode: string;
    serviceFilter: string;
    provider: string | null;
    search: string | null;
  };
  // Raw aggregation dimension (as opposed to scope.exclusivityMode's
  // human-readable label) -- drives which of the 5 aggregateCarrierExclusivity
  // definitions the report's carrier ranking and KPIs use, so the exported
  // report always matches whatever the on-screen Exclusivity Scope pill and
  // donut chart currently show.
  aggregationMode: ExclusivityAggregationMode;
  rows: MnoSummaryWithExclusivity[];
}

export interface CarrierExclusivityEntry {
  providerName: string;
  sccpExclusiveCount: number;
  dsxExclusiveCount: number;
  ipxExclusiveCount: number;
  // Sum of the three per-service counts above -- one MNO with all 3
  // services exclusive to the same carrier contributes 3 here, not 1.
  totalExclusiveAssignments: number;
  pctOfExclusiveAssignments: number;
  // Distinct MNO count touched by at least one exclusive assignment from
  // this carrier -- the "exclusive accounts" figure the report's KPI/roster
  // language uses, kept separate from totalExclusiveAssignments since an
  // MNO exclusive to the same carrier on 2+ services would otherwise be
  // double-counted here.
  exclusiveMnoCount: number;
}

// "full"/"sccp"/"dsx"/"ipx" scope the aggregation to exactly the matching
// pill's own definition (one MNO, one count, keyed by that dimension's own
// sole-provider field); "any" is the broader cross-service exclusivity
// view; "all" (the "All MNOs" pill -- no exclusivity filter at all) is the
// odd one out below, since it counts plain carrier *presence*, not
// exclusivity. Kept separate from the page's own ExclusiveMode ("shared"
// included) since that one doesn't correspond to a single aggregation
// dimension -- callers map it to "any" (see toAggregationMode in page.tsx).
export type ExclusivityAggregationMode = "all" | "full" | "sccp" | "dsx" | "ipx" | "any";

/** Per-carrier share, scoped to `mode`:
 * - "all": NOT an exclusivity measure at all -- counts every carrier that
 *   appears *anywhere* in a row's SCCP/DSX/IPX provider arrays, exclusive
 *   or shared, so this answers "who has the most overall market presence"
 *   for the unfiltered "All MNOs" pill, where an exclusivity-only view
 *   would silently exclude most of the market.
 * - "full": one count per MNO that's exclusive across its *entire*
 *   declared portfolio (isFullyExclusive), keyed by soleMasterProvider --
 *   matches the "Fully Exclusive" pill exactly.
 * - "sccp"/"dsx"/"ipx": one count per MNO exclusive on *that* service only,
 *   keyed by that service's own sole-provider field -- matches the
 *   corresponding "X Solo" pill exactly.
 * - "any" (default): counts every SCCP/DSX/IPX slot where a carrier is the
 *   sole declared provider, independently per service -- NOT just MNOs
 *   fully exclusive to one carrier. A carrier can be dominant on individual
 *   services while rarely being the literal sole provider across an MNO's
 *   *entire* portfolio at once (a large multi-service incumbent's typical
 *   shape), which the narrower single-dimension modes above would hide
 *   entirely when no scope is selected -- "any" is the "who actually holds
 *   exclusive service slots in this market overall" view.
 *
 * Every mode's `exclusiveMnoCount` is always a distinct-MNO count (never
 * double-counts one MNO across services); `totalExclusiveAssignments`
 * equals that same count for the single-dimension modes (including "all"),
 * and only exceeds it under "any" (where one MNO can contribute an
 * assignment on more than one service to the same carrier). */
export function aggregateCarrierExclusivity(
  rows: MnoSummaryWithExclusivity[],
  mode: ExclusivityAggregationMode = "any",
): CarrierExclusivityEntry[] {
  interface Acc {
    sccp: number;
    dsx: number;
    ipx: number;
    mnoIds: Set<number>;
  }
  const byProvider = new Map<string, Acc>();
  const getAcc = (providerName: string) => {
    let acc = byProvider.get(providerName);
    if (!acc) {
      acc = { sccp: 0, dsx: 0, ipx: 0, mnoIds: new Set<number>() };
      byProvider.set(providerName, acc);
    }
    return acc;
  };

  if (mode === "any") {
    for (const r of rows) {
      if (r.isExclusiveSccp && r.soleSccpProvider) {
        const acc = getAcc(r.soleSccpProvider);
        acc.sccp++;
        acc.mnoIds.add(r.id);
      }
      if (r.isExclusiveDsx && r.soleDsxProvider) {
        const acc = getAcc(r.soleDsxProvider);
        acc.dsx++;
        acc.mnoIds.add(r.id);
      }
      if (r.isExclusiveIpx && r.soleIpxProvider) {
        const acc = getAcc(r.soleIpxProvider);
        acc.ipx++;
        acc.mnoIds.add(r.id);
      }
    }
  } else if (mode === "all") {
    // Plain presence, not exclusivity -- every declared provider in every
    // service array counts, whether or not it's that service's sole
    // provider. Same three-array shape as "any" above (so the per-service
    // breakdown fields stay meaningful), just without the isExclusive*
    // gating.
    for (const r of rows) {
      for (const p of r.sccpProviders) {
        const acc = getAcc(p);
        acc.sccp++;
        acc.mnoIds.add(r.id);
      }
      for (const p of r.dsxProviders) {
        const acc = getAcc(p);
        acc.dsx++;
        acc.mnoIds.add(r.id);
      }
      for (const p of r.ipxProviders) {
        const acc = getAcc(p);
        acc.ipx++;
        acc.mnoIds.add(r.id);
      }
    }
  } else {
    for (const r of rows) {
      const qualifies = mode === "full" ? r.isFullyExclusive : mode === "sccp" ? r.isExclusiveSccp : mode === "dsx" ? r.isExclusiveDsx : r.isExclusiveIpx;
      if (!qualifies) continue;
      const key = mode === "full" ? r.soleMasterProvider : mode === "sccp" ? r.soleSccpProvider : mode === "dsx" ? r.soleDsxProvider : r.soleIpxProvider;
      if (!key) continue;
      const acc = getAcc(key);
      acc.mnoIds.add(r.id);
      // A qualifying MNO under a single-dimension mode is, by definition,
      // exclusive on every service that mode requires -- "full" means all
      // 3, "sccp"/"dsx"/"ipx" means that one -- so the per-service
      // breakdown fields stay factually accurate here too, not just a
      // single bucket standing in for the whole count.
      if (r.isExclusiveSccp && r.soleSccpProvider === key) acc.sccp++;
      if (r.isExclusiveDsx && r.soleDsxProvider === key) acc.dsx++;
      if (r.isExclusiveIpx && r.soleIpxProvider === key) acc.ipx++;
    }
  }

  const totalOf = (e: Acc) => (mode === "any" ? e.sccp + e.dsx + e.ipx : e.mnoIds.size);
  const grandTotal = Array.from(byProvider.values()).reduce((sum, e) => sum + totalOf(e), 0) || 1;
  return Array.from(byProvider.entries())
    .map(([providerName, e]) => {
      const totalExclusiveAssignments = totalOf(e);
      return {
        providerName,
        sccpExclusiveCount: e.sccp,
        dsxExclusiveCount: e.dsx,
        ipxExclusiveCount: e.ipx,
        totalExclusiveAssignments,
        pctOfExclusiveAssignments: (totalExclusiveAssignments / grandTotal) * 100,
        exclusiveMnoCount: e.mnoIds.size,
      };
    })
    .sort((a, b) => b.totalExclusiveAssignments - a.totalExclusiveAssignments);
}

export interface ExclusivityKpis {
  totalMnos: number;
  totalExclusiveMnos: number;
  exclusivityRatePct: number;
  topDominantCarrier: string | null;
  topDominantCarrierCount: number;
}

export function computeExclusivityKpis(rows: MnoSummaryWithExclusivity[], mode: ExclusivityAggregationMode = "any"): ExclusivityKpis {
  const totalMnos = rows.length;
  // "Fully Exclusive" stays the narrower full-portfolio definition, matching
  // the on-screen "Fully Exclusive" pill/badge exactly, regardless of `mode`
  // -- this headline figure is always "how locked-in is this MNO overall".
  const exclusive = rows.filter((r) => r.isFullyExclusive);
  // Top Dominant Carrier reflects whichever scope the caller is actually
  // looking at (the page's active Exclusivity Scope pill), so the exported
  // report's own headline never disagrees with the on-screen donut it was
  // generated from.
  const ranked = aggregateCarrierExclusivity(rows, mode);
  return {
    totalMnos,
    totalExclusiveMnos: exclusive.length,
    exclusivityRatePct: totalMnos > 0 ? (exclusive.length / totalMnos) * 100 : 0,
    topDominantCarrier: ranked[0]?.providerName ?? null,
    topDominantCarrierCount: ranked[0]?.exclusiveMnoCount ?? 0,
  };
}

export interface RosterRow {
  operatorName: string;
  tadigCode: string;
  country: string;
  region: string;
  sccpProvider: string;
  dsxProvider: string;
  ipxProvider: string;
  exclusivityStatus: "Single Provider" | "Multi-Provider";
  soleMasterProvider: string;
}

export function toRosterRows(rows: MnoSummaryWithExclusivity[]): RosterRow[] {
  return rows.map((r) => ({
    operatorName: r.operatorName,
    tadigCode: r.tadigCode,
    country: getCountryName(r.country),
    region: r.region ?? "Unspecified",
    sccpProvider: r.sccpProviders.join(", ") || "-",
    dsxProvider: r.dsxProviders.join(", ") || "-",
    ipxProvider: r.ipxProviders.join(", ") || "-",
    exclusivityStatus: r.isFullyExclusive ? "Single Provider" : "Multi-Provider",
    soleMasterProvider: r.soleMasterProvider ?? "-",
  }));
}

export function exclusivityReportFileBaseName(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `CCIP_Exclusivity_MIS_Report_${yyyy}${mm}${dd}`;
}
