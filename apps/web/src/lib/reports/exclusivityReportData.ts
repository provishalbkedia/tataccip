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

/** Per-carrier share of exclusive service assignments -- counts every
 * SCCP/DSX/IPX slot where a carrier is the sole declared provider,
 * independently per service, NOT just MNOs where that carrier is exclusive
 * across the *entire* portfolio (isFullyExclusive). That narrower
 * full-portfolio definition was the original basis for this aggregation
 * and for the on-screen donut chart, and it silently under-counts (or
 * fully hides) any carrier that is dominant on individual services but
 * rarely the literal sole provider across all of an MNO's declared
 * services at once -- exactly the shape a large multi-service incumbent
 * carrier's real footprint tends to take. "Fully Exclusive" MNOs/rate
 * stays its own distinct, correctly narrower metric in
 * computeExclusivityKpis and the on-screen "Fully Exclusive" badge --
 * this function is deliberately the broader "who actually holds exclusive
 * service slots in this market" view instead. */
export function aggregateCarrierExclusivity(rows: MnoSummaryWithExclusivity[]): CarrierExclusivityEntry[] {
  interface Acc {
    sccp: number;
    dsx: number;
    ipx: number;
    mnoIds: Set<number>;
  }
  const byProvider = new Map<string, Acc>();
  const bump = (providerName: string | null, field: "sccp" | "dsx" | "ipx", mnoId: number) => {
    if (!providerName) return;
    const acc = byProvider.get(providerName) ?? { sccp: 0, dsx: 0, ipx: 0, mnoIds: new Set<number>() };
    acc[field]++;
    acc.mnoIds.add(mnoId);
    byProvider.set(providerName, acc);
  };
  for (const r of rows) {
    if (r.isExclusiveSccp) bump(r.soleSccpProvider, "sccp", r.id);
    if (r.isExclusiveDsx) bump(r.soleDsxProvider, "dsx", r.id);
    if (r.isExclusiveIpx) bump(r.soleIpxProvider, "ipx", r.id);
  }
  const grandTotal = Array.from(byProvider.values()).reduce((sum, e) => sum + e.sccp + e.dsx + e.ipx, 0) || 1;
  return Array.from(byProvider.entries())
    .map(([providerName, e]) => {
      const totalExclusiveAssignments = e.sccp + e.dsx + e.ipx;
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

export function computeExclusivityKpis(rows: MnoSummaryWithExclusivity[]): ExclusivityKpis {
  const totalMnos = rows.length;
  // "Fully Exclusive" stays the narrower full-portfolio definition, matching
  // the on-screen "Fully Exclusive" pill/badge exactly -- unlike
  // aggregateCarrierExclusivity above, this KPI is deliberately NOT broadened.
  const exclusive = rows.filter((r) => r.isFullyExclusive);
  // Top Dominant Carrier uses the broader per-service ranking, since "which
  // carrier actually dominates this market" is better answered by real
  // exclusive-slot count than by the much rarer full-portfolio case.
  const ranked = aggregateCarrierExclusivity(rows);
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
