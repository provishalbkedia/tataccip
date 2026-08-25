"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { ColDef } from "ag-grid-community";
import { Box, Button, Chip, Grid, Paper, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import DataGrid from "@/components/DataGrid";
import SuggestionAutocomplete from "@/components/SuggestionAutocomplete";
import { api } from "@/lib/api";
import { ProviderStatsSource, ProviderSuggestion, ProviderSummary } from "@ccip/shared-types";

const SOURCE_LABEL: Record<ProviderStatsSource, string> = {
  [ProviderStatsSource.IR21]: "IR.21",
  [ProviderStatsSource.REACH_LIST]: "Reach List",
  [ProviderStatsSource.BOTH]: "Both",
};

const SOURCE_HELPER_TEXT: Record<ProviderStatsSource, string> = {
  [ProviderStatsSource.IR21]: "Showing provider coverage footprint as declared in GSMA IR.21 documents.",
  [ProviderStatsSource.REACH_LIST]: "Showing provider coverage footprint claimed in published Reach Lists.",
  [ProviderStatsSource.BOTH]: "Showing one row per source per provider — compare the IR.21 footprint against the Reach List footprint directly.",
};

const VALID_SOURCES: string[] = Object.values(ProviderStatsSource);
const VALID_SERVICES = ["SCCP", "DSX", "IPX"] as const;
type ServiceFilter = (typeof VALID_SERVICES)[number];

export default function ProviderSearchPage() {
  return (
    <React.Suspense fallback={null}>
      <ProviderSearchPageInner />
    </React.Suspense>
  );
}

function ProviderSearchPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = React.useState("");
  // Default is "As per IR.21 Data", not the combined view — only overridden
  // when the URL explicitly carries a different source (e.g. restored via
  // Back navigation, or a shared link).
  const [source, setSource] = React.useState<ProviderStatsSource>(ProviderStatsSource.IR21);
  const [service, setService] = React.useState<ServiceFilter | null>(null);
  const [results, setResults] = React.useState<ProviderSummary[]>([]);
  const [selected, setSelected] = React.useState<ProviderSummary[]>([]);

  // The URL query string is the single source of truth for "what did we
  // last search for" — fires on initial load, on an explicit Search/toggle
  // change (via the router.push calls below), and when the browser Back/
  // Forward button restores a prior query.
  React.useEffect(() => {
    const urlSource = searchParams.get("source");
    const effectiveSource =
      urlSource && VALID_SOURCES.includes(urlSource) ? (urlSource as ProviderStatsSource) : ProviderStatsSource.IR21;
    const urlService = searchParams.get("service");
    const effectiveService =
      urlService && (VALID_SERVICES as readonly string[]).includes(urlService) ? (urlService as ServiceFilter) : null;
    setQ(searchParams.get("q") ?? "");
    setSource(effectiveSource);
    setService(effectiveService);

    const params = new URLSearchParams(searchParams);
    params.set("source", effectiveSource);
    api.get<ProviderSummary[]>(`/provider/search?${params.toString()}`).then(setResults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const pushParams = React.useCallback(
    (nextQ: string, nextSource: ProviderStatsSource, nextService?: ServiceFilter | null) => {
      const params = new URLSearchParams();
      if (nextQ) params.set("q", nextQ);
      params.set("source", nextSource);
      if (nextService) params.set("service", nextService);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router],
  );

  const runSearch = React.useCallback(() => pushParams(q, source, service), [pushParams, q, source, service]);

  const fetchSuggestions = React.useCallback(
    (query: string) => api.get<ProviderSuggestion[]>(`/provider/suggestions?q=${encodeURIComponent(query)}`),
    [],
  );

  const uniqueProviderCount = React.useMemo(() => new Set(results.map((r) => r.id)).size, [results]);

  // BOTH mode returns two rows per provider (IR21-only + REACH_LIST-only) —
  // dedupe by id so selecting both of one provider's rows still counts as
  // one provider toward the 2-5 compare limit.
  const uniqueSelected = React.useMemo(() => {
    const seen = new Map<number, ProviderSummary>();
    for (const s of selected) if (!seen.has(s.id)) seen.set(s.id, s);
    return Array.from(seen.values());
  }, [selected]);

  // In "Both (Combined)" mode, checking BOTH of one provider's two rows
  // (its IR21 row and its REACH_LIST row) isn't "comparing 2 providers" —
  // it's "compare this one provider's IR.21 footprint against its own
  // Reach List footprint", which the detail page's source=BOTH view already
  // renders as split columns. Route there instead of into the multi-
  // provider matrix (which operates on distinct provider ids, not sources).
  const selfCompareTarget = React.useMemo(() => {
    if (uniqueSelected.length !== 1) return null;
    const sources = new Set(selected.filter((s) => s.id === uniqueSelected[0].id).map((s) => s.source));
    return sources.has(ProviderStatsSource.IR21) && sources.has(ProviderStatsSource.REACH_LIST)
      ? uniqueSelected[0]
      : null;
  }, [selected, uniqueSelected]);

  const columnDefs = React.useMemo<ColDef<ProviderSummary>[]>(() => {
    const cols: ColDef<ProviderSummary>[] = [
      { field: "providerName", headerName: "Provider Name", flex: 1.5 },
      { field: "providerType", headerName: "Type" },
      { field: "headquarters", headerName: "Headquarters" },
      { field: "website", headerName: "Website", flex: 1.2 },
    ];
    if (source === ProviderStatsSource.BOTH) {
      cols.push({
        field: "source",
        headerName: "Source",
        valueFormatter: (p) => (p.value ? SOURCE_LABEL[p.value as ProviderStatsSource] : ""),
      });
    }
    cols.push(
      { field: "stats.totalMnos", headerName: "Total MNOs" },
      { field: "stats.totalCountries", headerName: "Countries" },
      { field: "stats.sccpCount", headerName: "SCCP" },
      { field: "stats.dsxCount", headerName: "DSX" },
      { field: "stats.ipxCount", headerName: "IPX" },
    );
    return cols;
  }, [source]);

  return (
    <RequireAuth>
      <AppShell>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
          Provider Search
        </Typography>
        <Paper sx={{ p: 2, mb: 3 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={9}>
              <SuggestionAutocomplete<ProviderSuggestion>
                label="Provider Name (e.g. Tata Comm, Syniverse, BICS)"
                value={q}
                onValueChange={setQ}
                fetchSuggestions={fetchSuggestions}
                getOptionLabel={(o) => (o.matchedAlias ? `${o.providerName} (alias: ${o.matchedAlias})` : o.providerName)}
                onEnter={runSearch}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <Button fullWidth variant="contained" startIcon={<SearchIcon />} onClick={runSearch}>
                Search
              </Button>
            </Grid>
            <Grid item xs={12}>
              <ToggleButtonGroup
                exclusive
                size="small"
                color="primary"
                value={source}
                onChange={(_, value) => value && pushParams(q, value, service)}
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 1,
                  "& .MuiToggleButton-root": {
                    borderRadius: "999px !important",
                    textTransform: "none",
                    px: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    minHeight: 44,
                    flex: { xs: "1 1 100%", sm: "0 1 auto" },
                  },
                }}
              >
                <ToggleButton value={ProviderStatsSource.IR21}>As per IR.21 Data</ToggleButton>
                <ToggleButton value={ProviderStatsSource.REACH_LIST}>As per Reach List</ToggleButton>
                <ToggleButton value={ProviderStatsSource.BOTH}>Both (Combined)</ToggleButton>
              </ToggleButtonGroup>
            </Grid>
          </Grid>
        </Paper>

        <Box sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Typography variant="body2" color="text.secondary">
            {uniqueProviderCount} result(s) — click a row for coverage stats, or check the box on 2-5 rows to
            compare selected providers side by side. {SOURCE_HELPER_TEXT[source]}
          </Typography>
          {service && (
            <Chip
              size="small"
              color="primary"
              label={`Filtered to ${service} providers`}
              onDelete={() => pushParams(q, source, null)}
              deleteIcon={<CloseIcon fontSize="small" />}
            />
          )}
        </Box>
        <DataGrid<ProviderSummary>
          rowData={results}
          columnDefs={columnDefs}
          rowSelection="multiRow"
          suppressRowClickSelection
          onSelectionChanged={setSelected}
          onRowClicked={(row) => router.push(`/search/provider/${row.id}?source=${row.source ?? source}`)}
        />

        {selfCompareTarget && (
          <Paper
            elevation={4}
            sx={{
              position: "fixed",
              bottom: 16,
              left: "50%",
              transform: "translateX(-50%)",
              px: { xs: 2, sm: 3 },
              py: 1.5,
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              alignItems: "center",
              gap: { xs: 1, sm: 2 },
              zIndex: 1200,
              borderRadius: { xs: 3, sm: 999 },
              maxWidth: "94vw",
            }}
          >
            <Typography variant="body2" noWrap sx={{ maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis" }}>
              {selfCompareTarget.providerName}: IR.21 row + Reach List row selected
            </Typography>
            <Button
              variant="contained"
              size="small"
              startIcon={<CompareArrowsIcon />}
              onClick={() => router.push(`/search/provider/${selfCompareTarget.id}?source=BOTH`)}
              sx={{ width: { xs: "100%", sm: "auto" } }}
            >
              View IR.21 vs Reach List for {selfCompareTarget.providerName}
            </Button>
          </Paper>
        )}

        {!selfCompareTarget && uniqueSelected.length >= 2 && (
          <Paper
            elevation={4}
            sx={{
              position: "fixed",
              bottom: 16,
              left: "50%",
              transform: "translateX(-50%)",
              px: { xs: 2, sm: 3 },
              py: 1.5,
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              alignItems: "center",
              gap: { xs: 1, sm: 2 },
              zIndex: 1200,
              borderRadius: { xs: 3, sm: 999 },
              maxWidth: "94vw",
            }}
          >
            <Typography variant="body2" noWrap sx={{ maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis" }}>
              {uniqueSelected.length} Provider(s) Selected: {uniqueSelected.map((p) => p.providerName).join(", ")}
              {uniqueSelected.length > 5 && " — max 5, deselect some to compare"}
            </Typography>
            <Button
              variant="contained"
              size="small"
              startIcon={<CompareArrowsIcon />}
              disabled={uniqueSelected.length > 5}
              onClick={() =>
                router.push(`/search/provider/compare?ids=${uniqueSelected.map((p) => p.id).join(",")}`)
              }
              sx={{ width: { xs: "100%", sm: "auto" } }}
            >
              Compare Selected Providers (Matrix)
            </Button>
          </Paper>
        )}
      </AppShell>
    </RequireAuth>
  );
}
