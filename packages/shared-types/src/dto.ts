import { DiscrepancyType, Role, ServiceName, UploadStatus } from "./enums";

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
}

export interface ConnectivityMatrixRow {
  service: ServiceName;
  ir21Provider: string | null;
  reachlistProviders: string[];
}

export interface MnoDetail extends MnoSummary {
  connectivityMatrix: ConnectivityMatrixRow[];
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
