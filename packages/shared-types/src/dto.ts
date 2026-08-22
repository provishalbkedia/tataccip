import { DiscrepancyType, Role, ServiceName, UploadStatus, VariantStatus } from "./enums";

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
}

export interface ConnectivityMatrixRow {
  service: ServiceName;
  ir21Provider: string | null;
  reachlistProviders: string[];
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

export interface ProviderSummary {
  id: number;
  providerName: string;
  providerType: string | null;
  headquarters: string | null;
  website: string | null;
}

export interface ProviderCoverageStats {
  totalCountries: number;
  totalMnos: number;
  sccpCount: number;
  dsxCount: number;
  ipxCount: number;
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
  stats: ProviderCoverageStats;
  onNetMnos: OnNetMnoRow[];
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
}

export interface UploadResult {
  uploadHistory: UploadHistoryRow;
  errors: string[];
}

export interface BulkXmlUploadResult {
  uploadHistory: UploadHistoryRow;
  filesProcessed: number;
  filesFailed: number;
  mnosUpdated: number;
  unmappedVariantsFound: number;
  errors: string[];
}

export interface UnmappedProviderVariantRow {
  id: string;
  rawCarrierName: string;
  normalizedPattern: string;
  detectedService: ServiceName;
  affectedTadigs: string[];
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
