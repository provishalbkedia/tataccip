import { AuthProvider, DiscrepancyType, ProviderStatsSource, Region, Role, RoutingChangeType, ServiceName, UploadStatus, VariantStatus } from "./enums";

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
  // Authoritative MNO count: operators with a full parsed GSMA IR.21 XML
  // declaration on file (MnoMasterConnectivity). This is the platform's
  // source of truth for "how many MNOs does CCIP know about" -- see
  // reachlistOnlyMnoCount for the separate, non-authoritative count below.
  totalMnos: number;
  // TADIGs cited in a wholesale provider's Reach List that don't (yet)
  // have their own IR.21 declaration. Tracked for transparency but
  // deliberately excluded from totalMnos -- a Reach List citation isn't
  // independently authenticated the way an IR.21 XML is, and reach lists
  // are prone to naming/TADIG variants of operators IR.21 already knows
  // under a different spelling, so folding these into the MNO count would
  // risk inflating it with duplicates rather than genuinely new operators.
  reachlistOnlyMnoCount: number;
  // Reach List rows queued in MnoNormalizationAudit (matchStatus
  // PENDING_REVIEW) because their TADIG matched neither an existing
  // MnoMaster nor a confident country+name match. See
  // GET /mno-normalization/pending -- Reach List ingestion no longer
  // auto-creates a new MnoMaster for these, so this count only grows
  // until an admin resolves each one.
  pendingMnoNormalizationCount: number;
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
  // Alternate/legacy TADIGs curated as belonging to this same operator —
  // see MnoMaster.secondaryTadigs. A Reach List row quoting one of these
  // resolves to this same operator instead of a separate MnoMaster.
  secondaryTadigs: string[];
  mcc: string;
  mnc: string;
  status: string;
  // Populated once this MNO has had an IR.21 XML ingested; empty/null for
  // MNOs known only via seed data or a reach-list mention.
  networkType: string | null;
  // Whether this MNO has a parsed IR.21 XML declaration on file
  // (MnoMasterConnectivity present) -- false for a legacy row auto-created
  // from a Reach List upload before MNO normalization was enforced. Powers
  // the Operator Search dataset-scope filter (IR.21 Verified / Reach List
  // Only / All) and its per-row source badge.
  hasIr21Declaration: boolean;
  // IR.21's GRX/IPX ASN table splits on "Network Owner": the operator's
  // own AS Number(s) vs. a specific provider's own ASN ("ProviderName:
  // ASN" strings).
  mnoAsNumbers: string[];
  providerAsNumbers: string[];
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
  // IR.21's GRX/IPX ASN table splits on "Network Owner": the operator's
  // own AS Number(s) vs. a specific provider's own ASN ("ProviderName:
  // ASN" strings).
  mnoAsNumbers: string[];
  providerAsNumbers: string[];
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
  // True when this provider is the ONLY provider declaring/claiming that
  // service for this MNO, scoped to the same `source` lens the row itself
  // is shown through (IR.21-only, Reach List-only, or the union of both
  // when source=BOTH — matching how sccp/dsx/ipx above are themselves
  // merged). Always false when the service flag itself is false.
  isExclusiveSccp: boolean;
  isExclusiveDsx: boolean;
  isExclusiveIpx: boolean;
  // True if any of the three service-level exclusivity flags above is true.
  isExclusiveAny: boolean;
}

export interface ProviderDetail extends ProviderSummary {
  onNetMnos: OnNetMnoRow[];
  // All known alias patterns pointing at this canonical provider, and every
  // distinct raw carrier string across all MNOs' XML data observed to
  // resolve here — the audit trail behind "why does this MNO show BICS".
  aliases: string[];
  observedRawStrings: string[];
  // Count of onNetMnos where isExclusiveAny is true — this provider is the
  // sole declared/claimed carrier for at least one service on that MNO.
  exclusiveMnoCount: number;
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
  // Reach List uploads only — which of the two accepted shapes was read:
  // the standard one-row-per-record file, or the wide Competitor Coverage
  // matrix (one column per wholesale provider) auto-unpivoted in memory.
  formatDetected?: "STANDARD_TRANSPOSED" | "COMPETITOR_MATRIX";
  // Set when formatDetected is COMPETITOR_MATRIX — how many normalized
  // (Provider, Country, MNO, TADIG, Services) rows the matrix expanded into.
  totalRowsTransposed?: number;
  // MNOs from a matrix upload that don't already exist in MnoMaster — the
  // matrix format carries no TADIG column, so there's nothing to attach a
  // new operator row to; these rows were skipped rather than guessed at.
  unresolvedMnos?: { mnoName: string; country: string }[];
  // Set when the upload was made with replace=true: how many prior
  // ProviderReachlist rows sourced from this same filename were deleted
  // before this upload's records were ingested.
  recordsReplaced?: number;
  // Rows whose TADIG matched neither an existing MnoMaster (exact or via
  // secondaryTadigs) nor a confident country+name match -- queued in
  // MnoNormalizationAudit for admin review instead of auto-creating a new
  // MnoMaster row. See GET /mno-normalization/pending.
  pendingNormalizationCount?: number;
  // Every row from this upload that could not be ingested at all -- across
  // both accepted formats and every rejection reason (missing/invalid
  // TADIG, no valid services, unresolved operator, etc). A superset of
  // `unresolvedMnos` with per-row detail (row number, raw TADIG, an
  // explicit reason) rather than just an aggregated name+country list, so
  // nothing that fails ingestion is only ever mentioned in a one-time
  // response message.
  rejectedRows?: UnresolvedReachRow[];
}

export interface UnresolvedReachRow {
  rowNumber: number;
  rawOperatorName: string;
  rawTadig: string;
  country: string;
  rejectionReason: string;
}

// Multi-Carrier Reach List ZIP Batch Ingestion — a distinct upload path
// from the single-file UploadResult above, for a .zip containing several
// carriers' own reach-list exports (Excel/xls, a Comfone-style PDF
// customer list, or an Outlook .msg with a pasted table/partner list).
export interface ReachlistZipFileResult {
  filename: string;
  fileType: "EXCEL" | "PDF" | "MSG" | "OTHER";
  status:
    | "PROCESSED"
    | "SKIPPED_UNSUPPORTED_FORMAT"
    | "SKIPPED_UNRESOLVED_PROVIDER"
    | "SKIPPED_UNPARSEABLE"
    | "SKIPPED_NO_DATA";
  // The carrier this file was matched to (from its filename, or — for
  // .msg — the sender's name/email domain as a fallback), once resolved
  // against the platform's existing provider aliases.
  inferredProvider?: string;
  recordsLoaded: number;
  recordsReplaced?: number;
  errorCount: number;
  unresolvedMnoCount: number;
  // Rows queued in MnoNormalizationAudit because their TADIG matched
  // neither an existing MnoMaster nor a confident country+name match.
  pendingNormalizationCount?: number;
  // Short, file-specific context — e.g. "used filename to infer service:
  // SCCP, IPX" or "13 rows had a non-standard placeholder code instead of
  // a TADIG, skipped" — surfaced so an admin can judge how much to trust
  // this particular file's numbers, not just the batch total.
  note?: string;
}

// Full, unscoped purge of every Reach List record — see
// UploadService.purgeAllReachlistData for why this is deliberately
// separate from (and much blunter than) the per-file `replace` option on
// both reachlist upload paths.
export interface PurgeReachlistResult {
  deletedCount: number;
}

// Full platform reset — see UploadService.resetIr21AndMnoDatabase. Wipes
// every MnoMaster row and everything a foreign key requires be gone first
// (IR.21 connectivity, Reach List connectivity, discrepancies, overrides,
// normalization audit). ProviderMaster/ProviderAlias are left untouched.
export interface ResetIr21DatabaseResult {
  mnosDeleted: number;
}

export interface ReachlistZipBatchResult {
  uploadHistory: UploadHistoryRow;
  totalFilesInArchive: number;
  filesProcessed: number;
  filesSkipped: number;
  totalRecordsLoaded: number;
  files: ReachlistZipFileResult[];
  // Flattened and deduplicated across every file in the archive.
  unresolvedMnos: { mnoName: string; country: string }[];
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

// Reach List MNO Normalization — GSMA IR.21 is the platform's sole
// authoritative source for new MNO records, so a Reach List row whose
// TADIG doesn't match an existing MnoMaster (exact, or a confident
// country+name fuzzy match) is queued here instead of auto-creating a new
// MnoMaster row. See UploadService.recordNormalizationAudit /
// MnoNormalizationService.
export type MnoMatchStatus = "EXACT_TADIG" | "ALIAS_MATCHED" | "PENDING_REVIEW" | "MANUALLY_OVERRIDDEN";

export interface MnoNormalizationAuditRow {
  id: string;
  rawOperatorName: string;
  rawTadigCode: string;
  country: string;
  providerId: number;
  providerName: string;
  affectedServices: string[];
  affectedFiles: string[];
  occurrenceCount: number;
  matchStatus: MnoMatchStatus;
  canonicalMnoId: number | null;
  canonicalMnoName: string | null;
  canonicalMnoTadig: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResolveMnoNormalizationRequest {
  auditId: string;
  mnoId: number;
}

export interface ResolveMnoNormalizationResult {
  audit: MnoNormalizationAuditRow;
  recordsCreated: number;
}

export interface CreateMnoFromAuditRequest {
  // Every pending audit row that refers to the same real-world operator
  // (typically one per wholesale provider that declared it) -- all
  // resolve onto the single new MNO this call creates.
  auditIds: string[];
}

export interface CreateMnoFromAuditResult {
  mnoId: number;
  operatorName: string;
  // Either the group's own raw TADIG (when it was already valid GSMA
  // format) or a synthesized placeholder -- see
  // MnoNormalizationService.createFromAudits.
  tadigCode: string;
  auditIdsResolved: string[];
  recordsCreated: number;
}

// IR.21 Market Intelligence & Routing Change Tracker -- see
// UploadService.applyServiceConnectivity for how each row is detected
// (Ir21RoutingChange), and MnoRoutingChangeAnalyticsService for how
// summary/feed are computed. Scoped to the single canonical per-service
// provider Ir21Connectivity tracks (its own @@unique constraint) -- not
// the fuller primary+backup declared-name lists MnoMasterConnectivity
// carries for display, which aren't independently resolved to a stable
// providerId per entry.
export type RoutingChangeTimeframe = "1m" | "3m" | "6m" | "12m" | "all";

export interface Ir21RoutingChangeFilters {
  timeframe?: RoutingChangeTimeframe;
  service?: ServiceName | "ALL";
  changeType?: RoutingChangeType | "ALL";
  providerId?: number;
  // Direction-scoped providerId filter, set only by the Top Gainer/Loser
  // KPI cards' click-through -- "gainer" narrows to rows where providerId
  // is the newProvider on an ADDED/REPLACED row, "loser" to rows where
  // it's the oldProvider on a REMOVED/REPLACED row. Ignored without a
  // providerId; the plain provider-name filter (no role) matches either
  // side, unchanged.
  providerRole?: "gainer" | "loser";
  region?: Region;
  search?: string;
}

export interface Ir21RoutingChangeRow {
  id: string;
  mnoId: number;
  tadigCode: string;
  mnoName: string;
  country: string;
  region: Region | null;
  serviceName: ServiceName;
  changeType: RoutingChangeType;
  oldProviderId: number | null;
  oldProviderName: string | null;
  newProviderId: number | null;
  newProviderName: string | null;
  sourceFile: string;
  effectiveDate: string;
  ingestedAt: string;
  hasPdfDocument: boolean;
}

export interface Ir21RoutingChangeSummary {
  totalChurnEvents: number;
  addedCount: number;
  removedCount: number;
  replacedCount: number;
  activeSwitchingOperatorCount: number;
  // Ranked by gross gains (ADDED + REPLACED-as-newProvider) descending --
  // not net delta, so a provider that's still net-positive overall but
  // lost some accounts can appear on both this list and topLosingProviders
  // at once. netDelta (gains - losses) is carried alongside for context.
  // uniqueOperatorsCount is the distinct MNO/account count behind
  // grossGains -- one operator switching to a provider on all three
  // services (SCCP/DSX/IPX) counts as 3 gains but 1 operator.
  topGainingProviders: { providerId: number; providerName: string; grossGains: number; grossLosses: number; netDelta: number; uniqueOperatorsCount: number }[];
  // Ranked by gross losses descending; only includes a provider when its
  // grossLosses > 0 -- never force-filled just to avoid an empty list.
  // uniqueOperatorsCount here is the distinct-account count behind
  // grossLosses (same reasoning as topGainingProviders above).
  topLosingProviders: { providerId: number; providerName: string; grossGains: number; grossLosses: number; netDelta: number; uniqueOperatorsCount: number }[];
  topSwitchingOperators: { mnoId: number; operatorName: string; tadigCode: string; changeCount: number }[];
}
