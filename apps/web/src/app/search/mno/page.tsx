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
  CircularProgress,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  ListItemText,
  Menu,
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
import LockIcon from "@mui/icons-material/Lock";
import WorkspacePremiumIcon from "@mui/icons-material/WorkspacePremium";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import DataGrid from "@/components/DataGrid";
import SuggestionAutocomplete from "@/components/SuggestionAutocomplete";
import ColumnHeaderWithSubtotal from "@/components/ColumnHeaderWithSubtotal";
import ExclusivityCharts from "./ExclusivityCharts";
import { api } from "@/lib/api";
import { openMnoPdf } from "@/lib/openPdf";
import { COUNTRY_OPTIONS, getCountryName, resolveCountryCode, type CountryOption } from "@/lib/countries";
import { MnoSuggestion, MnoSummary, ProviderSuggestion, Region } from "@ccip/shared-types";

const REGION_OPTIONS: Region[] = [Region.AMERICAS, Region.MEA, Region.EUROPE, Region.APAC, Region.NON_TERRESTRIAL];

// Derived entirely client-side from data the API already returns —
// sccpProviders/dsxProviders/ipxProviders are already resolved to
// canonical ProviderMaster names, deduplicated per service (see
// MnoService.resolvedProvidersByMno). Service-wise exclusivity is just
// "exactly 1 unique provider in that service's own array" — independent
// per service, so an MNO can be IPX-exclusive while dual-homed on SCCP.
// "Fully exclusive" (the original, coarser definition) is the union
// across all 3 services collapsing to exactly one member.
export type MnoSummaryWithExclusivity = MnoSummary & {
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

// "shared" is deliberately excluded from EXCLUSIVE_MODES (the pill bar's
// own 6 buttons) -- it's reachable only via the Exclusivity Vulnerability
// Bar chart's "Multi-Provider" segment, not a top-level filter scope the
// spec's pill bar itself lists.
type ExclusiveMode = "all" | "full" | "sccp" | "dsx" | "ipx" | "any" | "shared";
const EXCLUSIVE_MODES: ExclusiveMode[] = ["all", "full", "sccp", "dsx", "ipx", "any"];
// EXCLUSIVE_MODES drives the pill bar's own 6 buttons; this also accepts
// "shared" (reachable only via the Vulnerability chart's "Multi-Provider"
// bar) so a URL/state restore doesn't silently drop that mode back to
// "all" just because it isn't one of the pill bar's own options.
const ALL_EXCLUSIVE_MODE_VALUES: ExclusiveMode[] = [...EXCLUSIVE_MODES, "shared"];
const EXCLUSIVE_MODE_LABELS: Record<ExclusiveMode, string> = {
  all: "All MNOs (Default)",
  full: "Fully Exclusive",
  sccp: "SCCP Exclusive",
  dsx: "DSX Exclusive",
  ipx: "IPX Exclusive",
  any: "Any Service Exclusive",
  shared: "Multi-Provider (Shared)",
};
// Matches the EXCLUSIVITY SCOPE pill bar's own button text exactly (e.g.
// "SCCP Solo", not EXCLUSIVE_MODE_LABELS' "SCCP Exclusive") so the Active
// Output Scope Banner names the filter the same way the control the user
// clicked does.
const EXCLUSIVITY_PILL_LABEL: Record<ExclusiveMode, string> = {
  all: "All MNOs",
  full: "Fully Exclusive",
  sccp: "SCCP Solo",
  dsx: "DSX Solo",
  ipx: "IPX Solo",
  any: "Any Service Exclusive",
  shared: "Multi-Provider (Shared)",
};
const EXCLUSIVE_MODE_PREDICATE: Record<ExclusiveMode, (r: MnoSummaryWithExclusivity) => boolean> = {
  all: () => true,
  full: (r) => r.isFullyExclusive,
  sccp: (r) => r.isExclusiveSccp,
  dsx: (r) => r.isExclusiveDsx,
  ipx: (r) => r.isExclusiveIpx,
  any: (r) => r.isAnyServiceExclusive,
  shared: (r) => !r.isFullyExclusive,
};

// Whether `provider` qualifies a row under the given exclusivity mode --
// scoped to the SAME service dimension the mode itself measures, not a
// flat "does this name appear anywhere on the row" check. Without this, a
// row where Tata Comm serves only DSX/IPX (with e.g. Orange holding SCCP)
// would still pass an "SCCP Solo" + "Tata Comm" filter, since Tata Comm
// technically appears somewhere on the row -- correct for a general
// carrier search, but wrong once a single-service exclusivity pill is
// active: every visible row should then have `provider` as *that
// service's* sole/exclusive provider, matching what the donut itself
// counted for that slice.
function providerMatchesRow(r: MnoSummaryWithExclusivity, mode: ExclusiveMode, provider: string): boolean {
  switch (mode) {
    case "full":
      return r.isFullyExclusive && r.soleMasterProvider === provider;
    case "sccp":
      return r.isExclusiveSccp && r.soleSccpProvider === provider;
    case "dsx":
      return r.isExclusiveDsx && r.soleDsxProvider === provider;
    case "ipx":
      return r.isExclusiveIpx && r.soleIpxProvider === provider;
    case "any":
      // Mirrors aggregateCarrierExclusivity's own "any" mode: a row
      // qualifies if `provider` is the sole/exclusive provider for at
      // least one of its services (which service can differ per row).
      return (
        (r.isExclusiveSccp && r.soleSccpProvider === provider) ||
        (r.isExclusiveDsx && r.soleDsxProvider === provider) ||
        (r.isExclusiveIpx && r.soleIpxProvider === provider)
      );
    default:
      // "all" (no exclusivity pill active) and "shared" aren't tied to a
      // single service dimension, so keep the broad "carrier touches this
      // row somewhere, exclusive or not" reading -- the general-purpose
      // Wholesale Provider search.
      return [...r.sccpProviders, ...r.dsxProviders, ...r.ipxProviders].includes(provider);
  }
}

// "full"/"sccp"/"dsx"/"ipx" map 1:1 onto aggregateCarrierExclusivity's own
// dimensions; "all" (no exclusivity pill selected) and "shared" don't
// correspond to a single dimension, so both fall back to "any" -- the
// broad cross-service view, matching what the Exclusivity & Market Share
// chart strip already showed before per-mode scoping existed.
function toAggregationMode(mode: ExclusiveMode): "full" | "sccp" | "dsx" | "ipx" | "any" {
  if (mode === "full" || mode === "sccp" || mode === "dsx" || mode === "ipx") return mode;
  return "any";
}

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

// Each scope combines "which MNOs are included" with "which source's
// provider data is shown for them" (see apps/api's mno.service.ts search()
// for the exact rule per scope):
// - "ir21": has a parsed IR.21 XML on file; providers shown are IR.21-
//   sourced only.
// - "reachlist_claimed" ("As per Reach List"): has at least one Reach List
//   claim, REGARDLESS of whether it also has an IR.21 declaration; providers
//   shown are Reach-List-sourced only. An MNO can be IR.21-verified AND
//   separately claimed by a reach list -- this mode specifically answers
//   "what do the reach lists say", not "which MNOs did IR.21 never see".
// - "reachlist_only" ("Only in Reach List"): a legacy row known only via a
//   Reach List upload, no IR.21 XML ever ingested for it at all; providers
//   shown are Reach-List-sourced only (same source rule as
//   "reachlist_claimed" -- these two scopes differ in which MNOs are
//   included, not in which source is shown for them).
// - "all": every MNO, providers merged from both sources.
type DatasetScope = "ir21" | "reachlist_claimed" | "reachlist_only" | "all";
const DATASET_SCOPES: DatasetScope[] = ["ir21", "reachlist_claimed", "reachlist_only", "all"];
const DATASET_SCOPE_LABELS: Record<DatasetScope, string> = {
  ir21: "IR.21 Verified",
  reachlist_claimed: "As per Reach List",
  reachlist_only: "Reach List Exclusive only",
  all: "All MNOs (IR.21 + Reach List)",
};

// Drives the header badge beside the page title (previously a hardcoded
// "GSMA IR.21 Declared" that stayed put no matter which Dataset Scope pill
// was active, silently mislabeling the data source once someone switched
// to e.g. "As per Reach List"). Each scope gets its own wording AND its own
// accent color so the badge doubles as a quick visual cue for which source
// is driving the page, not just a static logo-like label.
const DATASET_SCOPE_BADGE: Record<DatasetScope, { label: string; bgcolor: string; color: string }> = {
  ir21: { label: "GSMA IR.21 Declared", bgcolor: "#0A2540", color: "#FFFFFF" },
  reachlist_claimed: { label: "As per Reach List", bgcolor: "#00A98A", color: "#FFFFFF" },
  reachlist_only: { label: "Reach List Exclusive Only", bgcolor: "#F59E0B", color: "#4A2E00" },
  all: { label: "Combined (IR.21 + Reach List)", bgcolor: "#455A64", color: "#FFFFFF" },
};

// Shared active/inactive pill styling for the master filter row
// (Dataset scope, Region) -- same high-contrast solid-navy-fill/white-text
// treatment the Market Intelligence page's masterPillGroupSx uses, so the
// two pages' primary filter controls read consistently instead of this
// page's plain border-only pills blending into the background.
const masterPillGroupSx = {
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

  // Wholesale Provider filter -- narrows to MNOs where this carrier appears
  // in ANY of sccpProviders/dsxProviders/ipxProviders, entirely client-side
  // like exclusiveMode/serviceFilter (results is already the full fetched
  // set). Stored as a plain canonical name (matching how sccp/dsx/ipx
  // provider arrays are already returned by the API), not an id, so it
  // round-trips through the URL without a second lookup call.
  const [providerFilter, setProviderFilter] = React.useState<string>("");
  const [providerFilterInput, setProviderFilterInput] = React.useState("");
  const [providerFilterOptions, setProviderFilterOptions] = React.useState<ProviderSuggestion[]>([]);
  React.useEffect(() => {
    if (!providerFilterInput.trim()) {
      setProviderFilterOptions([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .get<ProviderSuggestion[]>(`/provider/suggestions?q=${encodeURIComponent(providerFilterInput)}`)
        .then(setProviderFilterOptions)
        .catch(() => setProviderFilterOptions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [providerFilterInput]);

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
  // Region/Country/Dataset-scope (already applied server-side, baked into
  // `results`) plus Service and free-text search are legitimate "which
  // slice of the market am I analyzing" scoping -- everything downstream,
  // including the Exclusivity & Market Share chart strip, should respect
  // them. Deliberately excludes BOTH exclusiveMode (see baseFilteredRows
  // below) AND providerFilter: unlike a scope narrowing, providerFilter is
  // a "spotlight one carrier" lens, and computing carrier *market share*
  // from a row-set already pre-filtered down to "MNOs that happen to
  // involve carrier X somewhere" produces a statistically misleading
  // percentage for every OTHER carrier shown alongside it -- e.g. filtering
  // to Tata Comm and then asking "what's Orange's share" from that same
  // Tata-Comm-biased subset answers a different, much narrower question
  // than "what's Orange's real share of this market", and multiple
  // unrelated carriers can end up looking like they're in a coincidental
  // tie purely because they all happen to co-occur with the filtered
  // carrier on the same handful of rows. scopedRows is the shared base for
  // both the table's own filtering (baseFilteredRows, which legitimately
  // narrows by providerFilter too) and the chart's (chartRows, which
  // doesn't) so the two only diverge on that one dimension.
  const scopedRows = React.useMemo(() => {
    const qNorm = debouncedFreeText.q.trim().toLowerCase();
    const tadigNorm = debouncedFreeText.tadig.trim().toLowerCase();
    const mccNorm = debouncedFreeText.mcc.trim().toLowerCase();
    const mncNorm = debouncedFreeText.mnc.trim().toLowerCase();

    return rowsWithExclusivity
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
  }, [rowsWithExclusivity, serviceFilter, debouncedFreeText]);

  // Every filter except exclusiveMode's own EXCLUSIVE_MODE_PREDICATE --
  // feeds visibleRows (below) and providerScopedRows (the Vulnerability
  // chart). Includes providerFilter, unlike scopedRows/chartRows -- the
  // table SHOULD narrow to just that carrier's own rows once one is
  // selected. The provider match is scoped to exclusiveMode's own service
  // dimension via providerMatchesRow (see its own comment) -- e.g. under
  // "SCCP Solo", a row only passes if the filtered carrier is specifically
  // that row's SCCP-exclusive provider, not merely present on its DSX/IPX
  // columns.
  const baseFilteredRows = React.useMemo(
    () => scopedRows.filter((r) => !providerFilter || providerMatchesRow(r, exclusiveMode, providerFilter)),
    [scopedRows, providerFilter, exclusiveMode],
  );

  // Feeds the Exclusivity & Market Share chart strip specifically -- see
  // scopedRows' own comment for why this must NOT also filter by
  // providerFilter. The selected carrier is still highlighted (active
  // stroke on its own slice, via activeProviderFilter) without reshaping
  // the comparison universe every other slice is measured against.
  const chartRows = scopedRows;

  const visibleRows = React.useMemo(
    () => baseFilteredRows.filter(EXCLUSIVE_MODE_PREDICATE[exclusiveMode]),
    [baseFilteredRows, exclusiveMode],
  );

  // Feeds the "N result(s) -- X SCCP exclusive..." summary line directly
  // above the table. Deliberately derived from visibleRows (every active
  // filter applied), not the unfiltered rowsWithExclusivity -- otherwise
  // these per-service counts stay pinned to the whole dataset's totals no
  // matter which Exclusivity Scope pill, Dataset Scope, or Wholesale
  // Provider is selected, which reads as "26 fully exclusive" underneath a
  // table that's visibly showing only 6 rows.
  const exclusivityCounts = React.useMemo(
    () => ({
      sccp: visibleRows.filter((r) => r.isExclusiveSccp).length,
      dsx: visibleRows.filter((r) => r.isExclusiveDsx).length,
      ipx: visibleRows.filter((r) => r.isExclusiveIpx).length,
      full: visibleRows.filter((r) => r.isFullyExclusive).length,
    }),
    [visibleRows],
  );

  // Live count per exclusivity pill/badge -- each pill's count is computed
  // independently straight from scopedRows (NOT from baseFilteredRows,
  // which is pinned to the currently active mode's own provider-matching
  // dimension) so every pill shows what picking *it* would produce, all
  // simultaneously, the same "counts race ahead of the single active
  // selection" pattern the Market Intelligence page's Change filter pills
  // use. Each count applies providerFilter scoped to THAT pill's own mode
  // via providerMatchesRow, e.g. the "DSX Solo" count with a Tata Comm
  // filter active reflects Tata Comm's DSX-exclusive accounts regardless
  // of which pill is currently selected.
  const exclusivityModeCounts: Record<ExclusiveMode, number> = React.useMemo(() => {
    const countFor = (mode: ExclusiveMode) =>
      scopedRows.filter((r) => EXCLUSIVE_MODE_PREDICATE[mode](r) && (!providerFilter || providerMatchesRow(r, mode, providerFilter))).length;
    return {
      all: countFor("all"),
      full: countFor("full"),
      sccp: countFor("sccp"),
      dsx: countFor("dsx"),
      ipx: countFor("ipx"),
      any: countFor("any"),
      shared: countFor("shared"),
    };
  }, [scopedRows, providerFilter]);

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
    setExclusiveMode(urlExclusiveMode && ALL_EXCLUSIVE_MODE_VALUES.includes(urlExclusiveMode as ExclusiveMode) ? (urlExclusiveMode as ExclusiveMode) : "all");
    const urlDatasetScope = searchParams.get("datasetScope");
    setDatasetScope(urlDatasetScope && DATASET_SCOPES.includes(urlDatasetScope as DatasetScope) ? (urlDatasetScope as DatasetScope) : "ir21");
    const urlProvider = searchParams.get("provider") ?? "";
    setProviderFilter(urlProvider);
    setProviderFilterInput(urlProvider);
    api.get<MnoSummary[]>(`/mno/search?${searchParams.toString()}`).then(setResults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const pushParams = React.useCallback(
    (overrides?: {
      q?: string;
      country?: string;
      region?: Region | "";
      onlyWithProviders?: boolean;
      exclusiveMode?: ExclusiveMode;
      datasetScope?: DatasetScope;
      service?: ServiceFilter | "";
      provider?: string;
    }) => {
      // A same-tick caller that just called setQ(...) right before this
      // (e.g. a chart drill-down click) would otherwise have this read the
      // *stale* `q` from this closure -- React doesn't re-run pushParams's
      // own memo mid-tick just because setQ was called a moment earlier in
      // the same handler. Without the override, the URL silently omits the
      // new search term, and the searchParams-sync effect above then wipes
      // the in-memory `q` back to "" once the router.push navigation lands
      // a moment later, undoing the drill-down.
      const nextQ = overrides?.q ?? q;
      const nextCountry = overrides?.country ?? country;
      const nextRegion = overrides?.region ?? region;
      const nextOnlyWithProviders = overrides?.onlyWithProviders ?? onlyWithProviders;
      const nextExclusiveMode = overrides?.exclusiveMode ?? exclusiveMode;
      const nextDatasetScope = overrides?.datasetScope ?? datasetScope;
      const nextService = overrides?.service ?? serviceFilter;
      const nextProvider = overrides?.provider ?? providerFilter;
      const params = new URLSearchParams();
      if (nextQ) params.set("q", nextQ);
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
      if (nextProvider) params.set("provider", nextProvider);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [q, tadig, country, mcc, mnc, region, onlyWithProviders, exclusiveMode, datasetScope, serviceFilter, providerFilter, pathname, router],
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
    !!serviceFilter ||
    !!providerFilter;

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
    setProviderFilter("");
    setProviderFilterInput("");
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

  const clearProviderFilter = React.useCallback(() => {
    setProviderFilter("");
    setProviderFilterInput("");
    pushParams({ provider: "" });
  }, [pushParams]);

  const clearDatasetScope = React.useCallback(() => {
    setDatasetScope("ir21");
    pushParams({ datasetScope: "ir21" });
  }, [pushParams]);

  const clearExclusiveMode = React.useCallback(() => {
    setExclusiveMode("all");
    pushParams({ exclusiveMode: "all" });
  }, [pushParams]);

  const clearRegion = React.useCallback(() => {
    setRegion("");
    pushParams({ region: "" });
  }, [pushParams]);

  const clearCountry = React.useCallback(() => {
    setCountry("");
    pushParams({ country: "" });
  }, [pushParams]);

  const clearSearchText = React.useCallback(() => {
    setQ("");
    flushFreeTextFilter({ q: "" });
    pushParams({ q: "" });
  }, [flushFreeTextFilter, pushParams]);

  // Drives the Active Output Scope Banner directly above the table -- one
  // entry per narrowing dimension currently applied to `visibleRows`, each
  // carrying its own dismiss handler. Without this, a user combining e.g.
  // Dataset Scope + Exclusivity Scope + Wholesale Provider only ever saw a
  // single isolated "Wholesale Provider" chip once they scrolled past the
  // pill bars themselves, with no on-table-context explanation for why the
  // other two constraints were also narrowing what they were looking at.
  // Deliberately covers only the dimensions named in the banner spec
  // (Scope, Exclusivity, Declared-service, Provider, Region, Country,
  // Search) -- TADIG/MCC/MNC stay out since they're free-text fields
  // already visible in their own inputs just above, not a hidden
  // constraint someone could lose track of after scrolling.
  const activeOutputDimensions = React.useMemo(
    () =>
      [
        datasetScope !== "ir21" && {
          key: "datasetScope",
          sentence: DATASET_SCOPE_LABELS[datasetScope],
          chip: `Scope: ${DATASET_SCOPE_LABELS[datasetScope]}`,
          onClear: clearDatasetScope,
        },
        exclusiveMode !== "all" && {
          key: "exclusiveMode",
          sentence: EXCLUSIVITY_PILL_LABEL[exclusiveMode],
          chip: `Exclusivity: ${EXCLUSIVITY_PILL_LABEL[exclusiveMode]}`,
          onClear: clearExclusiveMode,
        },
        !!serviceFilter && {
          key: "serviceFilter",
          sentence: SERVICE_FILTER_LABEL[serviceFilter],
          chip: SERVICE_FILTER_LABEL[serviceFilter],
          onClear: clearServiceFilter,
        },
        !!providerFilter && {
          key: "providerFilter",
          sentence: `Wholesale Provider: ${providerFilter}`,
          chip: `Provider: ${providerFilter}`,
          onClear: clearProviderFilter,
        },
        !!region && {
          key: "region",
          sentence: `Region: ${region}`,
          chip: `Region: ${region}`,
          onClear: clearRegion,
        },
        !!country && {
          key: "country",
          sentence: `Country: ${country}`,
          chip: `Country: ${country}`,
          onClear: clearCountry,
        },
        !!q && {
          key: "q",
          sentence: `Search: "${q}"`,
          chip: `Search: "${q}"`,
          onClear: clearSearchText,
        },
      ].filter((d): d is { key: string; sentence: string; chip: string; onClear: () => void } => !!d),
    [
      datasetScope,
      exclusiveMode,
      serviceFilter,
      providerFilter,
      region,
      country,
      q,
      clearDatasetScope,
      clearExclusiveMode,
      clearServiceFilter,
      clearProviderFilter,
      clearRegion,
      clearCountry,
      clearSearchText,
    ],
  );

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

  // ---- Exclusivity MIS report downloads ----
  // exclusivityPdfReport/exclusivityExcelReport (and jspdf/jspdf-autotable/
  // exceljs, which they wrap) are dynamically imported only once a user
  // actually picks a format, same "don't pay for a report nobody may ever
  // generate" reasoning as the Market Intelligence page's own MIS report.
  const [exclusivityReportMenuAnchor, setExclusivityReportMenuAnchor] = React.useState<HTMLElement | null>(null);
  const [generatingExclusivityReport, setGeneratingExclusivityReport] = React.useState<"pdf" | "excel" | null>(null);
  const EXCLUSIVITY_REPORT_GENERATING_LABEL: Record<"pdf" | "excel", string> = {
    pdf: "Generating Brief…",
    excel: "Generating Workbook…",
  };
  const buildExclusivityReportInput = () => ({
    generatedAt: new Date(),
    scope: {
      datasetScope: DATASET_SCOPE_LABELS[datasetScope],
      region: region || "All",
      exclusivityMode: EXCLUSIVE_MODE_LABELS[exclusiveMode],
      serviceFilter: serviceFilter ? SERVICE_FILTER_LABEL[serviceFilter] : "All",
      provider: providerFilter || null,
      search: q || null,
    },
    aggregationMode: toAggregationMode(exclusiveMode),
    rows: visibleRows,
  });
  const handleDownloadExclusivityPdf = async () => {
    setExclusivityReportMenuAnchor(null);
    setGeneratingExclusivityReport("pdf");
    try {
      const { generateExclusivityPdfReport } = await import("@/lib/reports/exclusivityPdfReport");
      await generateExclusivityPdfReport(buildExclusivityReportInput());
    } finally {
      setGeneratingExclusivityReport(null);
    }
  };
  const handleDownloadExclusivityExcel = async () => {
    setExclusivityReportMenuAnchor(null);
    setGeneratingExclusivityReport("excel");
    try {
      const { generateExclusivityExcelReport } = await import("@/lib/reports/exclusivityExcelReport");
      await generateExclusivityExcelReport(buildExclusivityReportInput());
    } finally {
      setGeneratingExclusivityReport(null);
    }
  };

  return (
    <RequireAuth>
      <AppShell>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", mb: 3 }}>
          <Typography variant="h5" fontWeight={700}>
            MNO / Cust Search
          </Typography>
          <Chip
            size="small"
            label={DATASET_SCOPE_BADGE[datasetScope].label}
            sx={{
              bgcolor: DATASET_SCOPE_BADGE[datasetScope].bgcolor,
              color: DATASET_SCOPE_BADGE[datasetScope].color,
              fontWeight: 700,
            }}
          />
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
            <Grid item xs={12} sm={2}>
              <Autocomplete<ProviderSuggestion>
                fullWidth
                options={providerFilterOptions}
                value={providerFilterOptions.find((o) => o.providerName === providerFilter) ?? (providerFilter ? { id: -1, providerName: providerFilter, matchedAlias: null } : null)}
                inputValue={providerFilterInput}
                onInputChange={(_, v) => setProviderFilterInput(v)}
                onChange={(_, v) => {
                  const next = v?.providerName ?? "";
                  setProviderFilter(next);
                  // A structural (client-side) filter, same as Region --
                  // applies instantly on selection rather than waiting for
                  // Search/Enter.
                  pushParams({ provider: next });
                }}
                getOptionLabel={(o) => o.providerName}
                isOptionEqualToValue={(o, v) => o.providerName === v.providerName}
                renderInput={(params) => <TextField {...params} label="Wholesale Provider" placeholder="e.g. Tata Comm" />}
              />
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
            sx={masterPillGroupSx}
          >
            {DATASET_SCOPES.map((s) => (
              <ToggleButton key={s} value={s}>
                {DATASET_SCOPE_LABELS[s]}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Tooltip title="IR.21 Verified: has a parsed IR.21 XML on file, showing only IR.21-declared providers. As per Reach List: has at least one Reach List claim (whether or not it's also IR.21-verified), showing only Reach-List-claimed providers. Reach List Exclusive only: MNO / Customer connectivity claimed solely via wholesale Reach Lists without an official GSMA IR.21 declaration. All MNOs: everything, providers merged from both sources.">
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
            sx={{ display: "flex", flexWrap: "wrap", gap: 1, ...masterPillGroupSx }}
          >
            <ToggleButton value="ALL">All</ToggleButton>
            {REGION_OPTIONS.map((r) => (
              <ToggleButton key={r} value={r}>
                {r}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

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
        </Box>

        {/* Exclusivity Scope -- the platform's most critical competitive
           intelligence dimension (single-provider lock-in vs multi-provider
           vulnerability), promoted to its own high-contrast pill bar rather
           than the small low-visibility <Select> it used to be. Amber/gold
           accent (rather than the Market Intelligence page's teal) gives
           this "lock-in" domain its own distinct visual identity. */}
        <Paper variant="outlined" sx={{ mb: 2, p: 1.5, borderColor: "#F0C674", bgcolor: "#FFFBF2" }}>
          <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, mb: 1 }}>
            <LockIcon fontSize="small" sx={{ color: "#B45309" }} />
            <Typography variant="body2" fontWeight={700} sx={{ color: "#7C4A03", letterSpacing: 0.3 }}>
              EXCLUSIVITY SCOPE
            </Typography>
            <Tooltip title="Filters the table by wholesale-provider exclusivity -- either per service (SCCP/DSX/IPX independently) or across the MNO's full declared portfolio. Identifying single-provider lock-in vs multi-provider vulnerability is this page's core competitive-intelligence purpose.">
              <InfoOutlinedIcon fontSize="small" sx={{ color: "text.disabled" }} />
            </Tooltip>
          </Box>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={exclusiveMode}
            onChange={(_, value: ExclusiveMode | null) => {
              if (!value) return;
              setExclusiveMode(value);
              pushParams({ exclusiveMode: value });
            }}
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 1,
              "& .MuiToggleButton-root": {
                borderRadius: "999px !important",
                textTransform: "none",
                px: 1.75,
                minHeight: 40,
                border: "1px solid",
                borderColor: "#E8D4A8",
                bgcolor: "#FFFFFF",
                color: "#0A2540",
                fontWeight: 500,
                transition: "box-shadow 0.15s, background-color 0.15s",
                "&:hover": { bgcolor: "#FFF3DC" },
                "&.Mui-selected, &.Mui-selected:hover": {
                  bgcolor: "#0A2540",
                  color: "#FFFFFF",
                  fontWeight: 700,
                  borderColor: "#F59E0B",
                  boxShadow: "0 2px 4px rgba(180,83,9,0.25)",
                },
              },
            }}
          >
            <ToggleButton value="all">All MNOs ({exclusivityModeCounts.all})</ToggleButton>
            <ToggleButton value="full">★ Fully Exclusive ({exclusivityModeCounts.full})</ToggleButton>
            <ToggleButton value="sccp">SCCP Solo ({exclusivityModeCounts.sccp})</ToggleButton>
            <ToggleButton value="dsx">DSX Solo ({exclusivityModeCounts.dsx})</ToggleButton>
            <ToggleButton value="ipx">IPX Solo ({exclusivityModeCounts.ipx})</ToggleButton>
            <ToggleButton value="any">Any Service Exclusive ({exclusivityModeCounts.any})</ToggleButton>
          </ToggleButtonGroup>
        </Paper>

        <ExclusivityCharts
          rows={chartRows}
          providerScopedRows={baseFilteredRows}
          aggregationMode={toAggregationMode(exclusiveMode)}
          activeProviderFilter={providerFilter}
          onProviderClick={(providerName) => {
            // Deliberately leaves exclusiveMode untouched -- the donut now
            // scopes itself to whichever Exclusivity Scope pill is already
            // active (see aggregationMode above), so clicking a slice while
            // e.g. "Fully Exclusive" is selected should narrow to that
            // carrier *within* that same scope, not silently jump back to
            // the broad "Any Service Exclusive" view.
            //
            // Routed through the dedicated providerFilter (exact match
            // against the sccp/dsx/ipx provider arrays), not the free-text
            // `q` search -- a chart-driven drill-down is a precise "this
            // exact carrier" selection, not a loose substring search, and
            // using providerFilter also gives it the same active-filter
            // chip/reset affordances the manual Wholesale Provider
            // dropdown already has.
            setProviderFilter(providerName);
            setProviderFilterInput(providerName);
            pushParams({ provider: providerName });
          }}
          onResetProviderFilter={clearProviderFilter}
          onVulnerabilityClick={(mode) => {
            setExclusiveMode(mode);
            pushParams({ exclusiveMode: mode });
          }}
        />

        {/* Results Summary -- previously a single plain grey sentence that
           blended into the page and buried the actual numbers inside a
           paragraph of instructional text. Now a bordered stat strip: the
           result count reads at a glance, the SCCP/DSX/IPX/Full breakdown
           are individually-colored chips instead of prose, and the
           "how to use this table" instructions are demoted to a caption
           underneath rather than competing with the numbers for attention. */}
        <Paper variant="outlined" sx={{ mb: 1.5, p: 1.5, borderColor: "#BFD4E8", bgcolor: "#F4F8FC" }}>
          <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1.5 }}>
            <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5 }}>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
                <Typography variant="h5" sx={{ fontWeight: 800, color: "#0A2540", lineHeight: 1 }}>
                  {visibleRows.length}
                </Typography>
                <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 600 }}>
                  result{visibleRows.length === 1 ? "" : "s"}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                <Chip size="small" label={`${exclusivityCounts.sccp} SCCP exclusive`} sx={{ bgcolor: "#E7F0FA", color: "#0A2540", fontWeight: 700 }} />
                <Chip size="small" label={`${exclusivityCounts.dsx} DSX exclusive`} sx={{ bgcolor: "#E7F0FA", color: "#0A2540", fontWeight: 700 }} />
                <Chip size="small" label={`${exclusivityCounts.ipx} IPX exclusive`} sx={{ bgcolor: "#E7F0FA", color: "#0A2540", fontWeight: 700 }} />
                <Chip size="small" label={`★ ${exclusivityCounts.full} fully exclusive`} sx={{ bgcolor: "#FFF3DC", color: "#7C4A03", fontWeight: 700 }} />
              </Box>
            </Box>

            <Box sx={{ flexShrink: 0 }}>
              <Button
                variant="contained"
                size="small"
                disabled={visibleRows.length === 0 || !!generatingExclusivityReport}
                startIcon={
                  generatingExclusivityReport ? <CircularProgress size={16} sx={{ color: "#fff" }} /> : <WorkspacePremiumIcon />
                }
                endIcon={!generatingExclusivityReport && <ArrowDropDownIcon />}
                onClick={(e) => setExclusivityReportMenuAnchor(e.currentTarget)}
                sx={{
                  minHeight: 40,
                  background: "linear-gradient(135deg, #0A2540 0%, #153D66 100%)",
                  color: "#FFFFFF",
                  fontWeight: 700,
                  border: "1px solid #F59E0B",
                  "&:hover": { background: "linear-gradient(135deg, #0A2540 0%, #153D66 100%)", boxShadow: 4 },
                }}
              >
                {generatingExclusivityReport ? EXCLUSIVITY_REPORT_GENERATING_LABEL[generatingExclusivityReport] : "Download Exclusivity MIS Report"}
              </Button>
              <Menu
                anchorEl={exclusivityReportMenuAnchor}
                open={!!exclusivityReportMenuAnchor}
                onClose={() => setExclusivityReportMenuAnchor(null)}
              >
                <MenuItem onClick={handleDownloadExclusivityPdf}>
                  <ListItemText primary="📄 Executive PDF Report" secondary="Branded brief with exclusivity charts, carrier footprint matrix & MNO inventory" />
                </MenuItem>
                <MenuItem onClick={handleDownloadExclusivityExcel}>
                  <ListItemText primary="📊 Exclusivity Workbook (.xlsx)" secondary="Market share KPIs + full MNO roster with frozen headers & auto-filter" />
                </MenuItem>
              </Menu>
            </Box>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Showing MNO / Customer connectivity footprint strictly as declared in official GSMA IR.21 documents. Click
              anywhere on a row (or its checkbox) to select 2–5 for side-by-side comparison, or click an MNO /
              Customer&apos;s name to open its connectivity details.
            </Typography>
            <Tooltip title="Select 2 to 5 MNOs / Customers to launch the side-by-side Interconnect Parity Comparison Drawer.">
              <InfoOutlinedIcon fontSize="small" sx={{ color: "text.disabled", flexShrink: 0 }} />
            </Tooltip>
          </Box>
        </Paper>

        {activeOutputDimensions.length > 0 && (
          <Box
            sx={{
              mb: 1.5,
              p: 1.5,
              borderRadius: 1,
              border: "1px solid",
              borderColor: "divider",
              bgcolor: "background.paper",
            }}
          >
            <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 1.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Showing {visibleRows.length} MNO{visibleRows.length === 1 ? "" : "s"} matching:{" "}
                <Box component="span" sx={{ fontWeight: 400, color: "text.secondary" }}>
                  {activeOutputDimensions.map((d) => d.sentence).join(" · ")}
                </Box>
              </Typography>
              <Button
                size="small"
                startIcon={<RestartAltIcon fontSize="small" />}
                onClick={resetAllFilters}
                sx={{ color: "#0A2540", flexShrink: 0 }}
              >
                Clear All Filters ({activeOutputDimensions.length} Active)
              </Button>
            </Box>
            <Box sx={{ mt: 1, display: "flex", flexWrap: "wrap", gap: 1 }}>
              {activeOutputDimensions.map((d) => (
                <Chip
                  key={d.key}
                  label={d.chip}
                  onDelete={d.onClear}
                  size="small"
                  sx={{ fontWeight: 600, bgcolor: "#0A2540", color: "#fff", "& .MuiChip-deleteIcon": { color: "rgba(255,255,255,0.7)" } }}
                />
              ))}
            </Box>
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
