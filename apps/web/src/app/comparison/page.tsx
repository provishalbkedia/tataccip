"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  Chip,
  Grid,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import DataGrid from "@/components/DataGrid";
import SuggestionAutocomplete from "@/components/SuggestionAutocomplete";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { DiscrepancyRow, MnoSuggestion, ProviderSummary, Role, ServiceName, DiscrepancyType } from "@ccip/shared-types";

const DISCREPANCY_COLORS: Record<string, "error" | "warning" | "info"> = {
  MISSING_IN_REACHLIST: "warning",
  MISSING_IN_IR21: "info",
  PROVIDER_MISMATCH: "error",
};

const VALID_SERVICES: string[] = Object.values(ServiceName);
const VALID_DISCREPANCY_TYPES: string[] = Object.values(DiscrepancyType);

export default function ComparisonPage() {
  return (
    <React.Suspense fallback={null}>
      <ComparisonPageInner />
    </React.Suspense>
  );
}

function ComparisonPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [operator, setOperator] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [service, setService] = React.useState("");
  const [providerId, setProviderId] = React.useState("");
  const [discrepancyType, setDiscrepancyType] = React.useState("");
  const [providers, setProviders] = React.useState<ProviderSummary[]>([]);
  const [rows, setRows] = React.useState<DiscrepancyRow[]>([]);
  const [running, setRunning] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const fetchMnoSuggestions = React.useCallback(
    (q: string) => api.get<MnoSuggestion[]>(`/mno/suggestions?q=${encodeURIComponent(q)}`),
    [],
  );

  // The URL query string is the source of truth for the active filters —
  // fires on initial load and whenever Filter/Reset push a new query, and
  // restores exact filter state on browser Back/Forward navigation.
  React.useEffect(() => {
    const nextOperator = searchParams.get("operator") ?? "";
    const nextCountry = searchParams.get("country") ?? "";
    const nextService = searchParams.get("service") ?? "";
    const nextProviderId = searchParams.get("providerId") ?? "";
    const nextDiscrepancyType = searchParams.get("discrepancyType") ?? "";
    setOperator(nextOperator);
    setCountry(nextCountry);
    setService(VALID_SERVICES.includes(nextService) ? nextService : "");
    setProviderId(nextProviderId);
    setDiscrepancyType(VALID_DISCREPANCY_TYPES.includes(nextDiscrepancyType) ? nextDiscrepancyType : "");

    const params = new URLSearchParams();
    if (nextOperator) params.set("operator", nextOperator);
    if (nextCountry) params.set("country", nextCountry);
    if (nextService) params.set("service", nextService);
    if (nextProviderId) params.set("providerId", nextProviderId);
    if (nextDiscrepancyType) params.set("discrepancyType", nextDiscrepancyType);
    api.get<DiscrepancyRow[]>(`/comparison?${params.toString()}`).then(setRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  React.useEffect(() => {
    api.get<ProviderSummary[]>("/provider/search").then(setProviders);
  }, []);

  const pushParams = React.useCallback(
    (next: { operator: string; country: string; service: string; providerId: string; discrepancyType: string }) => {
      const params = new URLSearchParams();
      if (next.operator) params.set("operator", next.operator);
      if (next.country) params.set("country", next.country);
      if (next.service) params.set("service", next.service);
      if (next.providerId) params.set("providerId", next.providerId);
      if (next.discrepancyType) params.set("discrepancyType", next.discrepancyType);
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const runSearch = React.useCallback(
    () => pushParams({ operator, country, service, providerId, discrepancyType }),
    [pushParams, operator, country, service, providerId, discrepancyType],
  );

  const resetFilters = React.useCallback(
    () => pushParams({ operator: "", country: "", service: "", providerId: "", discrepancyType: "" }),
    [pushParams],
  );

  async function handleRun() {
    setRunning(true);
    setMessage(null);
    try {
      const res = await api.post<{ discrepancyCount: number }>("/comparison/run");
      setMessage(`Comparison recomputed — ${res.discrepancyCount} discrepancies found.`);
      runSearch();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Comparison run failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <RequireAuth>
      <AppShell>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
          Comparison Engine
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          IR.21 declared connectivity vs. provider reach lists — missing coverage, mismatches, and opportunities.
        </Typography>

        {user?.role === Role.ADMIN && (
          <Button
            variant="contained"
            startIcon={<PlayArrowIcon />}
            onClick={handleRun}
            disabled={running}
            sx={{ mb: 2 }}
          >
            {running ? "Running..." : "Run Comparison"}
          </Button>
        )}
        {message && <Alert severity="info" sx={{ mb: 2 }}>{message}</Alert>}

        <Paper sx={{ p: 2, mb: 3 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={2.4}>
              <SuggestionAutocomplete<MnoSuggestion>
                label="Operator (MNO) / TADIG"
                value={operator}
                onValueChange={setOperator}
                fetchSuggestions={fetchMnoSuggestions}
                getOptionLabel={(o) => `${o.operatorName} (${o.tadigCode})`}
                getOptionValue={(o) => o.operatorName}
                onEnter={runSearch}
              />
            </Grid>
            <Grid item xs={12} sm={2.2}>
              <TextField fullWidth label="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
            </Grid>
            <Grid item xs={6} sm={2}>
              <TextField
                fullWidth
                select
                label="Service"
                value={service}
                onChange={(e) => setService(e.target.value)}
              >
                <MenuItem value="">All</MenuItem>
                {Object.values(ServiceName).map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={6} sm={2}>
              <TextField
                fullWidth
                select
                label="Provider"
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
              >
                <MenuItem value="">All</MenuItem>
                {providers.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.providerName}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={6} sm={2}>
              <TextField
                fullWidth
                select
                label="Discrepancy Type"
                value={discrepancyType}
                onChange={(e) => setDiscrepancyType(e.target.value)}
              >
                <MenuItem value="">All</MenuItem>
                {Object.values(DiscrepancyType).map((t) => (
                  <MenuItem key={t} value={t}>
                    {t.replaceAll("_", " ")}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={6} sm={1.4}>
              <Button fullWidth variant="contained" onClick={runSearch}>
                Filter
              </Button>
            </Grid>
            <Grid item xs={6} sm={1}>
              <Button fullWidth variant="outlined" startIcon={<RestartAltIcon />} onClick={resetFilters}>
                Reset
              </Button>
            </Grid>
          </Grid>
        </Paper>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {rows.length} discrepancy(ies)
        </Typography>
        <DataGrid<DiscrepancyRow>
          rowData={rows}
          exportFileName="ccip-discrepancies.csv"
          height={560}
          columnDefs={[
            { field: "operatorName", headerName: "MNO", flex: 1.3 },
            { field: "country", headerName: "Country" },
            { field: "tadigCode", headerName: "TADIG" },
            { field: "service", headerName: "Service" },
            { field: "providerName", headerName: "Provider" },
            { field: "ir21Status", headerName: "IR.21 Status", flex: 1.2 },
            { field: "reachlistStatus", headerName: "Reach List Status", flex: 1.4 },
            {
              field: "discrepancyType",
              headerName: "Type",
              flex: 1.3,
              cellRenderer: (p: { value: string }) => (
                <Chip
                  size="small"
                  label={p.value.replaceAll("_", " ")}
                  color={DISCREPANCY_COLORS[p.value] ?? "default"}
                />
              ),
            },
          ]}
        />
      </AppShell>
    </RequireAuth>
  );
}
