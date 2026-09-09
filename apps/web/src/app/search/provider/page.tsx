"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { ColDef } from "ag-grid-community";
import {
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  Grid,
  Link as MuiLink,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
} from "@mui/material";
import type { Theme } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import BoltIcon from "@mui/icons-material/Bolt";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import DataGrid from "@/components/DataGrid";
import SuggestionAutocomplete from "@/components/SuggestionAutocomplete";
import ProviderCoverageCharts from "./ProviderCoverageCharts";
import { api } from "@/lib/api";
import { ProviderReportInput } from "@/lib/reports/providerReportData";
import { ProviderStatsSource, ProviderSuggestion, ProviderSummary } from "@ccip/shared-types";

const SOURCE_LABEL: Record<ProviderStatsSource, string> = {
  [ProviderStatsSource.IR21]: "IR.21",
  [ProviderStatsSource.REACH_LIST]: "Reach List",
  [ProviderStatsSource.BOTH]: "Both",
};

// Matches the Dataset Scope pill bar's own button text exactly (e.g. "As
// per IR.21 Data", not SOURCE_LABEL's short "IR.21") so the Active Filters
// ribbon and the contextual table banner name the filter the same way the
// control the user clicked does.
const SOURCE_PILL_LABEL: Record<ProviderStatsSource, string> = {
  [ProviderStatsSource.IR21]: "As per IR.21 Data",
  [ProviderStatsSource.REACH_LIST]: "As per Reach List",
  [ProviderStatsSource.BOTH]: "Both (Combined)",
};

const SOURCE_HELPER_TEXT: Record<ProviderStatsSource, string> = {
  [ProviderStatsSource.IR21]: "Showing provider coverage footprint as declared in GSMA IR.21 documents.",
  [ProviderStatsSource.REACH_LIST]: "Showing provider coverage footprint claimed in published Reach Lists.",
  [ProviderStatsSource.BOTH]: "Showing one row per source per provider — compare the IR.21 footprint against the Reach List footprint directly.",
};

// Same high-contrast treatment MNO Search's masterPillGroupSx uses -- the
// Dataset Scope pills here previously used plain low-contrast outlines that
// barely stood out even when active, unlike every other pill bar in the app.
const highContrastPillGroupSx = {
  "& .MuiToggleButton-root": {
    borderRadius: "999px !important",
    textTransform: "none",
    px: 2,
    minHeight: 40,
    border: "1px solid",
    borderColor: "#CFD8DC",
    bgcolor: "#FFFFFF",
    color: "#0A2540",
    fontWeight: 500,
    transition: "box-shadow 0.15s, background-color 0.15s",
    "&:hover": { bgcolor: "#F4F6F8" },
    "&.Mui-selected, &.Mui-selected:hover": {
      bgcolor: "#0A2540",
      color: "#FFFFFF",
      fontWeight: 600,
      borderColor: "#00D4B2",
      boxShadow: "0 2px 4px rgba(10,37,64,0.15)",
    },
  },
};

const VALID_SOURCES: string[] = Object.values(ProviderStatsSource);
const VALID_SERVICES = ["SCCP", "DSX", "IPX"] as const;
type ServiceFilter = (typeof VALID_SERVICES)[number];

// sessionStorage key for the "scroll to results on next fetch" flag -- see
// its own comment where it's read/written inside ProviderSearchPageInner.
// sessionStorage, not a ref/plain state, since this page's useSearchParams()
// sits inside a <Suspense> boundary (see the default export below), and a
// client-side search navigation can remount ProviderSearchPageInner --
// wiping a ref/state set immediately beforehand before the fetch it's meant
// to signal ever resolves. Confirmed as the actual failure mode (not just a
// theoretical one) on MNO Search's own identical scroll-on-search feature.
const SCROLL_PENDING_KEY = "ccip-provider-search-scroll-pending";

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
  // "How many providers exist under the current Dataset Scope with no
  // search term" -- independent of `q`, so the "View All N Providers"
  // quick link always names the real total to escape back to, not just
  // whatever's currently on screen once a search has narrowed it down.
  const [baselineCount, setBaselineCount] = React.useState<number | null>(null);

  // Smooth-scrolls to the results banner once a fresh search actually
  // lands, rather than leaving the user looking at the controls with no
  // visual confirmation their query did anything -- set right before
  // runSearch's pushParams() call below, consumed (and cleared) once this
  // effect has fresh `results` in hand.
  const resultsRef = React.useRef<HTMLDivElement>(null);
  const [resultsPulse, setResultsPulse] = React.useState(false);

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
    api.get<ProviderSummary[]>(`/provider/search?${params.toString()}`).then((data) => {
      setResults(data);
      // Only fires for a search actually initiated via runSearch (Enter /
      // the Search button) -- a plain page load/Back-Forward restore, or a
      // Dataset Scope pill change, never sets this flag, so neither yanks
      // the viewport unexpectedly.
      if (sessionStorage.getItem(SCROLL_PENDING_KEY) === "1") {
        sessionStorage.removeItem(SCROLL_PENDING_KEY);
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        setResultsPulse(true);
        setTimeout(() => setResultsPulse(false), 1800);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Deliberately its own fetch (not derived from `results`) so it stays
  // accurate to "the whole Dataset Scope, no search applied" regardless of
  // whatever `q` currently narrows the main results down to.
  React.useEffect(() => {
    const urlSource = searchParams.get("source");
    const effectiveSource =
      urlSource && VALID_SOURCES.includes(urlSource) ? (urlSource as ProviderStatsSource) : ProviderStatsSource.IR21;
    api
      .get<ProviderSummary[]>(`/provider/search?source=${effectiveSource}`)
      .then((res) => setBaselineCount(new Set(res.map((r) => r.id)).size));
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

  const runSearch = React.useCallback(() => {
    sessionStorage.setItem(SCROLL_PENDING_KEY, "1");
    pushParams(q, source, service);
  }, [pushParams, q, source, service]);

  // Which top-level tab is active -- synced to the URL (not separate React
  // state) so a direct/shared link to ?tab=benchmark lands on the compare
  // roster, and Back/Forward navigates between the two the same way it
  // already does for every other filter on this page. Preserves whatever
  // q/source/service are currently set (unlike pushParams above, which
  // always rebuilds params from scratch) -- switching tabs is not itself a
  // search-scope change.
  const activeTab: "directory" | "benchmark" = searchParams.get("tab") === "benchmark" ? "benchmark" : "directory";
  const handleTabChange = React.useCallback(
    (_: React.SyntheticEvent, next: "directory" | "benchmark") => {
      const params = new URLSearchParams(searchParams);
      params.set("tab", next);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, pathname, router],
  );

  const fetchSuggestions = React.useCallback(
    (query: string) => api.get<ProviderSuggestion[]>(`/provider/suggestions?q=${encodeURIComponent(query)}`),
    [],
  );

  // Full reset -- clears the search term AND restores Dataset Scope to its
  // own default (IR.21 Verified), the same baseline a fresh page load
  // starts from. Distinct from clearing just the search term (used by the
  // "View All N Providers" quick link), which deliberately keeps whichever
  // Dataset Scope the user had picked.
  const resetAllFilters = React.useCallback(() => {
    setQ("");
    setSource(ProviderStatsSource.IR21);
    setService(null);
    router.push(pathname, { scroll: false });
  }, [pathname, router]);

  const hasActiveFilters = !!q || source !== ProviderStatsSource.IR21 || !!service;

  // Drives the Active Filters ribbon -- one entry per narrowing dimension
  // currently applied, each individually dismissible, so a user combining
  // e.g. a search term with a non-default Dataset Scope can back either one
  // out without losing the other (or without hunting for which pill/field
  // to go touch again).
  const activeFilterDimensions = React.useMemo(
    () =>
      [
        !!q && { key: "q", label: `Search: "${q}"`, onClear: () => pushParams("", source, service) },
        source !== ProviderStatsSource.IR21 && {
          key: "source",
          label: `Dataset: ${SOURCE_PILL_LABEL[source]}`,
          onClear: () => pushParams(q, ProviderStatsSource.IR21, service),
        },
        !!service && { key: "service", label: `Declared: ${service} Only`, onClear: () => pushParams(q, source, null) },
      ].filter((d): d is { key: string; label: string; onClear: () => void } => !!d),
    [q, source, service, pushParams],
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

  // ---- Provider MIS report downloads ----
  // providerPdfReport/providerExcelReport (and jspdf/jspdf-autotable/
  // exceljs, which they wrap) are dynamically imported only once a user
  // actually picks a format -- same "don't pay for a report nobody may ever
  // generate" reasoning as the other MIS report suites in the app.
  const [providerReportMenuAnchor, setProviderReportMenuAnchor] = React.useState<HTMLElement | null>(null);
  const [generatingProviderReport, setGeneratingProviderReport] = React.useState<"pdf" | "excel" | null>(null);
  const PROVIDER_REPORT_GENERATING_LABEL: Record<"pdf" | "excel", string> = {
    pdf: "Generating Brief…",
    excel: "Generating Workbook…",
  };

  const providerReportInput = React.useMemo<ProviderReportInput>(
    () => ({ generatedAt: new Date(), scope: { source, search: q || null }, rankedProviders }),
    [source, q, rankedProviders],
  );

  const handleDownloadProviderPdf = React.useCallback(async () => {
    setProviderReportMenuAnchor(null);
    setGeneratingProviderReport("pdf");
    try {
      const { generateProviderPdfReport } = await import("@/lib/reports/providerPdfReport");
      await generateProviderPdfReport(providerReportInput);
    } finally {
      setGeneratingProviderReport(null);
    }
  }, [providerReportInput]);

  const handleDownloadProviderExcel = React.useCallback(async () => {
    setProviderReportMenuAnchor(null);
    setGeneratingProviderReport("excel");
    try {
      const { generateProviderExcelReport } = await import("@/lib/reports/providerExcelReport");
      await generateProviderExcelReport(providerReportInput);
    } finally {
      setGeneratingProviderReport(null);
    }
  }, [providerReportInput]);

  const handleDownloadProviderCsv = React.useCallback(async () => {
    setProviderReportMenuAnchor(null);
    const { generateProviderCsvExport } = await import("@/lib/reports/providerCsvReport");
    generateProviderCsvExport(providerReportInput);
  }, [providerReportInput]);

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
        <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
          Provider Search
        </Typography>

        {/* Tactile segmented tab dock -- splits what used to be one long
           page mixing a general directory lookup with multi-provider
           compare selection into two focused workspaces. A flat MUI <Tabs>
           underline read as static secondary text (nothing signaled the
           inactive tab was clickable); this recessed tray + raised active
           card gives both tabs real physical presence instead. Selection
           state (selected/uniqueSelected) lives outside this conditional,
           so it survives switching tabs, and the Benchmark tab's own pill
           badge picks up a live count the moment 2+ providers are
           selected. */}
        <Box
          sx={{
            display: "inline-flex",
            gap: "5px",
            p: "6px",
            mb: 3,
            bgcolor: "#EDF2F7",
            border: "1px solid #CBD5E1",
            borderRadius: "12px",
            boxShadow: "inset 0 2px 4px rgba(0,0,0,0.06)",
          }}
        >
          <ButtonBase
            onClick={(e) => handleTabChange(e, "directory")}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.2,
              px: 2.5,
              py: 1.2,
              borderRadius: "8px",
              fontWeight: activeTab === "directory" ? 700 : 600,
              fontSize: "0.92rem",
              color: activeTab === "directory" ? "#0A2540" : "#475569",
              bgcolor: activeTab === "directory" ? "#FFFFFF" : "transparent",
              boxShadow: activeTab === "directory" ? "0 4px 12px rgba(10,37,64,0.12), 0 1px 3px rgba(0,0,0,0.08)" : "none",
              borderBottom: activeTab === "directory" ? "3px solid #00D4B2" : "3px solid transparent",
              transition: "all 0.2s ease-in-out",
              "&:hover": activeTab === "directory" ? undefined : { bgcolor: "rgba(255,255,255,0.6)", color: "#0A2540", transform: "translateY(-1px)" },
            }}
          >
            <TableChartOutlinedIcon sx={{ fontSize: 19, color: activeTab === "directory" ? "#00D4B2" : "#64748B" }} />
            Provider Directory &amp; Footprint Analytics
          </ButtonBase>

          <Tooltip title={activeTab === "benchmark" ? "" : "Click to open the multi-carrier comparison matrix workspace"}>
            <ButtonBase
              onClick={(e) => handleTabChange(e, "benchmark")}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.2,
                px: 2.5,
                py: 1.2,
                borderRadius: "8px",
                fontWeight: activeTab === "benchmark" ? 700 : 600,
                fontSize: "0.92rem",
                color: activeTab === "benchmark" ? "#0A2540" : "#475569",
                bgcolor: activeTab === "benchmark" ? "#FFFFFF" : "transparent",
                boxShadow: activeTab === "benchmark" ? "0 4px 12px rgba(10,37,64,0.12), 0 1px 3px rgba(0,0,0,0.08)" : "none",
                borderBottom: activeTab === "benchmark" ? "3px solid #00D4B2" : "3px solid transparent",
                transition: "all 0.2s ease-in-out",
                "&:hover": activeTab === "benchmark" ? undefined : { bgcolor: "rgba(255,255,255,0.6)", color: "#0A2540", transform: "translateY(-1px)" },
              }}
            >
              <CompareArrowsIcon sx={{ fontSize: 20, color: activeTab === "benchmark" ? "#00D4B2" : "#64748B" }} />
              Side-by-Side Carrier Benchmark
              <Chip
                label={uniqueSelected.length >= 2 ? `${uniqueSelected.length} Selected` : "Compare 2–5"}
                size="small"
                sx={{
                  height: 22,
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  bgcolor: uniqueSelected.length >= 2 ? "#00D4B2" : activeTab === "benchmark" ? "#0A2540" : "#E2E8F0",
                  color: uniqueSelected.length >= 2 ? "#0A2540" : activeTab === "benchmark" ? "#00D4B2" : "#64748B",
                }}
              />
            </ButtonBase>
          </Tooltip>
        </Box>

        {activeTab === "directory" ? (
        <>
        {/* Dataset Scope sits above the search bar now, matching MNO
           Search's own Master Scope Bar -> search strip order -- the
           coarsest "which slice of the market" control reads first, above
           the fine-grained free-text field rather than sandwiched beneath
           it. */}
        <Paper variant="outlined" sx={{ mb: 1.5, p: 1.25, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Dataset Scope
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            color="primary"
            value={source}
            onChange={(_, value) => value && pushParams(q, value, service)}
            sx={{ display: "flex", flexWrap: "wrap", gap: 1, ...highContrastPillGroupSx }}
          >
            <ToggleButton value={ProviderStatsSource.IR21}>As per IR.21 Data</ToggleButton>
            <ToggleButton value={ProviderStatsSource.REACH_LIST}>As per Reach List</ToggleButton>
            <ToggleButton value={ProviderStatsSource.BOTH}>Both (Combined)</ToggleButton>
          </ToggleButtonGroup>
        </Paper>

        <Paper sx={{ p: 2, mb: 3 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6}>
              <SuggestionAutocomplete<ProviderSuggestion>
                label={isMobile ? "Provider Name..." : "Provider Name (e.g. Tata Comm, Syniverse, BICS)"}
                value={q}
                onValueChange={setQ}
                fetchSuggestions={fetchSuggestions}
                getOptionLabel={(o) => (o.matchedAlias ? `${o.providerName} (alias: ${o.matchedAlias})` : o.providerName)}
                onEnter={runSearch}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <Button fullWidth variant="contained" startIcon={<SearchIcon />} onClick={runSearch} sx={{ minHeight: 44, bgcolor: "#0A2540", "&:hover": { bgcolor: "#0A2540" } }}>
                Search
              </Button>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<RestartAltIcon />}
                onClick={resetAllFilters}
                disabled={!hasActiveFilters}
                color={hasActiveFilters ? "warning" : "inherit"}
                sx={{ minHeight: 44 }}
              >
                Reset
              </Button>
            </Grid>
          </Grid>
        </Paper>

        {/* Active Filters ribbon -- previously there was no on-page trace
           that a search term or non-default Dataset Scope was narrowing
           everything below (charts, benchmark banner, table) once a user
           had typed a provider name; the only way out was to notice and
           manually clear the search box. Each chip removes just its own
           dimension; "Reset All Filters" clears everything. */}
        {activeFilterDimensions.length > 0 && (
          <Paper
            variant="outlined"
            sx={{
              mb: 1.5,
              p: 1.5,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1.5,
              borderColor: "#BFD4E8",
              bgcolor: "#F4F8FC",
            }}
          >
            <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: "#0A2540" }}>
                Active Filters:
              </Typography>
              {activeFilterDimensions.map((d) => (
                <Chip
                  key={d.key}
                  label={d.label}
                  onDelete={d.onClear}
                  size="small"
                  sx={{ bgcolor: "#0A2540", color: "#fff", fontWeight: 600, "& .MuiChip-deleteIcon": { color: "rgba(255,255,255,0.7)" } }}
                />
              ))}
            </Box>
            <Button
              startIcon={<RestartAltIcon fontSize="small" />}
              variant="outlined"
              size="small"
              onClick={resetAllFilters}
              sx={{ borderColor: "#0A2540", color: "#0A2540" }}
            >
              Reset All Filters
            </Button>
          </Paper>
        )}

        <ProviderCoverageCharts rankedProviders={rankedProviders} source={source} onProviderClick={handleProviderChartClick} />

        {/* Contextual Table Header Banner -- names the table's exact scope
           in plain language (previously just a bare result count) and, once
           a search has narrowed the view down, an explicit way back out to
           the full Dataset Scope baseline rather than only the Reset
           button up in the search bar. Also the scroll-to-results anchor:
           searching (Enter or the Search button) smooth-scrolls here and
           briefly pulses the border so a search's effect is immediately
           visible instead of leaving the user looking at unchanged
           controls above the fold. */}
        <Paper
          ref={resultsRef}
          id="provider-results-anchor"
          variant="outlined"
          sx={{
            mb: 1.5,
            p: 2,
            borderColor: resultsPulse ? "#00A98A" : "#BFD4E8",
            bgcolor: "#F4F8FC",
            transition: "border-color 0.3s ease-out, box-shadow 0.3s ease-out",
            ...(resultsPulse && {
              animation: "pulseHighlight 1.8s ease-out",
              "@keyframes pulseHighlight": {
                "0%": { boxShadow: "0 0 0 0 rgba(0,212,178,0.55)" },
                "60%": { boxShadow: "0 0 0 10px rgba(0,212,178,0)" },
                "100%": { boxShadow: "0 0 0 0 rgba(0,212,178,0)" },
              },
            }),
          }}
        >
          <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 1.5 }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700} sx={{ color: "#0A2540" }}>
                Wholesale Provider Footprint &amp; Reach Benchmark
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {q
                  ? `Showing ${uniqueProviderCount} of ${baselineCount ?? "…"} providers matching "${q}" (${SOURCE_PILL_LABEL[source]})`
                  : `Showing all ${uniqueProviderCount} providers (${SOURCE_PILL_LABEL[source]})`}
                {service && ` — filtered to declared ${service} providers`}
              </Typography>
              {q && (
                <MuiLink
                  component="button"
                  variant="body2"
                  onClick={() => pushParams("", source, service)}
                  sx={{ mt: 0.5, display: "inline-block", fontWeight: 600 }}
                >
                  View All {baselineCount ?? uniqueProviderCount} Providers &rarr;
                </MuiLink>
              )}
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
              {service && (
                <Chip
                  size="small"
                  color="primary"
                  label={`Filtered to ${service} providers`}
                  onDelete={() => pushParams(q, source, null)}
                  deleteIcon={<CloseIcon fontSize="small" />}
                />
              )}
              <Button
                variant="contained"
                size="small"
                disabled={rankedProviders.length === 0 || !!generatingProviderReport}
                startIcon={generatingProviderReport ? <CircularProgress size={16} sx={{ color: "#fff" }} /> : <AssessmentOutlinedIcon />}
                endIcon={!generatingProviderReport && <ArrowDropDownIcon />}
                onClick={(e) => setProviderReportMenuAnchor(e.currentTarget)}
                sx={{
                  minHeight: 40,
                  background: "linear-gradient(135deg, #0A2540 0%, #153D66 100%)",
                  color: "#FFFFFF",
                  fontWeight: 700,
                  border: "1px solid #F59E0B",
                  whiteSpace: "nowrap",
                  "&:hover": { background: "linear-gradient(135deg, #0A2540 0%, #153D66 100%)", boxShadow: 4 },
                }}
              >
                {generatingProviderReport ? PROVIDER_REPORT_GENERATING_LABEL[generatingProviderReport] : "Download Provider Report"}
              </Button>
              <Menu anchorEl={providerReportMenuAnchor} open={!!providerReportMenuAnchor} onClose={() => setProviderReportMenuAnchor(null)}>
                <MenuItem onClick={handleDownloadProviderPdf}>
                  <ListItemText
                    primary="📄 Executive PDF Report (with Charts)"
                    secondary="Branded brief with KPI banner, coverage charts & provider ranking ledger"
                  />
                </MenuItem>
                <MenuItem onClick={handleDownloadProviderExcel}>
                  <ListItemText
                    primary="📊 Detailed MIS Workbook (.xlsx)"
                    secondary="Executive Summary KPIs + full Provider Directory with auto-filter"
                  />
                </MenuItem>
                <MenuItem onClick={handleDownloadProviderCsv}>
                  <ListItemText primary="📑 Raw CSV Export (.csv)" secondary="Plain ranked provider list for pipelines & spreadsheets" />
                </MenuItem>
              </Menu>
            </Box>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Click a provider&apos;s name to open its coverage stats. {SOURCE_HELPER_TEXT[source]} Switch to the{" "}
            <MuiLink component="button" variant="caption" onClick={() => handleTabChange({} as React.SyntheticEvent, "benchmark")} sx={{ fontWeight: 600 }}>
              Side-by-Side Carrier Benchmark
            </MuiLink>{" "}
            tab to select 2–5 providers for comparison.
          </Typography>
        </Paper>
        {/* No rowSelection/checkbox column here -- the directory is a clean
           scannable lookup now; multi-provider selection lives entirely on
           the Benchmark tab below (which shares this same `results` data
           and `columnDefs`, just with selection turned on). */}
        <DataGrid<ProviderSummary> rowData={results} columnDefs={columnDefs} getRowId={(row) => row.id} showTopPagination />
        </>
        ) : (
        <>
        {/* Side-by-Side Carrier Benchmark -- dedicated entirely to
           multi-carrier comparative analytics now, rather than a strip
           squeezed above the general directory table. Selection slots make
           progress toward the 2-5 range visible without scrolling down to
           the floating dock, and the CTA is always present (disabled below
           2) so its exact requirement is never a mystery. */}
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
                Side-by-Side Carrier Benchmark
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                Select between 2 and 5 wholesale providers below to generate side-by-side comparative matrices —
                global footprint, shared MNO accounts, and service dominance, all at once. ({uniqueProviderCount}{" "}
                providers in the current scope, {SOURCE_PILL_LABEL[source]})
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
            <Button
              variant="contained"
              size="small"
              disabled={uniqueSelected.length < 2}
              startIcon={<RocketLaunchIcon fontSize="small" />}
              onClick={() => router.push(`/search/provider/compare?ids=${uniqueSelected.map((p) => p.id).join(",")}`)}
              sx={{
                bgcolor: "#0A2540",
                color: "#fff",
                fontWeight: 700,
                ml: "auto",
                "&.Mui-disabled": { bgcolor: "rgba(10,37,64,0.12)", color: "text.disabled" },
              }}
            >
              {uniqueSelected.length < 2
                ? "Select at least 2 providers to compare"
                : `Launch Comparative Analysis Matrix (${uniqueSelected.length}) →`}
            </Button>
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

        <Paper variant="outlined" sx={{ mb: 1.5, p: 1.5, borderColor: "#BFD4E8", bgcolor: "#F4F8FC" }}>
          <Typography variant="caption" color="text.secondary">
            Click anywhere on a row (or its checkbox) to select — up to 5 at once. Selected rows highlight below.
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
        />
        </>
        )}
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
