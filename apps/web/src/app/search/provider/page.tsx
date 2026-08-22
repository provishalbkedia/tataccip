"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Grid, Paper, TextField, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import DataGrid from "@/components/DataGrid";
import { api } from "@/lib/api";
import { ProviderSummary } from "@ccip/shared-types";

export default function ProviderSearchPage() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<ProviderSummary[]>([]);

  const runSearch = React.useCallback(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    api.get<ProviderSummary[]>(`/provider/search?${params.toString()}`).then(setResults);
  }, [q]);

  React.useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          </Grid>
        </Paper>

        <Box sx={{ mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {results.length} result(s) — click a row for coverage stats
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
