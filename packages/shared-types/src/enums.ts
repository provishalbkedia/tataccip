// Modeled as const objects + derived union types (not TS `enum`) so these
// stay structurally assignable to the string-literal unions Prisma generates
// for its own enums on the API side, without needing casts at every call site.

export const Role = {
  ADMIN: "ADMIN",
  ANALYST: "ANALYST",
  VIEWER: "VIEWER",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

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
