import { DiscrepancyType, ProviderStatsSource, Role, ServiceName, UploadStatus, VariantStatus } from "./enums";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: {
    id: number;
    email: string;
    role: Role;
  };
}

// A browser never exposes the client's actual machine name to a web app —
// ipAddress + a parsed browser/OS label from the User-Agent header is the
// closest real substitute for "where did this login come from".
export interface LoginHistoryRow {
  id: number;
  loginAt: string;
  ipAddress: string | null;
  browserOs: string | null;
}

export interface LoginHistorySummary {
  totalLogins: number;
  recent: LoginHistoryRow[];
}

// Powers the "N Online | M Total Logins" header badge. "Online" is anyone
// whose lastActiveAt (updated on every authenticated request — see
// JwtStrategy) falls within the last 5 minutes; totalLoginsCount is
// cumulative across all users, distinct from LoginHistorySummary's
// per-user count.
export interface ActiveUserEntry {
  email: string;
  role: Role;
  lastActiveAt: string;
}

export interface ActiveUsersInfo {
  totalLoginsCount: number;
  onlineUsersCount: number;
  onlineUsersList: ActiveUserEntry[];
}

// Lightweight results for the search-bar Autocomplete inputs — deliberately
// smaller than MnoSummary/ProviderSummary (no stats/connectivity), since
// these are fetched on every keystroke (debounced) while typing.
export interface MnoSuggestion {
  id: number;
  operatorName: string;
  tadigCode: string;
  country: string;
}

export interface ProviderSuggestion {
  id: number;
  providerName: string;
  // Populated when this suggestion matched via a ProviderAlias rather than
  // the canonical name itself, e.g. typing "Belgacom" suggesting "BICS" —
  // shown so the dropdown doesn't look like an unexplained non-match.
  matchedAlias: string | null;
}

export interface DashboardMetrics {
  totalMnos: number;
  totalProviders: number;
  totalConnections: number;
  sccpCount: number;
  dsxCount: number;
  ipxCount: number;
  discrepancyCount: number;
}

export interface MnoSummary {
  id: number;
  operatorName: string;
  country: string;
  tadigCode: string;
  mcc: string;
  mnc: string;
  status: string;
  // Populated once this MNO has had an IR.21 XML ingested; empty/null for
  // MNOs known only via seed data or a reach-list mention.
  networkType: string | null;
  // Consolidated per the platform's 3 core services: sccpProviders merges
  // primary + backup SCCP carriers (deduplicated); ipxProviders is the
  // GRXIPXRoutingForDataRoamingSection data-roaming carrier list; dsxProviders
  // is the LTEInfoSection LTE/Diameter carrier list — the XML parser doesn't
  // extract a distinct "DSX" section, so this is that data reinterpreted
  // under the DSX label for this consolidated view.
  sccpProviders: string[];
  dsxProviders: string[];
  ipxProviders: string[];
  lastEffectiveDate: string | null;
  // True when a PDF was paired (by TADIG match) with this MNO's XML at
  // ingestion time — see UploadService.matchPdfForTadig. Stored in Supabase
  // Storage, served via GET /mno/:id/pdf.
  hasPdfDocument: boolean;
}

// Provenance for one resolved provider: which canonical row it landed on,
// the raw declared text(s) that fed that resolution, and (if it wasn't a
// direct name match) which ProviderAlias pattern made the connection. Lets
// the UI show "why" instead of just trusting the resolved name blindly.
export interface ProviderResolutionInfo {
  canonicalProviderId: number;
  canonicalProviderName: string;
  rawDeclaredStrings: string[];
  resolvedViaAlias: string | null;
}

export interface ConnectivityMatrixRow {
  service: ServiceName;
  ir21Provider: string | null;
  reachlistProviders: string[];
  ir21ProviderResolution: ProviderResolutionInfo | null;
}

export interface MnoConnectivitySnapshot {
  networkType: string | null;
  mccMncList: string[];
  primarySccpCarrier: string | null;
  backupSccpCarriers: string[];
  sccpPointCodes: string[];
  grxIpxProviders: string[];
  lteIpxProviders: string[];
  interPmnIpRanges: string[];
  diameterEdgeAgentFqdn: string | null;
  authoritativeDnsIps: string[];
  epcRealms: string[];
  roamingCoordinatorEmail: string | null;
  ts24x7Email: string | null;
  distributionEmail: string | null;
  xmlFileVersion: string | null;
  lastEffectiveDate: string | null;
  lastParsedAt: string;
}

export interface MnoDetail extends MnoSummary {
  connectivityMatrix: ConnectivityMatrixRow[];
  connectivitySnapshot: MnoConnectivitySnapshot | null;
}

export interface ProviderCoverageStats {
  totalCountries: number;
  totalMnos: number;
  sccpCount: number;
  dsxCount: number;
  ipxCount: number;
}

export interface ProviderSummary {
  id: number;
  providerName: string;
  providerType: string | null;
  headquarters: string | null;
  website: string | null;
  // Aggregated across Ir21Connectivity + ProviderReachlist, same as the
  // detail view's stats — surfaced on the list too so search doesn't
  // require opening each provider to gauge its footprint.
  stats: ProviderCoverageStats;
  // Present only when the search was run with source=BOTH: each provider
  // is returned as two rows — one IR21-only, one REACH_LIST-only — so the
  // two footprints can be compared side by side instead of blended into a
  // single union number. Absent (and `stats` is the requested single
  // source's footprint) for source=IR21 or source=REACH_LIST.
  source?: ProviderStatsSource;
}

export interface OnNetMnoRow {
  country: string;
  operatorName: string;
  tadigCode: string;
  sccp: boolean;
  dsx: boolean;
  ipx: boolean;
}

export interface ProviderDetail extends ProviderSummary {
  onNetMnos: OnNetMnoRow[];
  // All known alias patterns pointing at this canonical provider, and every
  // distinct raw carrier string across all MNOs' XML data observed to
  // resolve here — the audit trail behind "why does this MNO show BICS".
  aliases: string[];
  observedRawStrings: string[];
}

export interface DiscrepancyRow {
  id: number;
  mnoId: number;
  operatorName: string;
  country: string;
  tadigCode: string;
  providerId: number | null;
  providerName: string | null;
  service: ServiceName;
  ir21Status: string;
  reachlistStatus: string;
  discrepancyType: DiscrepancyType;
  computedAt: string;
}

export interface ComparisonFilters {
  country?: string;
  mnoId?: number;
  providerId?: number;
  service?: ServiceName;
  discrepancyType?: DiscrepancyType;
}

export interface UploadHistoryRow {
  id: number;
  filename: string;
  uploadTime: string;
  uploadedBy: string;
  recordsLoaded: number;
  status: UploadStatus;
  errorLog: string | null;
  // Set only for an IR.21 XML batch uploaded with "Replace Active Dataset".
  isCurrentActive: boolean;
  mnoCount: number | null;
}

export interface UploadResult {
  uploadHistory: UploadHistoryRow;
  errors: string[];
}

// Powers the "Active IR.21 Baseline" banner on the Admin Menu/Dashboard.
export interface ActiveBaselineInfo {
  active: UploadHistoryRow | null;
  currentMnoCount: number;
}

export interface BulkXmlUploadResult {
  uploadHistory: UploadHistoryRow;
  filesProcessed: number;
  filesFailed: number;
  mnosUpdated: number;
  unmappedVariantsFound: number;
  errors: string[];
}

export interface AffectedMno {
  tadigCode: string;
  operatorName: string;
  country: string;
}

export interface UnmappedProviderVariantRow {
  id: string;
  rawCarrierName: string;
  normalizedPattern: string;
  detectedService: ServiceName;
  // Enriched from MnoMaster — a TADIG with no matching MnoMaster row (rare,
  // shouldn't happen given ingestion always upserts one first) falls back
  // to the bare code as operatorName with an empty country.
  affectedMnos: AffectedMno[];
  affectedMnoCount: number;
  occurrenceCount: number;
  status: VariantStatus;
  resolvedProviderId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResolveProviderAliasRequest {
  variantId: string;
  providerId?: number;
  newProviderName?: string;
}

export interface ProviderAliasRow {
  id: string;
  providerId: number;
  providerName: string;
  aliasPattern: string;
  createdAt: string;
}

// Admin override: detach a specific raw declared string from wherever it
// currently resolves and point it at a different (or brand-new) canonical
// provider. Unlike ResolveProviderAliasRequest, this doesn't require a
// pending UnmappedProviderVariant — it targets any already-resolved raw
// string an admin has decided was mapped wrong.
export interface RemapProviderRequest {
  rawString: string;
  targetProviderId?: number;
  newProviderName?: string;
}

export interface RemapProviderResult {
  normalizedPattern: string;
  targetProviderId: number;
  targetProviderName: string;
  // TADIGs whose Ir21Connectivity was repointed. Reach List data is never
  // touched here — raw provider text from Excel uploads isn't persisted
  // anywhere, so there's no way to trace which reach-list rows came from
  // this exact raw string.
  affectedTadigs: string[];
}

// Admin override: one or more ProviderMaster rows turned out to be the same
// real-world provider (e.g. a Reach List upload created "TATAComms" as its
// own row instead of resolving to the existing "Tata Comm"), or are junk
// that should collapse into the "Others / Unassigned" system catch-all.
// Repoints every ProviderReachlist/Ir21Connectivity/DataDiscrepancy/
// ProviderAlias row from each source to the target, registers each
// source's normalized name as an alias so future uploads resolve directly,
// then deletes the source rows.
export interface MergeProviderRequest {
  sourceProviderIds: number[];
  targetProviderId: number;
}

export interface MergeProviderResult {
  sourceProviderIds: number[];
  sourceProviderNames: string[];
  targetProviderId: number;
  targetProviderName: string;
  reachlistRowsMoved: number;
  ir21RowsMoved: number;
  discrepancyRowsMoved: number;
  aliasesMoved: number;
  providersDeleted: number;
}

// Admin override: a ProviderMaster row is placeholder junk ("None", "N/A",
// "Not Applicable", a bare "0.0.0.0", etc.) with no real data behind it —
// not a duplicate of a real provider (that's MergeProviderRequest), just
// noise to remove outright. Refused if the row has any Ir21Connectivity or
// ProviderReachlist rows attached — that's real data, and means this should
// be a merge instead.
export interface DeleteProviderResult {
  deletedProviderId: number;
  deletedProviderName: string;
}
