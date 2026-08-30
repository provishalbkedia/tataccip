"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { ICellRendererParams } from "ag-grid-community";
import {
  Box,
  Button,
  Chip,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import type { Theme } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
import RefreshIcon from "@mui/icons-material/Refresh";
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
  // The full label overflows its own floating-label box below ~400px —
  // shortened there rather than left to clip.
  const isMobile = useMediaQuery((t: Theme) => t.breakpoints.down("sm"));
  const [q, setQ] = React.useState("");
  const [tadig, setTadig] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [mcc, setMcc] = React.useState("");
  const [mnc, setMnc] = React.useState("");
  const [region, setRegion] = React.useState<Region | "">("");
  const [onlyWithProviders, setOnlyWithProviders] = React.useState(true);
  const [results, setResults] = React.useState<MnoSummary[]>([]);
  const [selected, setSelected] = React.useState<MnoSummary[]>([]);
  const [clearSignal, setClearSignal] = React.useState(0);
  const [warmingUp, setWarmingUp] = React.useState(false);

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
    setOnlyWithProviders(searchParams.get("onlyWithProviders") !== "false");
    api.get<MnoSummary[]>(`/mno/search?${searchParams.toString()}`).then(setResults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const pushParams = React.useCallback(
    (overrides?: { region?: Region | ""; onlyWithProviders?: boolean }) => {
      const nextRegion = overrides?.region ?? region;
      const nextOnlyWithProviders = overrides?.onlyWithProviders ?? onlyWithProviders;
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (tadig) params.set("tadig", tadig);
      if (country) params.set("country", country);
      if (mcc) params.set("mcc", mcc);
      if (mnc) params.set("mnc", mnc);
      if (nextRegion) params.set("region", nextRegion);
      // Only written to the URL when off the (true) default, so an
      // ordinary search URL stays clean.
      if (!nextOnlyWithProviders) params.set("onlyWithProviders", "false");
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [q, tadig, country, mcc, mnc, region, onlyWithProviders, pathname, router],
  );

  const runSearch = React.useCallback(() => pushParams(), [pushParams]);

  const fetchSuggestions = React.useCallback(
    (query: string) => api.get<MnoSuggestion[]>(`/mno/suggestions?q=${encodeURIComponent(query)}`),
    [],
  );

  // Pings the API to wake an idle Cloud Run instance, then re-runs the
  // current search so the (now-warm) results actually refresh — a bare
  // health ping alone would leave stale/empty results on screen.
  const handleWarmUp = React.useCallback(async () => {
    setWarmingUp(true);
    try {
      await api.ping();
      await api.get<MnoSummary[]>(`/mno/search?${searchParams.toString()}`).then(setResults);
    } finally {
      setWarmingUp(false);
    }
  }, [searchParams]);

  return (
    <RequireAuth>
      <AppShell>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", mb: 3 }}>
          <Typography variant="h5" fontWeight={700}>
            Operator Search
          </Typography>
          <Chip size="small" color="primary" label="GSMA IR.21 Declared" />
        </Box>
        <Paper sx={{ p: 2, mb: 2 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={3}>
              <SuggestionAutocomplete<MnoSuggestion>
                label={isMobile ? "Search Operator, TADIG, Country..." : "Search by Operator, TADIG, Country, MCC/MNC, or Carrier..."}
                value={q}
                onValueChange={setQ}
                fetchSuggestions={fetchSuggestions}
                getOptionLabel={(o) => o.operatorName}
                onEnter={runSearch}
              />
            </Grid>
            <Grid item xs={6} sm={1.5}>
              <TextField
                fullWidth
                label="TADIG"
                value={tadig}
                onChange={(e) => setTadig(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
              />
            </Grid>
            <Grid item xs={6} sm={1.5}>
              <TextField
                fullWidth
                label="Country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
              />
            </Grid>
            <Grid item xs={6} sm={2}>
              <TextField
                select
                fullWidth
                label="Region"
                value={region}
                onChange={(e) => setRegion(e.target.value as Region | "")}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
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
              <TextField
                fullWidth
                label="MCC"
                value={mcc}
                onChange={(e) => setMcc(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
              />
            </Grid>
            <Grid item xs={6} sm={1}>
              <TextField
                fullWidth
                label="MNC"
                value={mnc}
                onChange={(e) => setMnc(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
              />
            </Grid>
            <Grid item xs={9} sm={1.5}>
              <Button fullWidth variant="contained" startIcon={<SearchIcon />} onClick={runSearch}>
                Search
              </Button>
            </Grid>
            <Grid item xs={3} sm={0.5}>
              <Tooltip title="Refresh data / Warm up server">
                <IconButton
                  onClick={handleWarmUp}
                  disabled={warmingUp}
                  sx={{ minWidth: 44, minHeight: 44, border: "1px solid", borderColor: "divider" }}
                >
                  <RefreshIcon
                    fontSize="small"
                    sx={warmingUp ? { animation: "spin 1s linear infinite", "@keyframes spin": { to: { transform: "rotate(360deg)" } } } : undefined}
                  />
                </IconButton>
              </Tooltip>
            </Grid>
          </Grid>
        </Paper>

        <Box sx={{ mb: 3, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1.5 }}>
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

          <Tooltip title={onlyWithProviders ? "Showing only operators with at least one listed provider — toggle to see the full IR.21 baseline" : "Showing every operator, including those with no listed provider"}>
            <FormControlLabel
              sx={{ ml: 0 }}
              control={
                <Switch
                  checked={onlyWithProviders}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setOnlyWithProviders(next);
                    pushParams({ onlyWithProviders: next });
                  }}
                />
              }
              label={<Typography variant="body2">Only with listed providers</Typography>}
            />
          </Tooltip>
        </Box>

        <Box sx={{ mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {results.length} result(s) — Showing operator connectivity footprint strictly as declared in official
            GSMA IR.21 documents. Click a row for connectivity details, or check the box on 2–5 rows to compare
            selected operators side by side.
          </Typography>
        </Box>
        <DataGrid<MnoSummary>
          rowData={results}
          columnDefs={[
            { field: "operatorName", headerName: "Operator Name", flex: 1.5 },
            { field: "region", headerName: "Region", cellRenderer: RegionCell, minWidth: 140 },
            { field: "country", headerName: "Country" },
            {
              field: "sccpProviders",
              headerName: "SCCP Provider (IR.21)",
              flex: 1.4,
              valueFormatter: joinOrDash,
            },
            {
              field: "dsxProviders",
              headerName: "DSX / LTE Provider (IR.21)",
              flex: 1.4,
              valueFormatter: joinOrDash,
            },
            {
              field: "ipxProviders",
              headerName: "IPX Provider (IR.21)",
              flex: 1.4,
              valueFormatter: joinOrDash,
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
            { field: "tadigCode", headerName: "TADIG" },
            { field: "networkType", headerName: "Network Type" },
            { field: "asNumber", headerName: "AS Number (GRX/IPX)" },
            {
              field: "lastEffectiveDate",
              headerName: "Last Effective Date",
              valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleDateString() : ""),
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
