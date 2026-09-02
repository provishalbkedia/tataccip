"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { ICellRendererParams } from "ag-grid-community";
import {
  Autocomplete,
  Badge,
  Box,
  Button,
  Chip,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
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
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import ClearIcon from "@mui/icons-material/Clear";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import DataGrid from "@/components/DataGrid";
import SuggestionAutocomplete from "@/components/SuggestionAutocomplete";
import ColumnHeaderWithSubtotal from "@/components/ColumnHeaderWithSubtotal";
import { api } from "@/lib/api";
import { openMnoPdf } from "@/lib/openPdf";
import { COUNTRY_OPTIONS, getCountryName, resolveCountryCode, type CountryOption } from "@/lib/countries";
import { MnoSuggestion, MnoSummary, Region } from "@ccip/shared-types";

const REGION_OPTIONS: Region[] = [Region.AMERICAS, Region.MEA, Region.EUROPE, Region.APAC, Region.NON_TERRESTRIAL];

// Derived entirely client-side from data the API already returns —
// sccpProviders/dsxProviders/ipxProviders are already resolved to
// canonical ProviderMaster names, deduplicated per service (see
// MnoService.resolvedProvidersByMno). Service-wise exclusivity is just
// "exactly 1 unique provider in that service's own array" — independent
// per service, so an MNO can be IPX-exclusive while dual-homed on SCCP.
// "Fully exclusive" (the original, coarser definition) is the union
// across all 3 services collapsing to exactly one member.
type MnoSummaryWithExclusivity = MnoSummary & {
  isExclusiveSccp: boolean;
  soleSccpProvider: string | null;
  isExclusiveDsx: boolean;
  soleDsxProvider: string | null;
  isExclusiveIpx: boolean;
  soleIpxProvider: string | null;
  isAnyServiceExclusive: boolean;
  isFullyExclusive: boolean;
  soleMasterProvider: string | null;
};

// Defensive: a blank/whitespace-only entry (""/" "/null/undefined) sitting
// alongside a real provider name would otherwise count as a second
// "provider" below -- inflating .length and the union Set's size enough to
// flip a genuinely exclusive MNO to "shared". The ingestion pipeline
// already filters junk/blank provider tokens before they reach
// ProviderMaster (see isJunkProviderName in provider-normalize.ts), so
// this shouldn't fire in practice -- kept here anyway since exclusivity
// correctness shouldn't depend on that upstream guarantee holding forever,
// and it's the single chokepoint every service's array passes through.
const sanitizeProviders = (providers: (string | null | undefined)[]): string[] =>
  Array.from(new Set(providers.map((p) => p?.trim()).filter((p): p is string => !!p)));

const soleOf = (providers: string[]) => (providers.length === 1 ? providers[0] : null);

function withExclusivity(r: MnoSummary): MnoSummaryWithExclusivity {
  const sccpProviders = sanitizeProviders(r.sccpProviders);
  const dsxProviders = sanitizeProviders(r.dsxProviders);
  const ipxProviders = sanitizeProviders(r.ipxProviders);

  const isExclusiveSccp = sccpProviders.length === 1;
  const isExclusiveDsx = dsxProviders.length === 1;
  const isExclusiveIpx = ipxProviders.length === 1;
  const unionUnique = new Set([...sccpProviders, ...dsxProviders, ...ipxProviders]);
  const isFullyExclusive = unionUnique.size === 1;
  return {
    ...r,
    // Sanitized versions replace the raw arrays so the grid's own
    // sccpProviders/dsxProviders/ipxProviders display columns (bound by
    // field name) never render a stray blank entry either -- one cleaned
    // array feeds both the badges and the plain-text columns.
    sccpProviders,
    dsxProviders,
    ipxProviders,
    isExclusiveSccp,
    soleSccpProvider: soleOf(sccpProviders),
    isExclusiveDsx,
    soleDsxProvider: soleOf(dsxProviders),
    isExclusiveIpx,
    soleIpxProvider: soleOf(ipxProviders),
    isAnyServiceExclusive: isExclusiveSccp || isExclusiveDsx || isExclusiveIpx,
    isFullyExclusive,
    soleMasterProvider: isFullyExclusive ? Array.from(unionUnique)[0] : null,
  };
}

type ExclusiveMode = "all" | "full" | "sccp" | "dsx" | "ipx" | "any";
const EXCLUSIVE_MODES: ExclusiveMode[] = ["all", "full", "sccp", "dsx", "ipx", "any"];
const EXCLUSIVE_MODE_LABELS: Record<ExclusiveMode, string> = {
  all: "All MNOs (Default)",
  full: "Fully Exclusive",
  sccp: "SCCP Exclusive",
  dsx: "DSX Exclusive",
  ipx: "IPX Exclusive",
  any: "Any Service Exclusive",
};
const EXCLUSIVE_MODE_PREDICATE: Record<ExclusiveMode, (r: MnoSummaryWithExclusivity) => boolean> = {
  all: () => true,
  full: (r) => r.isFullyExclusive,
  sccp: (r) => r.isExclusiveSccp,
  dsx: (r) => r.isExclusiveDsx,
  ipx: (r) => r.isExclusiveIpx,
  any: (r) => r.isAnyServiceExclusive,
};

// Drill-in from the Dashboard's SCCP/DSX/IPX Relationships cards
// (?service=SCCP|DSX|IPX) -- narrows to MNOs that declare at least one
// provider for that specific service, independent of (and combinable
// with) the exclusivity mode filter above.
type ServiceFilter = "SCCP" | "DSX" | "IPX";
const SERVICE_FILTERS: ServiceFilter[] = ["SCCP", "DSX", "IPX"];
const SERVICE_FILTER_LABEL: Record<ServiceFilter, string> = {
  SCCP: "Declared SCCP Only",
  DSX: "Declared DSX Only",
  IPX: "Declared IPX Only",
};
const SERVICE_FILTER_PREDICATE: Record<ServiceFilter, (r: MnoSummaryWithExclusivity) => boolean> = {
  SCCP: (r) => r.sccpProviders.length > 0,
  DSX: (r) => r.dsxProviders.length > 0,
  IPX: (r) => r.ipxProviders.length > 0,
};

type DatasetScope = "ir21" | "reachlist" | "all";
const DATASET_SCOPES: DatasetScope[] = ["ir21", "reachlist", "all"];
const DATASET_SCOPE_LABELS: Record<DatasetScope, string> = {
  ir21: "IR.21 Verified",
  reachlist: "Reach List Only",
  all: "All MNOs",
};

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
  return (
    <Chip
      label={region}
      size="small"
      sx={{
        bgcolor: palette.bgcolor,
        color: palette.color,
        fontWeight: 600,
        maxWidth: "100%",
        "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" },
      }}
    />
  );
}

/** Distinguishes a row with a real IR.21 declaration from a legacy row
 * known only via a Reach List upload (see hasIr21Declaration), plus — merged
 * in from the old standalone "IR.21 PDF" column — a compact PDF-open icon
 * right next to it when one is available, so viewing the source document no
 * longer needs a separate, far-right column and the horizontal scroll to
 * reach it. maxWidth "100%" plus the label's own ellipsis lets the chip
 * itself shrink and truncate along with the column instead of overflowing
 * the cell when a user drags the column narrower than "Reach List Only"
 * needs. stopPropagation on the icon keeps the PDF click from also
 * triggering the row's own checkbox-selection toggle. */
function SourceCell(params: ICellRendererParams<MnoSummary>) {
  const hasIr21 = params.value as boolean;
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, maxWidth: "100%" }}>
      {hasIr21 ? (
        <Chip label="IR.21" size="small" color="primary" variant="outlined" sx={{ maxWidth: "100%" }} />
      ) : (
        <Chip
          label="Reach List Only"
          size="small"
          color="warning"
          variant="outlined"
          sx={{ maxWidth: "100%", "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" } }}
        />
      )}
      {params.data?.hasPdfDocument && (
        <Tooltip title="View official GSMA IR.21 PDF" arrow>
          <IconButton
            size="small"
            color="error"
            sx={{ p: 0.25, "&:hover": { transform: "scale(1.1)" } }}
            // onClickCapture, not onClick -- AG Grid's row-selection listener
            // is attached natively (not through React) directly on the row
            // element, which sits between this button and React's own
            // delegated root listener. A bubble-phase stopPropagation() runs
            // too late to stop it (AG Grid's listener already fired while
            // the event was bubbling past the row, before React's synthetic
            // dispatch even begins), so it has to be stopped in the capture
            // phase instead, before the event ever reaches the row.
            onClickCapture={(e) => {
              e.stopPropagation();
              if (params.data) openMnoPdf(params.data.id);
            }}
          >
            <PictureAsPdfIcon fontSize="small" sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}

/** Clickable operator name -- the row itself now toggles checkbox selection
 * on click (see the DataGrid invocation below), so navigation to the
 * detail page moves here instead of a whole-row onRowClicked, the same
 * "name is the link, the rest of the row selects" pattern used on
 * Provider Search. stopPropagation keeps this from also toggling the
 * row's checkbox. */
function OperatorNameCell(params: ICellRendererParams<MnoSummary>) {
  const router = useRouter();
  if (!params.data) return <>{params.value}</>;
  const id = params.data.id;
  const go = () => router.push(`/search/mno/${id}`);
  return (
    <span
      role="link"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        go();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.stopPropagation();
        go();
      }}
      style={{ color: "#0B6FBF", fontWeight: 600, cursor: "pointer" }}
      onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
      onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
    >
      {params.value}
    </span>
  );
}

/** Shows the "Yes"/"No" full-portfolio-exclusivity valueGetter as a green
 * "Single Provider" pill (with a tooltip naming the sole provider) when
 * exclusive, or plain "No" otherwise. */
function ExclusivityCell(params: ICellRendererParams<MnoSummaryWithExclusivity>) {
  if (params.value !== "Yes" || !params.data?.soleMasterProvider) {
    return <span style={{ color: "rgba(0,0,0,0.4)" }}>No</span>;
  }
  return (
    <Tooltip title={`Sole provider declared for this MNO: ${params.data.soleMasterProvider}`}>
      <Chip label="Single Provider" size="small" color="success" sx={{ fontWeight: 600 }} />
    </Tooltip>
  );
}

const EXCLUSIVE_TEXT_COLOR = "#2E7D32";
const SHARED_TEXT_COLOR = "#0A2540";

/** Per-service provider column cell. The carrier name is always the full,
 * legible text (CSS-ellipsized only if the column is genuinely too narrow,
 * never squeezed out by a badge sitting inside the same cell — a standalone
 * "Exclusive" chip in these narrow columns used to do exactly that,
 * collapsing "Orange" down to "O.."). Exclusive (single-provider) cells
 * get forest-green text plus a small dot instead, which costs a few px
 * rather than a whole chip's worth of width. */
function serviceProviderCellRenderer(serviceLabel: string, isExclusiveField: keyof MnoSummaryWithExclusivity) {
  return function Cell(params: ICellRendererParams<MnoSummaryWithExclusivity>) {
    const providers = (params.value as string[] | undefined) ?? [];
    if (providers.length === 0) return <span style={{ color: "rgba(0,0,0,0.4)" }}>-</span>;

    const isExclusive = !!params.data?.[isExclusiveField];
    const text = providers.join(", ");
    const tooltip = isExclusive
      ? `Exclusive ${serviceLabel} Provider: ${providers[0]} (Single carrier declared in IR.21)`
      : `${serviceLabel} Providers: ${text}`;

    return (
      <Tooltip title={tooltip}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0, width: "100%" }}>
          {isExclusive && (
            <Box component="span" sx={{ color: EXCLUSIVE_TEXT_COLOR, fontSize: 10, flexShrink: 0, lineHeight: 1 }}>
              ●
            </Box>
          )}
          <Box
            component="span"
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
              color: isExclusive ? EXCLUSIVE_TEXT_COLOR : SHARED_TEXT_COLOR,
              fontWeight: isExclusive ? 600 : 400,
            }}
          >
            {text}
          </Box>
        </Box>
      </Tooltip>
    );
  };
}

/** Shared end-adornment for a plain controlled TextField (TADIG/MCC/MNC) --
 * only rendered once there's something to clear. */
function clearAdornment(value: string, onClear: () => void) {
  if (!value) return undefined;
  return (
    <InputAdornment position="end">
      <IconButton size="small" onClick={onClear} title="Clear" edge="end">
        <ClearIcon fontSize="small" />
      </IconButton>
    </InputAdornment>
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
  const [onlyWithProviders, setOnlyWithProviders] = React.useState(false);
  const [exclusiveMode, setExclusiveMode] = React.useState<ExclusiveMode>("all");
  const [serviceFilter, setServiceFilter] = React.useState<ServiceFilter | "">("");
  const [datasetScope, setDatasetScope] = React.useState<DatasetScope>("ir21");
  const [results, setResults] = React.useState<MnoSummary[]>([]);
  const [selected, setSelected] = React.useState<MnoSummary[]>([]);
  const [clearSignal, setClearSignal] = React.useState(0);
  const [warmingUp, setWarmingUp] = React.useState(false);

  // Live "search-as-you-type" for the 4 free-text fields (q/tadig/mcc/mnc):
  // filtered entirely client-side against whatever's already loaded in
  // `results` (country/region/onlyWithProviders/datasetScope stay real
  // server round trips, triggered instantly by their own dropdown handlers
  // below -- see pushParams). q/tadig/mcc/mnc themselves also still reach
  // the server via the Search button / Enter (pushParams keeps writing
  // them to the URL, so a search stays bookmarkable/shareable), but that's
  // no longer what makes the table respond -- this debounced client-side
  // pass is. A single shared 250ms timer covers all 4 fields together
  // (typing in any of them restarts the same countdown), flushable on
  // demand (the Search button, Enter, an autocomplete pick, or clearing a
  // field to "" all need the table to catch up immediately rather than
  // wait out the debounce).
  const [debouncedFreeText, setDebouncedFreeText] = React.useState({ q: "", tadig: "", mcc: "", mnc: "" });
  const freeTextDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (freeTextDebounceRef.current) clearTimeout(freeTextDebounceRef.current);
    freeTextDebounceRef.current = setTimeout(() => {
      setDebouncedFreeText({ q, tadig, mcc, mnc });
    }, 250);
    return () => {
      if (freeTextDebounceRef.current) clearTimeout(freeTextDebounceRef.current);
    };
  }, [q, tadig, mcc, mnc]);

  // Cancels any pending debounce and applies the current (or explicitly
  // overridden) free-text values immediately -- overrides win over the
  // closure's own q/tadig/mcc/mnc so a same-tick "clear to empty" isn't
  // clobbered by stale state that hasn't re-rendered yet.
  const flushFreeTextFilter = React.useCallback(
    (overrides?: Partial<typeof debouncedFreeText>) => {
      if (freeTextDebounceRef.current) clearTimeout(freeTextDebounceRef.current);
      setDebouncedFreeText({ q, tadig, mcc, mnc, ...overrides });
    },
    [q, tadig, mcc, mnc],
  );

  const rowsWithExclusivity = React.useMemo(() => results.map(withExclusivity), [results]);
  const exclusivityCounts = React.useMemo(
    () => ({
      sccp: rowsWithExclusivity.filter((r) => r.isExclusiveSccp).length,
      dsx: rowsWithExclusivity.filter((r) => r.isExclusiveDsx).length,
      ipx: rowsWithExclusivity.filter((r) => r.isExclusiveIpx).length,
      full: rowsWithExclusivity.filter((r) => r.isFullyExclusive).length,
    }),
    [rowsWithExclusivity],
  );
  const visibleRows = React.useMemo(() => {
    const qNorm = debouncedFreeText.q.trim().toLowerCase();
    const tadigNorm = debouncedFreeText.tadig.trim().toLowerCase();
    const mccNorm = debouncedFreeText.mcc.trim().toLowerCase();
    const mncNorm = debouncedFreeText.mnc.trim().toLowerCase();

    return rowsWithExclusivity
      .filter(EXCLUSIVE_MODE_PREDICATE[exclusiveMode])
      .filter((r) => !serviceFilter || SERVICE_FILTER_PREDICATE[serviceFilter](r))
      .filter((r) => !tadigNorm || r.tadigCode.toLowerCase().includes(tadigNorm))
      .filter((r) => !mccNorm || r.mcc.toLowerCase().includes(mccNorm))
      .filter((r) => !mncNorm || r.mnc.toLowerCase().includes(mncNorm))
      .filter((r) => {
        if (!qNorm) return true;
        const haystack = [
          r.operatorName,
          r.tadigCode,
          r.country,
          r.mcc,
          r.mnc,
          r.networkType ?? "",
          ...r.sccpProviders,
          ...r.dsxProviders,
          ...r.ipxProviders,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(qNorm);
      });
  }, [rowsWithExclusivity, exclusiveMode, serviceFilter, debouncedFreeText]);

  // Distinct-entity subtotals for the column-header chips -- derived
  // entirely client-side from visibleRows (the exact rows the grid is
  // currently showing), so every filter/exclusivity-mode change recomputes
  // these instantly with no extra API round trip. sccp/dsx/ipxProviders are
  // already sanitized (see sanitizeProviders above), so no extra
  // .filter(Boolean) is needed on the flatMap.
  const columnSubtotals = React.useMemo(
    () => ({
      mnos: new Set(visibleRows.map((r) => r.id)).size,
      countries: new Set(visibleRows.map((r) => r.country).filter(Boolean)).size,
      sccp: new Set(visibleRows.flatMap((r) => r.sccpProviders)).size,
      dsx: new Set(visibleRows.flatMap((r) => r.dsxProviders)).size,
      ipx: new Set(visibleRows.flatMap((r) => r.ipxProviders)).size,
    }),
    [visibleRows],
  );

  // The URL query string is the single source of truth for "what did we
  // last search for" — this fires on initial load, on an explicit Search
  // (via the router.push below), and when the browser Back/Forward button
  // restores a prior query, syncing the input fields and refetching in all
  // three cases without needing separate logic for each.
  React.useEffect(() => {
    const urlQ = searchParams.get("q") ?? "";
    const urlTadig = searchParams.get("tadig") ?? "";
    const urlMcc = searchParams.get("mcc") ?? "";
    const urlMnc = searchParams.get("mnc") ?? "";
    setQ(urlQ);
    setTadig(urlTadig);
    // resolveCountryCode tolerates a URL carrying a full name instead of the
    // ISO-3 code (a hand-edited or older shared link) -- the backend only
    // ever matches on the code.
    setCountry(resolveCountryCode(searchParams.get("country")));
    setMcc(urlMcc);
    setMnc(urlMnc);
    // Bypasses the debounce -- a fresh page load or Back/Forward navigation
    // should show the URL's own search terms applied immediately, not 250ms
    // later.
    if (freeTextDebounceRef.current) clearTimeout(freeTextDebounceRef.current);
    setDebouncedFreeText({ q: urlQ, tadig: urlTadig, mcc: urlMcc, mnc: urlMnc });
    const urlRegion = searchParams.get("region");
    setRegion(urlRegion && (REGION_OPTIONS as string[]).includes(urlRegion) ? (urlRegion as Region) : "");
    setOnlyWithProviders(searchParams.get("onlyWithProviders") === "true");
    const urlService = searchParams.get("service");
    setServiceFilter(urlService && SERVICE_FILTERS.includes(urlService as ServiceFilter) ? (urlService as ServiceFilter) : "");
    const urlExclusiveMode = searchParams.get("exclusiveMode");
    setExclusiveMode(urlExclusiveMode && EXCLUSIVE_MODES.includes(urlExclusiveMode as ExclusiveMode) ? (urlExclusiveMode as ExclusiveMode) : "all");
    const urlDatasetScope = searchParams.get("datasetScope");
    setDatasetScope(urlDatasetScope && DATASET_SCOPES.includes(urlDatasetScope as DatasetScope) ? (urlDatasetScope as DatasetScope) : "ir21");
    api.get<MnoSummary[]>(`/mno/search?${searchParams.toString()}`).then(setResults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const pushParams = React.useCallback(
    (overrides?: {
      country?: string;
      region?: Region | "";
      onlyWithProviders?: boolean;
      exclusiveMode?: ExclusiveMode;
      datasetScope?: DatasetScope;
      service?: ServiceFilter | "";
    }) => {
      const nextCountry = overrides?.country ?? country;
      const nextRegion = overrides?.region ?? region;
      const nextOnlyWithProviders = overrides?.onlyWithProviders ?? onlyWithProviders;
      const nextExclusiveMode = overrides?.exclusiveMode ?? exclusiveMode;
      const nextDatasetScope = overrides?.datasetScope ?? datasetScope;
      const nextService = overrides?.service ?? serviceFilter;
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (tadig) params.set("tadig", tadig);
      if (nextCountry) params.set("country", nextCountry);
      if (mcc) params.set("mcc", mcc);
      if (mnc) params.set("mnc", mnc);
      if (nextRegion) params.set("region", nextRegion);
      // Only written to the URL when on, off its (false) default, so an
      // ordinary search URL stays clean.
      if (nextOnlyWithProviders) params.set("onlyWithProviders", "true");
      if (nextExclusiveMode !== "all") params.set("exclusiveMode", nextExclusiveMode);
      if (nextDatasetScope !== "ir21") params.set("datasetScope", nextDatasetScope);
      if (nextService) params.set("service", nextService);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [q, tadig, country, mcc, mnc, region, onlyWithProviders, exclusiveMode, datasetScope, serviceFilter, pathname, router],
  );

  // Also flushes any pending free-text debounce -- Search/Enter should make
  // the visible table catch up to whatever's currently typed immediately,
  // not up to 250ms later, even though pushParams's own server round trip
  // already uses the latest raw q/tadig/mcc/mnc regardless of debounce
  // timing.
  const runSearch = React.useCallback(() => {
    flushFreeTextFilter();
    pushParams();
  }, [flushFreeTextFilter, pushParams]);

  // Baseline defaults every field/toggle above is initialized to -- used
  // both to detect whether anything is currently non-default (for the
  // Reset button's active-state indicator) and, on reset, to restore.
  const hasActiveFilters =
    !!q ||
    !!tadig ||
    !!country ||
    !!mcc ||
    !!mnc ||
    !!region ||
    onlyWithProviders ||
    exclusiveMode !== "all" ||
    datasetScope !== "ir21" ||
    !!serviceFilter;

  const resetAllFilters = React.useCallback(() => {
    setQ("");
    setTadig("");
    setCountry("");
    setMcc("");
    setMnc("");
    setRegion("");
    setOnlyWithProviders(false);
    setExclusiveMode("all");
    setDatasetScope("ir21");
    setServiceFilter("");
    // Bypasses the debounce -- Reset must restore the full baseline
    // instantly, not up to 250ms later.
    if (freeTextDebounceRef.current) clearTimeout(freeTextDebounceRef.current);
    setDebouncedFreeText({ q: "", tadig: "", mcc: "", mnc: "" });
    router.push(pathname, { scroll: false });
  }, [pathname, router]);

  const clearServiceFilter = React.useCallback(() => {
    setServiceFilter("");
    pushParams({ service: "" });
  }, [pushParams]);

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
            MNO / Cust Search
          </Typography>
          <Chip size="small" color="primary" label="GSMA IR.21 Declared" />
        </Box>
        <Paper sx={{ p: 2, mb: 2 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={3}>
              <SuggestionAutocomplete<MnoSuggestion>
                label={isMobile ? "Search MNO / Cust, TADIG, Country..." : "Search by MNO / Cust, TADIG, Country, MCC/MNC, or Carrier..."}
                value={q}
                onValueChange={(v) => {
                  setQ(v);
                  // Clearing to "" (the built-in X button, or backspacing to
                  // empty) restores the full list instantly rather than
                  // waiting out the debounce.
                  if (!v) flushFreeTextFilter({ q: "" });
                }}
                fetchSuggestions={fetchSuggestions}
                getOptionLabel={(o) => o.operatorName}
                onEnter={runSearch}
                // A real suggestion pick (not a keystroke) applies
                // immediately -- no debounce delay for an explicit
                // selection. Takes the resolved value directly rather than
                // reading back `q` from this closure, which (thanks to
                // React's batching) wouldn't yet reflect the setQ() call
                // onValueChange just made above.
                onSelect={(v) => flushFreeTextFilter({ q: v })}
              />
            </Grid>
            <Grid item xs={6} sm={1.5}>
              <TextField
                fullWidth
                label="TADIG"
                value={tadig}
                onChange={(e) => {
                  const v = e.target.value;
                  setTadig(v);
                  if (!v) flushFreeTextFilter({ tadig: "" });
                }}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                InputProps={{
                  endAdornment: clearAdornment(tadig, () => {
                    setTadig("");
                    flushFreeTextFilter({ tadig: "" });
                  }),
                }}
              />
            </Grid>
            <Grid item xs={6} sm={1.5}>
              <Autocomplete<CountryOption>
                fullWidth
                disableClearable={false}
                options={COUNTRY_OPTIONS}
                value={COUNTRY_OPTIONS.find((c) => c.code === country) ?? null}
                onChange={(_, v) => {
                  const next = v ? v.code : "";
                  setCountry(next);
                  // A structural (server-scoped) filter -- selecting or
                  // clearing applies instantly rather than waiting for
                  // Enter/Search.
                  pushParams({ country: next });
                }}
                getOptionLabel={(o) => o.name}
                isOptionEqualToValue={(o, v) => o.code === v.code}
                // Matches on the full name OR the ISO-3 code as the user
                // types -- "United Kingdom" and "GBR" both surface the same
                // option, since source data (and everyone's muscle memory
                // for it) is the 3-letter code even though the dropdown
                // itself shows names.
                filterOptions={(options, state) => {
                  const q = state.inputValue.trim().toLowerCase();
                  if (!q) return options;
                  return options.filter((o) => o.name.toLowerCase().includes(q) || o.code.toLowerCase().includes(q));
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Country" onKeyDown={(e) => e.key === "Enter" && runSearch()} />
                )}
              />
            </Grid>
            <Grid item xs={6} sm={2}>
              <Box sx={{ position: "relative" }}>
                <TextField
                  select
                  fullWidth
                  label="Region"
                  value={region}
                  onChange={(e) => {
                    const next = e.target.value as Region | "";
                    setRegion(next);
                    // A structural (server-scoped) filter -- applies
                    // instantly on selection, matching the Region pill row
                    // below (both control the same `region` state).
                    pushParams({ region: next });
                  }}
                  sx={region ? { "& .MuiSelect-select": { pr: "56px !important" } } : undefined}
                >
                  <MenuItem value="">All Regions</MenuItem>
                  {REGION_OPTIONS.map((r) => (
                    <MenuItem key={r} value={r}>
                      {r}
                    </MenuItem>
                  ))}
                </TextField>
                {region && (
                  <IconButton
                    size="small"
                    title="Clear"
                    onClick={() => {
                      setRegion("");
                      pushParams({ region: "" });
                    }}
                    sx={{ position: "absolute", right: 32, top: "50%", transform: "translateY(-50%)" }}
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
            </Grid>
            <Grid item xs={6} sm={1}>
              <TextField
                fullWidth
                label="MCC"
                value={mcc}
                onChange={(e) => {
                  const v = e.target.value;
                  setMcc(v);
                  if (!v) flushFreeTextFilter({ mcc: "" });
                }}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                InputProps={{
                  endAdornment: clearAdornment(mcc, () => {
                    setMcc("");
                    flushFreeTextFilter({ mcc: "" });
                  }),
                }}
              />
            </Grid>
            <Grid item xs={6} sm={1}>
              <TextField
                fullWidth
                label="MNC"
                value={mnc}
                onChange={(e) => {
                  const v = e.target.value;
                  setMnc(v);
                  if (!v) flushFreeTextFilter({ mnc: "" });
                }}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                InputProps={{
                  endAdornment: clearAdornment(mnc, () => {
                    setMnc("");
                    flushFreeTextFilter({ mnc: "" });
                  }),
                }}
              />
            </Grid>
            <Grid item xs={6} sm={1}>
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
            <Grid item xs={3} sm={0.5}>
              <Tooltip title={hasActiveFilters ? "Reset all active filters" : "No active filters to reset"}>
                <span>
                  <Badge color="warning" variant="dot" invisible={!hasActiveFilters}>
                    <IconButton
                      onClick={resetAllFilters}
                      disabled={!hasActiveFilters}
                      color={hasActiveFilters ? "warning" : "default"}
                      sx={{
                        minWidth: 44,
                        minHeight: 44,
                        border: "1px solid",
                        borderColor: hasActiveFilters ? "warning.main" : "divider",
                      }}
                    >
                      <RestartAltIcon fontSize="small" />
                    </IconButton>
                  </Badge>
                </span>
              </Tooltip>
            </Grid>
          </Grid>
        </Paper>

        <Box sx={{ mb: 2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
            Dataset scope:
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            color="primary"
            value={datasetScope}
            onChange={(_, value: DatasetScope | null) => {
              if (!value) return;
              setDatasetScope(value);
              pushParams({ datasetScope: value });
            }}
            sx={{
              "& .MuiToggleButton-root": {
                borderRadius: "999px !important",
                textTransform: "none",
                px: 2,
                border: "1px solid",
                borderColor: "divider",
                minHeight: 40,
              },
            }}
          >
            {DATASET_SCOPES.map((s) => (
              <ToggleButton key={s} value={s}>
                {DATASET_SCOPE_LABELS[s]}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Tooltip title="Toggle between GSMA IR.21 authenticated ground-truth MNOs / Customers, unmapped commercial reach list claims, or the unified database.">
            <InfoOutlinedIcon fontSize="small" sx={{ color: "text.disabled" }} />
          </Tooltip>
        </Box>

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

          <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.5 }}>
            <Tooltip title={onlyWithProviders ? "Showing only MNOs / Customers with at least one listed provider — toggle to see the full IR.21 baseline" : "Showing every MNO / Customer, including those with no listed provider"}>
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
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Box sx={{ position: "relative" }}>
                <TextField
                  select
                  size="small"
                  label="Exclusivity"
                  value={exclusiveMode}
                  onChange={(e) => {
                    const next = e.target.value as ExclusiveMode;
                    setExclusiveMode(next);
                    pushParams({ exclusiveMode: next });
                  }}
                  sx={{ minWidth: 200, ...(exclusiveMode !== "all" && { "& .MuiSelect-select": { pr: "56px !important" } }) }}
                >
                  {EXCLUSIVE_MODES.map((m) => (
                    <MenuItem key={m} value={m}>
                      {EXCLUSIVE_MODE_LABELS[m]}
                    </MenuItem>
                  ))}
                </TextField>
                {exclusiveMode !== "all" && (
                  <IconButton
                    size="small"
                    title="Clear"
                    onClick={() => {
                      setExclusiveMode("all");
                      pushParams({ exclusiveMode: "all" });
                    }}
                    sx={{ position: "absolute", right: 32, top: "50%", transform: "translateY(-50%)" }}
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
              <Tooltip title="Filters the table by wholesale-provider exclusivity — either per service (SCCP/DSX/IPX independently) or across the MNO's full declared portfolio.">
                <InfoOutlinedIcon fontSize="small" sx={{ color: "text.disabled" }} />
              </Tooltip>
            </Box>
          </Box>
        </Box>

        <Box sx={{ mb: 1, display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {visibleRows.length} result(s) — {exclusivityCounts.sccp} SCCP exclusive, {exclusivityCounts.dsx} DSX
            exclusive, {exclusivityCounts.ipx} IPX exclusive, {exclusivityCounts.full} fully exclusive. Showing MNO /
            Customer connectivity footprint strictly as declared in official GSMA IR.21 documents. Click anywhere on
            a row (or its checkbox) to select 2–5 for side-by-side comparison, or click an MNO / Customer&apos;s name
            to open its connectivity details.
          </Typography>
          <Tooltip title="Select 2 to 5 MNOs / Customers to launch the side-by-side Interconnect Parity Comparison Drawer.">
            <InfoOutlinedIcon fontSize="small" sx={{ color: "text.disabled", flexShrink: 0 }} />
          </Tooltip>
        </Box>

        {serviceFilter && (
          <Box sx={{ mb: 1.5 }}>
            <Chip
              label={`Filter: ${SERVICE_FILTER_LABEL[serviceFilter]} (${visibleRows.length})`}
              color="primary"
              onDelete={clearServiceFilter}
              sx={{ fontWeight: 600 }}
            />
          </Box>
        )}

        <Box
          sx={{
            mb: 1.5,
            p: 1,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 2,
            bgcolor: "action.hover",
            borderRadius: 1,
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Legend
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Box component="span" sx={{ color: EXCLUSIVE_TEXT_COLOR, fontSize: 10, lineHeight: 1 }}>
              ●
            </Box>
            <Typography variant="caption" sx={{ color: EXCLUSIVE_TEXT_COLOR, fontWeight: 600 }}>
              Green provider name
            </Typography>
            <Typography variant="caption" color="text.secondary">
              — exclusive / single provider for that service
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Typography variant="caption" sx={{ color: SHARED_TEXT_COLOR, fontWeight: 400 }}>
              Dark provider name
            </Typography>
            <Typography variant="caption" color="text.secondary">
              — multi-provider / shared service
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Chip label="Single Provider" size="small" color="success" sx={{ height: 20, fontSize: 11, fontWeight: 600 }} />
            <Typography variant="caption" color="text.secondary">
              — fully exclusive across all declared services (SCCP + DSX + IPX)
            </Typography>
          </Box>
        </Box>

        <DataGrid<MnoSummaryWithExclusivity>
          rowData={visibleRows}
          columnDefs={[
            {
              field: "operatorName",
              headerName: "MNO / Cust Name",
              flex: 1.5,
              cellRenderer: OperatorNameCell,
              headerComponent: ColumnHeaderWithSubtotal,
              headerComponentParams: { subtotal: columnSubtotals.mnos, entityLabel: "MNO / Cust" },
            },
            { field: "hasIr21Declaration", headerName: "Source", cellRenderer: SourceCell, minWidth: 115, sortable: false, filter: false },
            { field: "region", headerName: "Region", cellRenderer: RegionCell, minWidth: 90 },
            {
              field: "country",
              headerName: "Country",
              maxWidth: 160,
              valueFormatter: (p) => getCountryName(p.value),
              tooltipValueGetter: (p) => getCountryName(p.value),
              headerComponent: ColumnHeaderWithSubtotal,
              headerComponentParams: { subtotal: columnSubtotals.countries, entityLabel: "Country" },
            },
            {
              field: "sccpProviders",
              headerName: "SCCP Provider (IR.21)",
              flex: 1.4,
              valueFormatter: joinOrDash,
              cellRenderer: serviceProviderCellRenderer("SCCP", "isExclusiveSccp"),
              headerComponent: ColumnHeaderWithSubtotal,
              headerComponentParams: { subtotal: columnSubtotals.sccp, entityLabel: "SCCP Provider" },
            },
            {
              field: "dsxProviders",
              headerName: "DSX / LTE Provider (IR.21)",
              flex: 1.4,
              valueFormatter: joinOrDash,
              cellRenderer: serviceProviderCellRenderer("DSX", "isExclusiveDsx"),
              headerComponent: ColumnHeaderWithSubtotal,
              headerComponentParams: { subtotal: columnSubtotals.dsx, entityLabel: "DSX Provider" },
            },
            {
              field: "ipxProviders",
              headerName: "IPX Provider (IR.21)",
              flex: 1.4,
              valueFormatter: joinOrDash,
              cellRenderer: serviceProviderCellRenderer("IPX", "isExclusiveIpx"),
              headerComponent: ColumnHeaderWithSubtotal,
              headerComponentParams: { subtotal: columnSubtotals.ipx, entityLabel: "IPX Provider" },
            },
            {
              colId: "isFullyExclusive",
              headerName: "Fully Exclusive All Services (Yes/No)",
              minWidth: 160,
              flex: 1,
              valueGetter: (p) => (p.data?.isFullyExclusive ? "Yes" : "No"),
              cellRenderer: ExclusivityCell,
            },
            {
              colId: "soleMasterProvider",
              headerName: "Sole Master Provider",
              minWidth: 100,
              flex: 1,
              valueGetter: (p) => p.data?.soleMasterProvider ?? "-",
            },
            {
              colId: "isExclusiveSccp",
              headerName: "SCCP Exclusive (Yes/No)",
              minWidth: 130,
              flex: 0.9,
              valueGetter: (p) => (p.data?.isExclusiveSccp ? "Yes" : "No"),
            },
            {
              colId: "soleSccpProvider",
              headerName: "SCCP Sole Provider",
              minWidth: 100,
              flex: 0.9,
              valueGetter: (p) => p.data?.soleSccpProvider ?? "-",
            },
            {
              colId: "isExclusiveDsx",
              headerName: "DSX Exclusive (Yes/No)",
              minWidth: 130,
              flex: 0.9,
              valueGetter: (p) => (p.data?.isExclusiveDsx ? "Yes" : "No"),
            },
            {
              colId: "soleDsxProvider",
              headerName: "DSX Sole Provider",
              minWidth: 100,
              flex: 0.9,
              valueGetter: (p) => p.data?.soleDsxProvider ?? "-",
            },
            {
              colId: "isExclusiveIpx",
              headerName: "IPX Exclusive (Yes/No)",
              minWidth: 130,
              flex: 0.9,
              valueGetter: (p) => (p.data?.isExclusiveIpx ? "Yes" : "No"),
            },
            {
              colId: "soleIpxProvider",
              headerName: "IPX Sole Provider",
              minWidth: 100,
              flex: 0.9,
              valueGetter: (p) => p.data?.soleIpxProvider ?? "-",
            },
            {
              // Merged into the "Source" column's cell renderer above (the
              // PDF icon now sits next to the source chip) so this no longer
              // renders as its own grid column -- kept hidden purely so
              // "Export CSV" (which reads allColumns, see DataGrid.tsx)
              // still carries a "Has IR.21 PDF" value for offline reporting.
              field: "hasPdfDocument",
              headerName: "Has IR.21 PDF",
              hide: true,
              valueFormatter: (p) => (p.value ? "Yes" : "No"),
              sortable: false,
              filter: false,
            },
            { field: "tadigCode", headerName: "TADIG" },
            { field: "mnoAsNumbers", headerName: "MNO's ASNs (GRX/IPX)", valueFormatter: joinOrDash },
            { field: "providerAsNumbers", headerName: "Provider ASNs", valueFormatter: joinOrDash },
            {
              field: "lastEffectiveDate",
              headerName: "Last Effective Date",
              valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleDateString() : ""),
            },
          ]}
          rowSelection="multiRow"
          onSelectionChanged={setSelected}
          clearSelectionSignal={clearSignal}
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
              {selected.length} MNO/Cust(s) Selected: {selected.map((m) => m.operatorName).join(", ")}
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
                Compare Selected MNOs / Customers (Matrix)
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
