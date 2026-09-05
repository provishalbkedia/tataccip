// Modeled as const objects + derived union types (not TS `enum`) so these
// stay structurally assignable to the string-literal unions Prisma generates
// for its own enums on the API side, without needing casts at every call site.

export const Role = {
  ADMIN: "ADMIN",
  ANALYST: "ANALYST",
  VIEWER: "VIEWER",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const AuthProvider = {
  LOCAL: "LOCAL",
  MICROSOFT: "MICROSOFT",
} as const;
export type AuthProvider = (typeof AuthProvider)[keyof typeof AuthProvider];

export const ServiceName = {
  SCCP: "SCCP",
  DSX: "DSX",
  IPX: "IPX",
} as const;
export type ServiceName = (typeof ServiceName)[keyof typeof ServiceName];

export const DiscrepancyType = {
  MISSING_IN_REACHLIST: "MISSING_IN_REACHLIST",
  MISSING_IN_IR21: "MISSING_IN_IR21",
  PROVIDER_MISMATCH: "PROVIDER_MISMATCH",
} as const;
export type DiscrepancyType = (typeof DiscrepancyType)[keyof typeof DiscrepancyType];

export const UploadStatus = {
  SUCCESS: "SUCCESS",
  PARTIAL: "PARTIAL",
  FAILED: "FAILED",
} as const;
export type UploadStatus = (typeof UploadStatus)[keyof typeof UploadStatus];

export const UploadSourceType = {
  IR21: "IR21",
  REACHLIST: "REACHLIST",
} as const;
export type UploadSourceType = (typeof UploadSourceType)[keyof typeof UploadSourceType];

export const VariantStatus = {
  PENDING: "PENDING",
  RESOLVED: "RESOLVED",
  IGNORED: "IGNORED",
} as const;
export type VariantStatus = (typeof VariantStatus)[keyof typeof VariantStatus];

// Which ingestion source(s) to compute a provider's coverage footprint from —
// IR21 (declared in GSMA IR.21 XML), REACH_LIST (claimed in published Reach
// Lists), or BOTH (the union, historically the only behavior).
export const ProviderStatsSource = {
  IR21: "IR21",
  REACH_LIST: "REACH_LIST",
  BOTH: "BOTH",
} as const;
export type ProviderStatsSource = (typeof ProviderStatsSource)[keyof typeof ProviderStatsSource];

// Ir21RoutingChange.changeType — see UploadService.applyServiceConnectivity
// (ADDED/REMOVED/REPLACED, genuine carrier-routing switches) and
// UploadService.backfillChangeHistory / Ir21ChangeHistoryUtil.
// classifyNonCarrierChange (the 4 non-carrier types below -- technical
// parameter or administrative/metadata <ChangeHistory> entries with no
// carrier switch, only ever CHANGE_HISTORY-sourced). CONFIG_UPDATE (this
// union's original single technical bucket, now split into the 3 more
// specific types below) is deliberately omitted here even though it still
// exists in the Prisma enum -- see the schema's own comment on why Postgres
// can't drop it outright; no code should ever produce or expect it again.
export const RoutingChangeType = {
  ADDED: "ADDED",
  REMOVED: "REMOVED",
  REPLACED: "REPLACED",
  IP_SUBNET_UPDATE: "IP_SUBNET_UPDATE",
  DIAMETER_REALM_UPDATE: "DIAMETER_REALM_UPDATE",
  POINT_CODE_GT_UPDATE: "POINT_CODE_GT_UPDATE",
  ADMIN_NAME_UPDATE: "ADMIN_NAME_UPDATE",
} as const;
export type RoutingChangeType = (typeof RoutingChangeType)[keyof typeof RoutingChangeType];

// The 3 genuine carrier-routing-switch types -- what "churn" means across
// the Market Intelligence KPIs and the default feed view. The 4 non-carrier
// types are real, storable events but never count as churn.
export const CARRIER_CHURN_TYPES: RoutingChangeType[] = ["ADDED", "REMOVED", "REPLACED"];

// The Market Intelligence filter row combines these two into one "Diameter
// & SS7 Config" pill (both are SS7/Diameter signaling-plane parameter
// changes, as opposed to IP_SUBNET_UPDATE's plain network-layer changes) --
// sent as a comma-joined changeType value; see
// Ir21RoutingChangesService.fetchFiltered's multi-value parsing.
export const DIAMETER_SS7_CHANGE_TYPES: RoutingChangeType[] = ["DIAMETER_REALM_UPDATE", "POINT_CODE_GT_UPDATE"];
export const DIAMETER_SS7_FILTER_VALUE = DIAMETER_SS7_CHANGE_TYPES.join(",");

// GSMA's own Table-of-Contents section numbering for the 3 sections this
// platform tracks <ChangeHistory> for -- shown in the IR.21 Change Log &
// Normalization Review screen's "Section ID & Service" column. Derived from
// serviceName, not a separately stored field (every Ir21RoutingChange row
// already carries serviceName, whichever mechanism produced it).
export const SERVICE_SECTION_ID: Record<ServiceName, 5 | 17 | 20> = { SCCP: 5, IPX: 17, DSX: 20 };

// Ir21RoutingChange.changeSource — which mechanism produced the row. See
// UploadService.applyServiceConnectivity (LIVE_DIFF) and
// UploadService.backfillChangeHistory (CHANGE_HISTORY).
export const ChangeSource = {
  LIVE_DIFF: "LIVE_DIFF",
  CHANGE_HISTORY: "CHANGE_HISTORY",
} as const;
export type ChangeSource = (typeof ChangeSource)[keyof typeof ChangeSource];

// The Market Intelligence feed's changeType filter accepts two more shapes
// than the bare stored enum: "ALL" means "no changeType/onboarding
// restriction at all" (the "Show Everything" pill) -- distinct from
// omitting the param entirely, which defaults to the churn-only view
// (CARRIER_CHURN_TYPES, isInitialOnboarding excluded) -- and a comma-joined
// list of RoutingChangeType values (currently only ever
// DIAMETER_SS7_FILTER_VALUE) selects the union of those types. See
// Ir21RoutingChangesService.fetchFiltered.
export type ChangeTypeFilter = RoutingChangeType | "ALL" | string;

// The platform's 4-region + Non-Terrestrial grouping for Operator Search —
// see apps/api/src/common/utils/region-mapper.ts for the country->region
// mapping this classifies MnoMaster.country into.
export const Region = {
  AMERICAS: "Americas",
  MEA: "MEA",
  EUROPE: "Europe",
  APAC: "APAC",
  NON_TERRESTRIAL: "Non-Terrestrial",
} as const;
export type Region = (typeof Region)[keyof typeof Region];
