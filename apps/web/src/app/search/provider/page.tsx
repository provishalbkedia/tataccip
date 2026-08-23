"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Grid, Paper, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import DataGrid from "@/components/DataGrid";
import { api } from "@/lib/api";
import { ProviderStatsSource, ProviderSummary } from "@ccip/shared-types";

const SOURCE_HELPER_TEXT: Record<ProviderStatsSource, string> = {
  [ProviderStatsSource.IR21]: "Showing provider coverage footprint as declared in GSMA IR.21 documents.",
  [ProviderStatsSource.REACH_LIST]: "Showing provider coverage footprint claimed in published Reach Lists.",
  [ProviderStatsSource.BOTH]: "Showing combined provider coverage footprint across IR.21 and Reach List data.",
};

export default function ProviderSearchPage() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [source, setSource] = React.useState<ProviderStatsSource>(ProviderStatsSource.BOTH);
  const [results, setResults] = React.useState<ProviderSummary[]>([]);

  const runSearch = React.useCallback(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("source", source);
    api.get<ProviderSummary[]>(`/provider/search?${params.toString()}`).then(setResults);
  }, [q, source]);

  React.useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              <TextField
                fullWidth
                label="Provider Name (e.g. Tata Comm, Syniverse, BICS)"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
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
                onChange={(_, value) => value && setSource(value)}
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

        <Box sx={{ mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {results.length} result(s) — click a row for coverage stats. {SOURCE_HELPER_TEXT[source]}
          </Typography>
        </Box>
        <DataGrid<ProviderSummary>
          rowData={results}
          columnDefs={[
            { field: "providerName", headerName: "Provider Name", flex: 1.5 },
            { field: "providerType", headerName: "Type" },
            { field: "headquarters", headerName: "Headquarters" },
            { field: "website", headerName: "Website", flex: 1.2 },
            { field: "stats.totalMnos", headerName: "Total MNOs" },
            { field: "stats.totalCountries", headerName: "Countries" },
            { field: "stats.sccpCount", headerName: "SCCP" },
            { field: "stats.dsxCount", headerName: "DSX" },
            { field: "stats.ipxCount", headerName: "IPX" },
          ]}
          onRowClicked={(row) => router.push(`/search/provider/${row.id}`)}
        />
      </AppShell>
    </RequireAuth>
  );
}
