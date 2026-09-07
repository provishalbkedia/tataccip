import { getCountryName } from "@/lib/countries";
import type { MnoSummaryWithExclusivity } from "@/app/search/mno/page";

export interface ExclusivityReportInput {
  generatedAt: Date;
  scope: {
    datasetScope: string;
    region: string;
    exclusivityMode: string;
    serviceFilter: string;
    search: string | null;
  };
  rows: MnoSummaryWithExclusivity[];
}

export interface CarrierExclusivityEntry {
  providerName: string;
  exclusiveMnoCount: number;
  pctOfExclusive: number;
  sccpExclusiveCount: number;
  dsxExclusiveCount: number;
  ipxExclusiveCount: number;
}

/** Per-carrier share of the fully-exclusive account base -- same
 * soleMasterProvider grouping the on-screen donut chart uses (see
 * ExclusivityCharts.tsx), plus a per-service exclusivity breakdown for
 * that same carrier (how many of its exclusive accounts are also
 * SCCP/DSX/IPX-solo specifically), matching the report spec's "% of
 * exclusive accounts, service-level exclusivity count" requirement. */
export function aggregateCarrierExclusivity(rows: MnoSummaryWithExclusivity[]): CarrierExclusivityEntry[] {
  const fullyExclusive = rows.filter((r) => r.isFullyExclusive && r.soleMasterProvider);
  const total = fullyExclusive.length || 1;
  const byProvider = new Map<string, MnoSummaryWithExclusivity[]>();
  for (const r of fullyExclusive) {
    const key = r.soleMasterProvider as string;
    const list = byProvider.get(key) ?? [];
    list.push(r);
    byProvider.set(key, list);
  }
  return Array.from(byProvider.entries())
    .map(([providerName, list]) => ({
      providerName,
      exclusiveMnoCount: list.length,
      pctOfExclusive: (list.length / total) * 100,
      sccpExclusiveCount: list.filter((r) => r.isExclusiveSccp).length,
      dsxExclusiveCount: list.filter((r) => r.isExclusiveDsx).length,
      ipxExclusiveCount: list.filter((r) => r.isExclusiveIpx).length,
    }))
    .sort((a, b) => b.exclusiveMnoCount - a.exclusiveMnoCount);
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
  const exclusive = rows.filter((r) => r.isFullyExclusive);
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
