"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { ICellRendererParams } from "ag-grid-community";
import {
  Box,
  Button,
  Chip,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import ClearIcon from "@mui/icons-material/Clear";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import DataGrid from "@/components/DataGrid";
import SuggestionAutocomplete from "@/components/SuggestionAutocomplete";
import { api } from "@/lib/api";
import { openMnoPdf } from "@/lib/openPdf";
import { MnoSuggestion, MnoSummary, Region } from "@ccip/shared-types";

const REGION_OPTIONS: Region[] = [Region.AMERICAS, Region.MEA, Region.EUROPE, Region.APAC, Region.NON_TERRESTRIAL];

const REGION_CHIP_COLOR: Record<Region, { bgcolor: string; color: string }> = {
  [Region.AMERICAS]: { bgcolor: "#0B6FBF", color: "#fff" },
  [Region.MEA]: { bgcolor: "#EF6C00", color: "#fff" },
  [Region.EUROPE]: { bgcolor: "#6A1B9A", color: "#fff" },
  [Region.APAC]: { bgcolor: "#00796B", color: "#fff" },
  [Region.NON_TERRESTRIAL]: { bgcolor: "#616161", color: "#fff" },
};

/** Colored Region badge — blue/orange/purple/teal/grey per REGION_CHIP_COLOR.
 * "-" for the rare unclassifiable country (see region-mapper.ts). */
function RegionCell(params: ICellRendererParams<MnoSummary>) {
  const region = params.value as Region | null | undefined;
  if (!region) return <span style={{ color: "rgba(0,0,0,0.4)" }}>-</span>;
  const palette = REGION_CHIP_COLOR[region] ?? REGION_CHIP_COLOR[Region.NON_TERRESTRIAL];
  return <Chip label={region} size="small" sx={{ bgcolor: palette.bgcolor, color: palette.color, fontWeight: 600 }} />;
}

/** stopPropagation so clicking the PDF icon doesn't also trigger the row's
 * own onRowClicked navigation to the detail page. */
function PdfCell(params: ICellRendererParams<MnoSummary>) {
  if (!params.data?.hasPdfDocument) {
    return <span style={{ color: "rgba(0,0,0,0.4)" }}>-</span>;
  }
  return (
    <IconButton
      size="small"
      color="error"
      title="View IR.21 PDF"
      onClick={(e) => {
        e.stopPropagation();
        if (params.data) openMnoPdf(params.data.id);
      }}
    >
      <PictureAsPdfIcon fontSize="small" />
    </IconButton>
  );
}

/** Renders a string-array cell as a comma-joined list, "-" when empty/absent.
 * Defensive about the shape since it's an ag-grid valueFormatter, not a
 * type-checked call site. */
function joinOrDash(params: { value: unknown }): string {
  const v = params.value;
  if (!v) return "-";
  if (Array.isArray(v)) return v.length > 0 ? v.join(", ") : "-";
  return String(v);
}

export default function MnoSearchPage() {
  return (
    <React.Suspense fallback={null}>
      <MnoSearchPageInner />
    </React.Suspense>
  );
}

function MnoSearchPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = React.useState("");
  const [tadig, setTadig] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [mcc, setMcc] = React.useState("");
  const [mnc, setMnc] = React.useState("");
  const [region, setRegion] = React.useState<Region | "">("");
  const [results, setResults] = React.useState<MnoSummary[]>([]);
  const [selected, setSelected] = React.useState<MnoSummary[]>([]);
  const [clearSignal, setClearSignal] = React.useState(0);

  // The URL query string is the single source of truth for "what did we
  // last search for" — this fires on initial load, on an explicit Search
  // (via the router.push below), and when the browser Back/Forward button
  // restores a prior query, syncing the input fields and refetching in all
  // three cases without needing separate logic for each.
  React.useEffect(() => {
    setQ(searchParams.get("q") ?? "");
    setTadig(searchParams.get("tadig") ?? "");
    setCountry(searchParams.get("country") ?? "");
    setMcc(searchParams.get("mcc") ?? "");
    setMnc(searchParams.get("mnc") ?? "");
    const urlRegion = searchParams.get("region");
    setRegion(urlRegion && (REGION_OPTIONS as string[]).includes(urlRegion) ? (urlRegion as Region) : "");
    api.get<MnoSummary[]>(`/mno/search?${searchParams.toString()}`).then(setResults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const pushParams = React.useCallback(
    (overrides?: { region?: Region | "" }) => {
      const nextRegion = overrides?.region ?? region;
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (tadig) params.set("tadig", tadig);
      if (country) params.set("country", country);
      if (mcc) params.set("mcc", mcc);
      if (mnc) params.set("mnc", mnc);
      if (nextRegion) params.set("region", nextRegion);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [q, tadig, country, mcc, mnc, region, pathname, router],
  );

  const runSearch = React.useCallback(() => pushParams(), [pushParams]);

  const fetchSuggestions = React.useCallback(
    (query: string) => api.get<MnoSuggestion[]>(`/mno/suggestions?q=${encodeURIComponent(query)}`),
    [],
  );

  return (
    <RequireAuth>
      <AppShell>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
          Operator Search
        </Typography>
        <Paper sx={{ p: 2, mb: 2 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={3}>
              <SuggestionAutocomplete<MnoSuggestion>
                label="Search by Operator, TADIG, Country, MCC/MNC, or Carrier..."
                value={q}
                onValueChange={setQ}
                fetchSuggestions={fetchSuggestions}
                getOptionLabel={(o) => o.operatorName}
                onEnter={runSearch}
              />
            </Grid>
            <Grid item xs={6} sm={1.5}>
              <TextField fullWidth label="TADIG" value={tadig} onChange={(e) => setTadig(e.target.value)} />
            </Grid>
            <Grid item xs={6} sm={1.5}>
              <TextField fullWidth label="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
            </Grid>
            <Grid item xs={6} sm={2}>
              <TextField
                select
                fullWidth
                label="Region"
                value={region}
                onChange={(e) => setRegion(e.target.value as Region | "")}
              >
                <MenuItem value="">All Regions</MenuItem>
                {REGION_OPTIONS.map((r) => (
                  <MenuItem key={r} value={r}>
                    {r}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={6} sm={1}>
              <TextField fullWidth label="MCC" value={mcc} onChange={(e) => setMcc(e.target.value)} />
            </Grid>
            <Grid item xs={6} sm={1}>
              <TextField fullWidth label="MNC" value={mnc} onChange={(e) => setMnc(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={2}>
              <Button fullWidth variant="contained" startIcon={<SearchIcon />} onClick={runSearch}>
                Search
              </Button>
            </Grid>
          </Grid>
        </Paper>

        <Box sx={{ mb: 3 }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            color="primary"
            value={region || "ALL"}
            onChange={(_, value) => {
              if (!value) return;
              const nextRegion: Region | "" = value === "ALL" ? "" : value;
              setRegion(nextRegion);
              pushParams({ region: nextRegion });
            }}
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
              },
            }}
          >
            <ToggleButton value="ALL">All</ToggleButton>
            {REGION_OPTIONS.map((r) => (
              <ToggleButton key={r} value={r}>
                {r}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>

        <Box sx={{ mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {results.length} result(s) — click a row for the connectivity matrix, or check the box on 2-5 rows to
            compare selected operators side by side.
          </Typography>
        </Box>
        <DataGrid<MnoSummary>
          rowData={results}
          columnDefs={[
            { field: "operatorName", headerName: "Operator Name", flex: 1.5 },
            { field: "region", headerName: "Region", cellRenderer: RegionCell, minWidth: 140 },
            { field: "country", headerName: "Country" },
            { field: "tadigCode", headerName: "TADIG" },
            { field: "networkType", headerName: "Network Type" },
            {
              field: "sccpProviders",
              headerName: "SCCP Provider(s)",
              flex: 1.4,
              valueFormatter: joinOrDash,
            },
            {
              field: "dsxProviders",
              headerName: "DSX Provider(s)",
              flex: 1.4,
              valueFormatter: joinOrDash,
            },
            {
              field: "ipxProviders",
              headerName: "IPX Provider(s)",
              flex: 1.4,
              valueFormatter: joinOrDash,
            },
            {
              field: "lastEffectiveDate",
              headerName: "Last Effective Date",
              valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleDateString() : ""),
            },
            {
              field: "hasPdfDocument",
              headerName: "IR.21 PDF",
              cellRenderer: PdfCell,
              sortable: false,
              filter: false,
              minWidth: 100,
              flex: 0.6,
            },
            { field: "status", headerName: "Status" },
          ]}
          rowSelection="multiRow"
          suppressRowClickSelection
          onSelectionChanged={setSelected}
          clearSelectionSignal={clearSignal}
          onRowClicked={(row) => router.push(`/search/mno/${row.id}`)}
          showTopPagination
          exportFileName="operator-search-results"
        />

        {selected.length >= 2 && (
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
              {selected.length} Operator(s) Selected: {selected.map((m) => m.operatorName).join(", ")}
              {selected.length > 5 && " — max 5, deselect some to compare"}
            </Typography>
            <Box sx={{ display: "flex", gap: 1, width: { xs: "100%", sm: "auto" } }}>
              <Button
                variant="contained"
                size="small"
                startIcon={<CompareArrowsIcon />}
                disabled={selected.length > 5}
                onClick={() => router.push(`/search/mno/compare?ids=${selected.map((m) => m.id).join(",")}`)}
                sx={{ flex: { xs: 1, sm: "0 0 auto" } }}
              >
                Compare Selected Operators (Matrix)
              </Button>
              <Button
                size="small"
                startIcon={<ClearIcon />}
                onClick={() => {
                  setSelected([]);
                  setClearSignal((n) => n + 1);
                }}
                sx={{ flex: { xs: "0 0 auto", sm: "0 0 auto" } }}
              >
                Clear Selection
              </Button>
            </Box>
          </Paper>
        )}
      </AppShell>
    </RequireAuth>
  );
}
