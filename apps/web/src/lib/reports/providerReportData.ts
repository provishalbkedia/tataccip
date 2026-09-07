import { ProviderStatsSource, ProviderSummary } from "@ccip/shared-types";

// Same reasoning as ProviderCoverageCharts.tsx's own HOME_CARRIER -- this is
// Tata Communications' own CCIP, so every report format surfaces Tata
// Comm's own standing explicitly rather than leaving it to wherever it
// happens to rank.
export const HOME_CARRIER = "Tata Comm";

const SOURCE_SCOPE_LABEL: Record<ProviderStatsSource, string> = {
  [ProviderStatsSource.IR21]: "As per IR.21 Data",
  [ProviderStatsSource.REACH_LIST]: "As per Reach List",
  [ProviderStatsSource.BOTH]: "Both (Combined)",
};

export interface ProviderReportInput {
  generatedAt: Date;
  scope: {
    source: ProviderStatsSource;
    search: string | null;
  };
  // Deduped (one entry per provider even in "Both (Combined)" mode) and
  // ranked descending by stats.totalMnos -- the same list the page's own
  // charts and Quick Benchmark Shortcuts already consume, so every report
  // format matches exactly what's on screen when it was generated.
  rankedProviders: ProviderSummary[];
}

export function scopeLineFor(input: ProviderReportInput): string {
  return `Dataset: ${SOURCE_SCOPE_LABEL[input.scope.source]}` + (input.scope.search ? `  |  Search: "${input.scope.search}"` : "");
}

export interface ProviderReportKpis {
  totalProviders: number;
  totalMnoRelationships: number;
  broadestReachProvider: string | null;
  broadestReachCount: number;
  homeCarrierRank: number | null;
  homeCarrierMnoCount: number | null;
}

export function computeProviderReportKpis(rankedProviders: ProviderSummary[]): ProviderReportKpis {
  const totalMnoRelationships = rankedProviders.reduce((sum, p) => sum + p.stats.totalMnos, 0);
  const top = rankedProviders[0] ?? null;
  const homeCarrierIndex = rankedProviders.findIndex((p) => p.providerName === HOME_CARRIER);
  return {
    totalProviders: rankedProviders.length,
    totalMnoRelationships,
    broadestReachProvider: top?.providerName ?? null,
    broadestReachCount: top?.stats.totalMnos ?? 0,
    homeCarrierRank: homeCarrierIndex >= 0 ? homeCarrierIndex + 1 : null,
    homeCarrierMnoCount: homeCarrierIndex >= 0 ? rankedProviders[homeCarrierIndex].stats.totalMnos : null,
  };
}

export interface ServiceMixEntry {
  service: string;
  label: string;
  count: number;
}

export function computeServiceMix(rankedProviders: ProviderSummary[]): ServiceMixEntry[] {
  const totals = rankedProviders.reduce(
    (acc, p) => ({
      sccp: acc.sccp + p.stats.sccpCount,
      dsx: acc.dsx + p.stats.dsxCount,
      ipx: acc.ipx + p.stats.ipxCount,
    }),
    { sccp: 0, dsx: 0, ipx: 0 },
  );
  return [
    { service: "SCCP", label: "SCCP Relationships", count: totals.sccp },
    { service: "DSX", label: "DSX Relationships", count: totals.dsx },
    { service: "IPX", label: "IPX Relationships", count: totals.ipx },
  ];
}

export interface ProviderRosterRow {
  rank: number;
  providerName: string;
  providerType: string;
  headquarters: string;
  totalMnos: number;
  totalCountries: number;
  sccpCount: number;
  dsxCount: number;
  ipxCount: number;
}

export function toProviderRosterRows(rankedProviders: ProviderSummary[]): ProviderRosterRow[] {
  return rankedProviders.map((p, i) => ({
    rank: i + 1,
    providerName: p.providerName,
    providerType: p.providerType ?? "-",
    headquarters: p.headquarters ?? "-",
    totalMnos: p.stats.totalMnos,
    totalCountries: p.stats.totalCountries,
    sccpCount: p.stats.sccpCount,
    dsxCount: p.stats.dsxCount,
    ipxCount: p.stats.ipxCount,
  }));
}

export function providerReportFileBaseName(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `CCIP_Provider_Coverage_MIS_Report_${yyyy}${mm}${dd}`;
}
