"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Grid, Paper, TextField, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import DataGrid from "@/components/DataGrid";
import { api } from "@/lib/api";
import { MnoSummary } from "@ccip/shared-types";

export default function MnoSearchPage() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [tadig, setTadig] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [mcc, setMcc] = React.useState("");
  const [mnc, setMnc] = React.useState("");
  const [results, setResults] = React.useState<MnoSummary[]>([]);

  const runSearch = React.useCallback(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (tadig) params.set("tadig", tadig);
    if (country) params.set("country", country);
    if (mcc) params.set("mcc", mcc);
    if (mnc) params.set("mnc", mnc);
    api.get<MnoSummary[]>(`/mno/search?${params.toString()}`).then(setResults);
  }, [q, tadig, country, mcc, mnc]);

  React.useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RequireAuth>
      <AppShell>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
          Operator Search
        </Typography>
        <Paper sx={{ p: 2, mb: 3 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Search by Operator, TADIG, Country, MCC/MNC, or Carrier..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
              />
            </Grid>
            <Grid item xs={6} sm={2}>
              <TextField fullWidth label="TADIG" value={tadig} onChange={(e) => setTadig(e.target.value)} />
            </Grid>
            <Grid item xs={6} sm={2}>
              <TextField fullWidth label="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
            </Grid>
            <Grid item xs={6} sm={1.5}>
              <TextField fullWidth label="MCC" value={mcc} onChange={(e) => setMcc(e.target.value)} />
            </Grid>
            <Grid item xs={6} sm={1.5}>
              <TextField fullWidth label="MNC" value={mnc} onChange={(e) => setMnc(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={1}>
              <Button fullWidth variant="contained" startIcon={<SearchIcon />} onClick={runSearch}>
                Search
              </Button>
            </Grid>
          </Grid>
        </Paper>

        <Box sx={{ mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {results.length} result(s) — click a row for the connectivity matrix
          </Typography>
        </Box>
        <DataGrid<MnoSummary>
          rowData={results}
          columnDefs={[
            { field: "operatorName", headerName: "Operator Name", flex: 1.5 },
            { field: "country", headerName: "Country" },
            { field: "tadigCode", headerName: "TADIG" },
            { field: "networkType", headerName: "Network Type" },
            { field: "primarySccpCarrier", headerName: "Primary SCCP Carrier", flex: 1.2 },
            {
              field: "backupSccpCarriers",
              headerName: "Backup SCCP Provider(s)",
              flex: 1.4,
              valueFormatter: (p) => (p.value && p.value.length > 0 ? p.value.join(", ") : "-"),
            },
            { field: "grxIpxProvider", headerName: "GRX/IPX Provider", flex: 1.2 },
            { field: "lteIpxProvider", headerName: "LTE IPX Provider", flex: 1.2 },
            {
              field: "lastEffectiveDate",
              headerName: "Last Effective Date",
              valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleDateString() : ""),
            },
            { field: "status", headerName: "Status" },
          ]}
          onRowClicked={(row) => router.push(`/search/mno/${row.id}`)}
        />
      </AppShell>
    </RequireAuth>
  );
}
