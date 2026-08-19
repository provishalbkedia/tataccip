"use client";

import * as React from "react";
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
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import DataGrid from "@/components/DataGrid";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { DiscrepancyRow, ProviderSummary, Role, ServiceName, DiscrepancyType } from "@ccip/shared-types";

const DISCREPANCY_COLORS: Record<string, "error" | "warning" | "info"> = {
  MISSING_IN_REACHLIST: "warning",
  MISSING_IN_IR21: "info",
  PROVIDER_MISMATCH: "error",
};

export default function ComparisonPage() {
  const { user } = useAuth();
  const [country, setCountry] = React.useState("");
  const [service, setService] = React.useState("");
  const [providerId, setProviderId] = React.useState("");
  const [discrepancyType, setDiscrepancyType] = React.useState("");
  const [providers, setProviders] = React.useState<ProviderSummary[]>([]);
  const [rows, setRows] = React.useState<DiscrepancyRow[]>([]);
  const [running, setRunning] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const runSearch = React.useCallback(() => {
    const params = new URLSearchParams();
    if (country) params.set("country", country);
    if (service) params.set("service", service);
    if (providerId) params.set("providerId", providerId);
    if (discrepancyType) params.set("discrepancyType", discrepancyType);
    api.get<DiscrepancyRow[]>(`/comparison?${params.toString()}`).then(setRows);
  }, [country, service, providerId, discrepancyType]);

  React.useEffect(() => {
    api.get<ProviderSummary[]>("/provider/search").then(setProviders);
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <Grid item xs={12} sm={3}>
              <TextField fullWidth label="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
            </Grid>
            <Grid item xs={6} sm={2.5}>
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
            <Grid item xs={6} sm={2.5}>
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
            <Grid item xs={6} sm={2.5}>
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
            <Grid item xs={6} sm={1.5}>
              <Button fullWidth variant="outlined" onClick={runSearch}>
                Filter
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
