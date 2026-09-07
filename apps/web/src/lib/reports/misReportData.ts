import { CARRIER_CHURN_TYPES, Ir21RoutingChangeRow, Ir21RoutingChangeSummary, RoutingChangeType } from "@ccip/shared-types";
import { getCountryName } from "@/lib/countries";

/** CCIP's actual brand palette (apps/web/src/lib/theme.ts), reused here so
 * a generated report looks like it came from the same product as the live
 * screen it was exported from, not a generic export tool. */
export const REPORT_COLORS = {
  navy: "#0A2540",
  navyLight: "#1C3A5E",
  teal: "#00D4B2",
  blue: "#0B6FBF",
  softGray: "#F4F6F8",
  border: "#E1E6EB",
  textSecondary: "#5A6B7B",
  success: "#2E7D32",
  danger: "#C62828",
  warning: "#EF6C00",
  white: "#FFFFFF",
};

// Same 5 region colors REGION_CHIP_COLOR uses on-screen (ir21-changes/page.tsx)
// -- a reader who has the live page open recognizes the report's regional
// chart colors as the exact same ones, not a re-invented palette.
export const REGION_COLORS: Record<string, string> = {
  Americas: "#0B6FBF",
  MEA: "#EF6C00",
  Europe: "#6A1B9A",
  APAC: "#00796B",
  "Non-Terrestrial": "#616161",
  Unspecified: "#9AA5B1",
};

export const SERVICE_COLORS: Record<string, string> = {
  SCCP: REPORT_COLORS.navy,
  DSX: REPORT_COLORS.teal,
  IPX: REPORT_COLORS.blue,
};

export const CHANGE_TYPE_REPORT_COLOR: Record<RoutingChangeType, string> = {
  ADDED: REPORT_COLORS.success,
  REMOVED: REPORT_COLORS.danger,
  REPLACED: REPORT_COLORS.warning,
  IP_SUBNET_UPDATE: REPORT_COLORS.blue,
  DIAMETER_REALM_UPDATE: REPORT_COLORS.blue,
  POINT_CODE_GT_UPDATE: REPORT_COLORS.blue,
  ADMIN_NAME_UPDATE: REPORT_COLORS.textSecondary,
};

/** Everything a report generator (PDF, Excel, or CSV) needs, assembled once
 * by the page from its own already-fetched state -- report modules stay
 * framework- and page-agnostic, taking plain data and human-readable scope
 * labels rather than reaching back into page.tsx's filter state directly. */
export interface MisReportInput {
  generatedAt: Date;
  scope: {
    timeframe: string;
    region: string;
    service: string;
    changeCategory: string;
    provider: string | null;
    search: string | null;
  };
  // KPI dashboard values mirror exactly what the on-screen KPI cards show
  // (their own Timeframe/Region/Service-only scope) -- summary is whatever
  // the page's own summary fetch last returned, independent of the finer
  // Change/Provider/Search narrowing applied to `rows` below.
  summary: Ir21RoutingChangeSummary | null;
  // The fully filtered dataset behind the on-screen table -- every row
  // matching the current Timeframe/Region/Service/Change/Provider/Search
  // scope, not just the current grid page.
  rows: Ir21RoutingChangeRow[];
}

export interface CarrierMovementEntry {
  providerName: string;
  gains: number;
  losses: number;
  net: number;
}

/** Net wins/losses per wholesale carrier within the current export scope --
 * only ADDED/REPLACED/REMOVED rows carry a real carrier gain or loss, so a
 * technical/admin-only scope (e.g. the "IP & Subnets" pill) correctly
 * produces an empty chart rather than a misleading one. */
export function aggregateCarrierMovement(rows: Ir21RoutingChangeRow[]): CarrierMovementEntry[] {
  const churnTypes = new Set<string>(CARRIER_CHURN_TYPES);
  const byProvider = new Map<string, { gains: number; losses: number }>();
  const bump = (name: string | null, field: "gains" | "losses") => {
    if (!name) return;
    const entry = byProvider.get(name) ?? { gains: 0, losses: 0 };
    entry[field]++;
    byProvider.set(name, entry);
  };
  for (const r of rows) {
    if (!churnTypes.has(r.changeType)) continue;
    if (r.newProviderName) bump(r.newProviderName, "gains");
    if (r.oldProviderName) bump(r.oldProviderName, "losses");
  }
  return Array.from(byProvider.entries())
    .map(([providerName, { gains, losses }]) => ({ providerName, gains, losses, net: gains - losses }))
    .sort((a, b) => b.net - a.net || b.gains - a.gains);
}

export interface BreakdownEntry {
  label: string;
  count: number;
  pct: number;
}

function breakdownBy(rows: Ir21RoutingChangeRow[], keyOf: (r: Ir21RoutingChangeRow) => string | null, fallback: string): BreakdownEntry[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = keyOf(r) || fallback;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = rows.length || 1;
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count, pct: (count / total) * 100 }))
    .sort((a, b) => b.count - a.count);
}

export function aggregateByService(rows: Ir21RoutingChangeRow[]): BreakdownEntry[] {
  return breakdownBy(rows, (r) => r.serviceName, "Unspecified");
}

export function aggregateByRegion(rows: Ir21RoutingChangeRow[]): BreakdownEntry[] {
  return breakdownBy(rows, (r) => r.region, "Unspecified");
}

const NON_CARRIER_CHANGE_TYPES = new Set<RoutingChangeType>(["IP_SUBNET_UPDATE", "DIAMETER_REALM_UPDATE", "POINT_CODE_GT_UPDATE", "ADMIN_NAME_UPDATE"]);

/** Same "what actually changed" text the on-screen Routing Modification
 * Details column shows (DetailsCell in page.tsx) -- kept as its own
 * function here so every report format renders the identical sentence. */
export function carrierMovementDetail(row: Ir21RoutingChangeRow): string {
  if (NON_CARRIER_CHANGE_TYPES.has(row.changeType)) return row.description ?? "-";
  if (row.changeType === "REPLACED") return `${row.oldProviderName ?? "-"} -> ${row.newProviderName ?? "-"}`;
  if (row.changeType === "ADDED") return `+ ${row.newProviderName ?? "-"}`;
  return `- ${row.oldProviderName ?? "-"}`;
}

export interface LedgerRow {
  date: string;
  region: string;
  country: string;
  mnoName: string;
  tadigCode: string;
  service: string;
  changeType: RoutingChangeType;
  changeLabel: string;
  detail: string;
  source: string;
}

export function toLedgerRows(rows: Ir21RoutingChangeRow[]): LedgerRow[] {
  return rows.map((r) => ({
    date: new Date(r.effectiveDate).toISOString().slice(0, 10),
    region: r.region ?? "Unspecified",
    country: getCountryName(r.country),
    mnoName: r.mnoName,
    tadigCode: r.tadigCode,
    service: r.serviceName,
    changeType: r.changeType,
    changeLabel: r.changeType,
    detail: carrierMovementDetail(r),
    source: r.changeSource === "CHANGE_HISTORY" ? "IR.21 ChangeHistory" : "Live Diff",
  }));
}

export function reportFileBaseName(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `CCIP_Market_Intelligence_MIS_Report_${yyyy}${mm}${dd}`;
}

export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
