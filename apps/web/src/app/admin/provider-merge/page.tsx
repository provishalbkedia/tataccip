"use client";

import * as React from "react";
import type { ColDef } from "ag-grid-community";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import MergeTypeIcon from "@mui/icons-material/MergeType";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import DataGrid from "@/components/DataGrid";
import { api, ApiError } from "@/lib/api";
import { MergeProviderResult, ProviderStatsSource, ProviderSummary, Role } from "@ccip/shared-types";

export default function ProviderMergePage() {
  const [q, setQ] = React.useState("");
  const [providers, setProviders] = React.useState<ProviderSummary[]>([]);
  const [allProviders, setAllProviders] = React.useState<ProviderSummary[]>([]);
  const [selected, setSelected] = React.useState<ProviderSummary[]>([]);
  const [target, setTarget] = React.useState<ProviderSummary | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<MergeProviderResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadProviders = React.useCallback(() => {
    const params = new URLSearchParams({ source: ProviderStatsSource.IR21, includeEmpty: "true" });
    if (q) params.set("q", q);
    api.get<ProviderSummary[]>(`/provider/search?${params.toString()}`).then(setProviders);
  }, [q]);

  React.useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  // Separate, unfiltered list for the target dropdown — the admin should be
  // able to pick e.g. "Orange" as the merge target even while the grid
  // above is filtered down to junk rows that don't match "Orange" at all.
  React.useEffect(() => {
    api
      .get<ProviderSummary[]>(`/provider/search?source=${ProviderStatsSource.IR21}&includeEmpty=true`)
      .then(setAllProviders)
      .catch(() => {});
  }, []);

  async function handleMerge() {
    if (!target || selected.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<MergeProviderResult>("/provider-aliases/merge", {
        sourceProviderIds: selected.map((s) => s.id),
        targetProviderId: target.id,
      });
      setResult(res);
      setSelected([]);
      setConfirmOpen(false);
      loadProviders();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Merge failed");
    } finally {
      setBusy(false);
    }
  }

  const columnDefs = React.useMemo<ColDef<ProviderSummary>[]>(
    () => [
      { field: "providerName", headerName: "Provider Name", flex: 1.5, checkboxSelection: true, headerCheckboxSelection: true },
      { field: "providerType", headerName: "Type" },
      { field: "headquarters", headerName: "Headquarters" },
      { field: "stats.totalMnos", headerName: "Total MNOs (IR.21)" },
    ],
    [],
  );

  return (
    <RequireAuth roles={[Role.ADMIN]}>
      <AppShell>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
          Provider Mappings &amp; Merge Tool
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Select one or more non-standard/duplicate provider rows below (e.g. &quot;FranceTelecom&quot;,
          &quot;Free Caraibe&quot;, &quot;NOT AVAILABLE&quot;), choose a canonical target — or &quot;Others /
          Unassigned&quot; for junk — then merge. This repoints all connectivity data onto the target and
          permanently deletes the source rows.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {result && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setResult(null)}>
            Merged {result.providersDeleted} provider(s) ({result.sourceProviderNames.join(", ")}) into{" "}
            <strong>{result.targetProviderName}</strong> — {result.ir21RowsMoved} IR.21 row(s),{" "}
            {result.reachlistRowsMoved} Reach List row(s), {result.discrepancyRowsMoved} discrepancy row(s), and{" "}
            {result.aliasesMoved} alias(es) repointed.
          </Alert>
        )}

        <Paper sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
            <TextField
              label="Filter providers"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadProviders()}
              sx={{ minWidth: 260 }}
            />
            <Autocomplete
              options={allProviders}
              getOptionLabel={(p) => p.providerName}
              value={target}
              onChange={(_, v) => setTarget(v)}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              sx={{ minWidth: 320 }}
              renderInput={(params) => <TextField {...params} label="Merge selected into..." />}
            />
            <Button
              variant="contained"
              color="warning"
              startIcon={<MergeTypeIcon />}
              disabled={selected.length === 0 || !target}
              onClick={() => setConfirmOpen(true)}
            >
              Merge {selected.length > 0 ? `${selected.length} Provider(s)` : "Providers"}
            </Button>
          </Box>
        </Paper>

        <DataGrid<ProviderSummary>
          rowData={providers}
          columnDefs={columnDefs}
          rowSelection="multiRow"
          onSelectionChanged={setSelected}
        />

        <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
          <DialogTitle>Confirm Merge</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Merge <strong>{selected.map((s) => s.providerName).join(", ")}</strong> into{" "}
              <strong>{target?.providerName}</strong>? This repoints all their connectivity data and
              permanently deletes the source provider record(s). This cannot be undone.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleMerge} color="warning" variant="contained" disabled={busy}>
              {busy ? "Merging..." : "Merge Providers"}
            </Button>
          </DialogActions>
        </Dialog>
      </AppShell>
    </RequireAuth>
  );
}
