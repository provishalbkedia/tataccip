import { AuthProvider, DiscrepancyType, ProviderStatsSource, Role, ServiceName, UploadStatus, VariantStatus } from "./enums";

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
    name?: string | null;
  };
}

// POST /auth/microsoft — idToken is the raw Microsoft-issued OpenID Connect
// ID token from MSAL's loginPopup(), verified server-side against
// Microsoft's JWKS before any claim in it is trusted.
export interface MicrosoftLoginRequest {
  idToken: string;
}

// --- User & Role Management (Admin) -------------------------------------

export interface UserRow {
  id: number;
  email: string;
  name: string | null;
  role: Role;
  isActive: boolean;
  authProvider: AuthProvider;
  createdAt: string;
  // Most recent LoginHistory entry for this user — null if they've never
  // actually logged in (e.g. provisioned but not yet signed in, shouldn't
  // normally happen since provisioning only happens on first sign-in).
  lastLoginAt: string | null;
}

export interface UpdateUserRoleRequest {
  role: Role;
}

export interface UpdateUserStatusRequest {
  isActive: boolean;
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
}

export interface MnoSummary {
  id: number;
  operatorName: string;
  country: string;
  // Americas / MEA / Europe / APAC / Non-Terrestrial, derived from `country`
  // — see apps/api/src/common/utils/region-mapper.ts. Null for the rare
  // unclassifiable country value (e.g. "UNKNOWN").
  region: string | null;
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

// One declared provider found among a service's raw candidate strings
// (primary SCCP + backups, or the full GRX/IPX or LTE/Diameter provider
// list) that resolved to a distinct ProviderMaster — see
// MnoService.resolveAllDeclaredProviders. isPrimary marks whichever one
// the schema's one-row-per-(MNO,service) Ir21Connectivity actually stores
// (index 0 during ingestion, or an admin override) — the rest are real
// declared carriers that don't have their own Ir21Connectivity row today,
// shown here for the Comparison Grid only.
export interface Ir21DeclaredProvider {
  id: number;
  name: string;
  rawDeclaredString: string;
  isPrimary: boolean;
}

export interface ConnectivityMatrixRow {
  service: ServiceName;
  // The single provider Ir21Connectivity actually stores for this service —
  // kept for backward compatibility; prefer ir21Providers for display.
  ir21Provider: string | null;
  ir21Providers: Ir21DeclaredProvider[];
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

export interface ServicePresence {
  sccp: boolean;
  dsx: boolean;
  ipx: boolean;
}

export interface OnNetMnoRow {
  mnoId: number;
  country: string;
  operatorName: string;
  tadigCode: string;
  // Merged presence — true if the service is declared/claimed by EITHER
  // source when source=BOTH, or by the single requested source otherwise.
  sccp: boolean;
  dsx: boolean;
  ipx: boolean;
  // From MnoMasterConnectivity — lets Provider Detail's On-Net MNO List
  // link straight to GET /mno/:mnoId/pdf per row, same as Operator Search.
  hasPdfDocument: boolean;
  // Only populated when ProviderService.detail() was requested with
  // source=BOTH — per-source presence for each service, so the UI can show
  // side-by-side "IR.21 ✓ / Reach List ✓" indicators instead of a single
  // merged flag that hides which source actually declared it.
  ir21?: ServicePresence;
  reachList?: ServicePresence;
}

export interface ProviderDetail extends ProviderSummary {
  onNetMnos: OnNetMnoRow[];
  // All known alias patterns pointing at this canonical provider, and every
  // distinct raw carrier string across all MNOs' XML data observed to
  // resolve here — the audit trail behind "why does this MNO show BICS".
  aliases: string[];
  observedRawStrings: string[];
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

// Best-effort DSX (LTE/Diameter) backfill for MNOs whose IR.21 was already
// ingested before the wider LTE/Diameter extraction paths existed. Runs
// against the already-stored MnoMasterConnectivity.lteIpxProviders snapshot
// — not a re-parse of the original XML, which the platform never retains —
// so `scanned`/`created` reflect what that older, narrower extraction had
// already captured, not the full benefit of the newer parser. Re-uploading
// the active batch (with "Replace Active Dataset") is the only way to pick
// up carriers only the newer LTEInfoSection/SignallingInfoSection/FQDN
// paths would find.
export interface DsxBackfillResult {
  scanned: number;
  created: number;
  alreadyLinked: number;
  unmapped: number;
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

// Admin override: a ProviderMaster row is placeholder junk ("None", "N/A",
// "Not Applicable", a bare "0.0.0.0", etc.) with no real data behind it —
// not a duplicate of a real provider, just noise to remove outright.
// Refused if the row has any Ir21Connectivity or
// ProviderReachlist rows attached — that's real data, and means this should
// be a merge instead.
export interface DeleteProviderResult {
  deletedProviderId: number;
  deletedProviderName: string;
}

// --- Granular per-operator overrides ---------------------------------

// One MNO's provider assignment for one service, pinned by an admin
// regardless of what a generic declared string ("SCCP Carrier") would
// otherwise resolve to for every MNO sharing that string. originalRawString
// is the declared text this override replaces — kept for audit visibility
// and for re-resolving a sane fallback if the override is later reverted.
export interface MnoProviderOverrideEntry {
  tadigCode: string;
  providerId: number;
  reasonNote?: string;
  originalRawString?: string;
}

export interface SaveOverridesBatchRequest {
  service: ServiceName;
  entries: MnoProviderOverrideEntry[];
}

export interface SaveOverridesBatchResult {
  savedCount: number;
  skippedCount: number;
  errors: string[];
}

export interface MnoProviderOverrideRow {
  id: string;
  tadigCode: string;
  operatorName: string;
  country: string;
  serviceName: ServiceName;
  originalRawString: string;
  overrideProviderId: number;
  overrideProviderName: string;
  reasonNote: string | null;
  updatedBy: string;
  updatedAt: string;
}

// --- Provider normalization / alias dictionary audit -------------------

export interface ProviderAliasEntry {
  id: string;
  aliasPattern: string;
  // How many raw declared strings across the active dataset (MnoMasterConnectivity's
  // SCCP/GRX-IPX/LTE fields) normalize to this exact alias pattern.
  occurrenceCount: number;
}

export interface ProviderNormalizationCard {
  providerId: number;
  providerName: string;
  aliases: ProviderAliasEntry[];
}

export interface AddAliasRequest {
  providerId: number;
  aliasPattern: string;
}

export interface ReassignAliasRequest {
  targetProviderId?: number;
  newProviderName?: string;
}

// --- Multi-provider comparative footprint matrix ------------------------

// One row per MNO covered by at least one of the compared providers, with
// a per-provider breakdown split by source (IR.21 vs Reach List) — powers
// /search/provider/compare's grouped-column matrix (2-5 providers).
export interface ProviderCompareMatrixItem {
  mnoId: number;
  operatorName: string;
  country: string;
  tadigCode: string;
  providers: Record<number, {
    providerName: string;
    ir21: ServicePresence;
    reachList: ServicePresence;
  }>;
}

// --- Multi-operator comparative connectivity matrix ----------------------

// One row per selected operator's basic identity — the matrix's column
// headers ("[ Operator Name (TADIG, Country) ]" per the spec).
export interface OperatorCompareMatrixOperator {
  id: number;
  operatorName: string;
  country: string;
  tadigCode: string;
  mccMncList: string[];
  hasPdfDocument: boolean;
}

export interface OperatorCompareMatrixCell {
  ir21Declared: boolean;
  reachListClaimed: boolean;
  rawDeclaredString?: string;
}

// One row per canonical provider connected to at least one selected
// operator for this service — see MnoService.compareMatrix. ir21Declared
// reflects EVERY resolved provider found among that operator's raw
// declared strings for this service (not just the single one
// Ir21Connectivity stores — same reasoning as Ir21DeclaredProvider/
// resolveAllDeclaredProviders on the Operator Detail Comparison Grid).
export interface OperatorCompareMatrixProviderRow {
  providerId: number;
  providerName: string;
  operatorStatus: Record<number, OperatorCompareMatrixCell>;
}

export interface OperatorCompareMatrixResponse {
  operators: OperatorCompareMatrixOperator[];
  matrix: {
    sccp: OperatorCompareMatrixProviderRow[];
    dsx: OperatorCompareMatrixProviderRow[];
    ipx: OperatorCompareMatrixProviderRow[];
  };
}
