"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { ColDef } from "ag-grid-community";
import { Box, Button, Chip, Grid, Paper, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery } from "@mui/material";
import type { Theme } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import BoltIcon from "@mui/icons-material/Bolt";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import DataGrid from "@/components/DataGrid";
import SuggestionAutocomplete from "@/components/SuggestionAutocomplete";
import ProviderCoverageCharts from "./ProviderCoverageCharts";
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
  const isMobile = useMediaQuery((t: Theme) => t.breakpoints.down("sm"));
  const [q, setQ] = React.useState("");
  // Default is "As per IR.21 Data", not the combined view — only overridden
  // when the URL explicitly carries a different source (e.g. restored via
  // Back navigation, or a shared link).
  const [source, setSource] = React.useState<ProviderStatsSource>(ProviderStatsSource.IR21);
  const [service, setService] = React.useState<ServiceFilter | null>(null);
  const [results, setResults] = React.useState<ProviderSummary[]>([]);
  const [selected, setSelected] = React.useState<ProviderSummary[]>([]);
  const [clearSignal, setClearSignal] = React.useState(0);

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

  // In "Both (Combined)" source mode, `results` carries two rows per
  // provider (IR21-sourced + REACH_LIST-sourced) with the same id. Both the
  // coverage charts and the Quick Benchmark Shortcuts below need "one row
  // per provider, ranked by reach" -- computed once here so both consume
  // the identical ranking rather than deriving their own copies. Taking the
  // larger of the two totalMnos per provider avoids both double-listing the
  // same provider under two bars and overstating its reach by summing two
  // counts that plausibly overlap (the same MNO can appear in both source's
  // figures for that provider).
  const rankedProviders = React.useMemo(() => {
    const byId = new Map<number, ProviderSummary>();
    for (const r of results) {
      const existing = byId.get(r.id);
      if (!existing || r.stats.totalMnos > existing.stats.totalMnos) byId.set(r.id, r);
    }
    return Array.from(byId.values()).sort((a, b) => b.stats.totalMnos - a.stats.totalMnos);
  }, [results]);

  // Chart-driven drill-down (bar click) reuses the same free-text search
  // the manual search box does, matching how a click there is one exact
  // provider name -- Provider Search has no separate provider-filter
  // dimension the way MNO Search's Wholesale Provider Autocomplete does.
  const handleProviderChartClick = React.useCallback(
    (providerName: string) => pushParams(providerName, source, service),
    [pushParams, source, service],
  );

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

  // Removing one carrier's chip from the benchmark banner's selection slots
  // -- updates our own state immediately (chip disappears without waiting
  // on a grid round-trip) and tells the grid to deselect that provider's
  // row(s) too (both its IR21 and REACH_LIST rows share this id in "Both"
  // mode), so its checkbox doesn't stay visually checked.
  const [deselectSignal, setDeselectSignal] = React.useState<{ ids: number[] } | null>(null);
  const handleRemoveFromSelection = React.useCallback((providerId: number) => {
    setSelected((prev) => prev.filter((s) => s.id !== providerId));
    setDeselectSignal({ ids: [providerId] });
  }, []);

  // Quick Benchmark Shortcuts -- one-click comparisons of the current
  // scope's own top 2 / top 3 providers by MNO coverage (the same ranking
  // "Top Providers by MNO Coverage" charts), rather than hardcoded carrier
  // names. A fixed name list would silently do nothing (or compare fewer
  // than intended) whenever one of those names isn't in the current search
  // scope or dataset -- deriving from rankedProviders instead means the
  // shortcut is always comparing whatever's actually top-ranked right now.
  const quickShortcuts = React.useMemo(() => {
    const top2 = rankedProviders.slice(0, 2);
    const top3 = rankedProviders.slice(0, 3);
    const shortcuts: { label: string; ids: number[] }[] = [];
    if (top2.length === 2) {
      shortcuts.push({ label: `Compare Top 2: ${top2.map((p) => p.providerName).join(" vs ")}`, ids: top2.map((p) => p.id) });
    }
    if (top3.length === 3) {
      shortcuts.push({ label: `Compare Top 3: ${top3.map((p) => p.providerName).join(" vs ")}`, ids: top3.map((p) => p.id) });
    }
    return shortcuts;
  }, [rankedProviders]);

  const columnDefs = React.useMemo<ColDef<ProviderSummary>[]>(() => {
    const cols: ColDef<ProviderSummary>[] = [
      {
        field: "providerName",
        headerName: "Provider Name",
        flex: 1.5,
        cellRenderer: (p: { value: string; data?: ProviderSummary }) =>
          p.data ? (
            <span
              role="link"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/search/provider/${p.data!.id}?source=${p.data!.source ?? source}`);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.stopPropagation();
                router.push(`/search/provider/${p.data!.id}?source=${p.data!.source ?? source}`);
              }}
              style={{ color: "#0B6FBF", fontWeight: 600, cursor: "pointer", textDecoration: "none" }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
            >
              {p.value}
            </span>
          ) : (
            p.value
          ),
      },
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
  }, [source, router]);

  // Reserves space below the grid's own pagination bar so the fixed-
  // position selection dock (bottom: 16, ~64px tall) never sits on top of
  // it on a short page -- only applied while a dock is actually showing.
  const bottomDockVisible = !!selfCompareTarget || uniqueSelected.length >= 2;

  return (
    <RequireAuth>
      <AppShell>
        {/* The dock is taller on mobile (text + 2 buttons stacked in a
           column) than on desktop (single row) -- a flat padding sized for
           the desktop dock left the mobile one still overlapping the
           pagination bar's last line. */}
        <Box sx={{ pb: bottomDockVisible ? { xs: 24, sm: 10 } : 0 }}>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
          Provider Search
        </Typography>
        <Paper sx={{ p: 2, mb: 3 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={9}>
              <SuggestionAutocomplete<ProviderSuggestion>
                label={isMobile ? "Provider Name..." : "Provider Name (e.g. Tata Comm, Syniverse, BICS)"}
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

        <ProviderCoverageCharts rankedProviders={rankedProviders} source={source} onProviderClick={handleProviderChartClick} />

        {/* Side-by-Side Carrier Benchmark -- the multi-provider compare
           feature was previously discoverable only via a faint instructional
           sentence inside the results summary box, easy for a first-time
           user (or an executive skimming the page) to miss entirely. This
           surfaces it as its own high-visibility action strip directly above
           the table, with live selection slots so progress toward the 2-5
           range is visible without scrolling down to the floating dock. */}
        <Paper
          variant="outlined"
          sx={{
            mb: 1.5,
            p: 2,
            borderColor: "#CFD8DC",
            borderLeft: "4px solid #00D4B2",
            background: "linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 100%)",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, flexWrap: "wrap" }}>
            <CompareArrowsIcon sx={{ color: "#0A2540", mt: 0.25 }} />
            <Box sx={{ flex: 1, minWidth: 260 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ color: "#0A2540" }}>
                Side-by-Side Carrier Benchmark (Select 2–5 Providers)
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                Select checkboxes or click rows to compare global footprint, shared MNO accounts, and service
                dominance side-by-side.
              </Typography>
            </Box>
          </Box>

          <Box sx={{ mt: 1.5, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
            {Array.from({ length: 5 }).map((_, i) => {
              const p = uniqueSelected[i];
              return p ? (
                <Chip
                  key={p.id}
                  label={p.providerName}
                  onDelete={() => handleRemoveFromSelection(p.id)}
                  sx={{ bgcolor: "#0A2540", color: "#fff", fontWeight: 600, "& .MuiChip-deleteIcon": { color: "rgba(255,255,255,0.7)" } }}
                />
              ) : (
                <Chip
                  key={`slot-${i}`}
                  variant="outlined"
                  label={i < 2 ? `Carrier ${i + 1}` : `+ Slot ${i + 1}`}
                  sx={{ borderStyle: "dashed", borderColor: "#CFD8DC", color: "text.disabled" }}
                />
              );
            })}
            {uniqueSelected.length >= 2 && (
              <Button
                variant="contained"
                size="small"
                onClick={() => router.push(`/search/provider/compare?ids=${uniqueSelected.map((p) => p.id).join(",")}`)}
                sx={{ bgcolor: "#0A2540", color: "#fff", fontWeight: 700, ml: "auto" }}
              >
                Compare Selected Providers ({uniqueSelected.length}) &rarr;
              </Button>
            )}
          </Box>

          {quickShortcuts.length > 0 && (
            <Box sx={{ mt: 1.5, display: "flex", flexWrap: "wrap", gap: 1 }}>
              {quickShortcuts.map((s) => (
                <Chip
                  key={s.label}
                  icon={<BoltIcon fontSize="small" sx={{ color: "#B45309 !important" }} />}
                  label={s.label}
                  onClick={() => router.push(`/search/provider/compare?ids=${s.ids.join(",")}`)}
                  sx={{ bgcolor: "#FFF3DC", color: "#7C4A03", fontWeight: 600, cursor: "pointer", "&:hover": { bgcolor: "#FFE9B8" } }}
                />
              ))}
            </Box>
          )}
        </Paper>

        {/* Results Summary -- same treatment as MNO Search's stat strip: the
           result count reads at a glance instead of opening a paragraph of
           grey instructional text, with the "how to use this table" copy
           demoted to a caption underneath. */}
        <Paper variant="outlined" sx={{ mb: 1.5, p: 1.5, borderColor: "#BFD4E8", bgcolor: "#F4F8FC" }}>
          <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1.5 }}>
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
              <Typography variant="h5" sx={{ fontWeight: 800, color: "#0A2540", lineHeight: 1 }}>
                {uniqueProviderCount}
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 600 }}>
                result{uniqueProviderCount === 1 ? "" : "s"}
              </Typography>
            </Box>
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
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Click anywhere on a row (or its checkbox) to select 2-5 for side-by-side comparison, or click a
            provider&apos;s name to open its coverage stats. {SOURCE_HELPER_TEXT[source]}
          </Typography>
        </Paper>
        <DataGrid<ProviderSummary>
          rowData={results}
          columnDefs={columnDefs}
          rowSelection="multiRow"
          onSelectionChanged={setSelected}
          clearSelectionSignal={clearSignal}
          getRowId={(row) => row.id}
          deselectSignal={deselectSignal}
          showTopPagination
          exportFileName="provider-search-results"
        />
        </Box>

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
            elevation={0}
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
              bgcolor: "#0A2540",
              border: "1px solid #00D4B2",
              boxShadow: "0 8px 24px rgba(10, 37, 64, 0.3)",
            }}
          >
            <Typography variant="body2" noWrap sx={{ maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", color: "#fff" }}>
              {uniqueSelected.length} of 5 Providers Selected: {uniqueSelected.map((p) => p.providerName).join(", ")}
              {uniqueSelected.length > 5 && " — max 5, deselect some to compare"}
            </Typography>
            <Box sx={{ display: "flex", gap: 1, width: { xs: "100%", sm: "auto" } }}>
              <Button
                variant="contained"
                size="small"
                startIcon={<CompareArrowsIcon />}
                disabled={uniqueSelected.length > 5}
                onClick={() =>
                  router.push(`/search/provider/compare?ids=${uniqueSelected.map((p) => p.id).join(",")}`)
                }
                sx={{
                  flex: { xs: 1, sm: "0 0 auto" },
                  bgcolor: "#00D4B2",
                  color: "#0A2540",
                  fontWeight: 700,
                  "&:hover": { bgcolor: "#00E8C4" },
                }}
              >
                Launch Comparative Analysis &rarr;
              </Button>
              <Button
                size="small"
                startIcon={<CloseIcon />}
                onClick={() => {
                  setSelected([]);
                  setClearSignal((n) => n + 1);
                }}
                sx={{ flex: { xs: "0 0 auto", sm: "0 0 auto" }, color: "#fff" }}
              >
                Clear All
              </Button>
            </Box>
          </Paper>
        )}
      </AppShell>
    </RequireAuth>
  );
}
