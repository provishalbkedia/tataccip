"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { ColDef } from "ag-grid-community";
import { Box, Button, Chip, Grid, Paper, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
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
                  "& .MuiToggleButton-root": {
                    borderRadius: "999px !important",
                    textTransform: "none",
                    px: 2,
                    mr: 1,
                    border: "1px solid",
                    borderColor: "divider",
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
            {uniqueProviderCount} result(s) — click a row for coverage stats. {SOURCE_HELPER_TEXT[source]}
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
          onRowClicked={(row) => router.push(`/search/provider/${row.id}`)}
        />
      </AppShell>
    </RequireAuth>
  );
}
