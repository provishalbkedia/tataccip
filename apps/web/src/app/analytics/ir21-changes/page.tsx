"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ICellRendererParams } from "ag-grid-community";
import {
  Autocomplete,
  Badge,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  Grid,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Popover,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
} from "@mui/material";
import type { Theme } from "@mui/material/styles";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import FilterAltOffIcon from "@mui/icons-material/FilterAltOff";
import RuleIcon from "@mui/icons-material/Rule";
import TuneIcon from "@mui/icons-material/Tune";
import CloseIcon from "@mui/icons-material/Close";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import DateRangeIcon from "@mui/icons-material/DateRange";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import DataGrid from "@/components/DataGrid";
import ColumnHeaderWithSubtotal from "@/components/ColumnHeaderWithSubtotal";
import InfoTooltip from "@/components/InfoTooltip";
import MarketCapturePivot from "./MarketCapturePivot";
import MarketDynamicsCharts from "./MarketDynamicsCharts";
import { api } from "@/lib/api";
import { openMnoPdf } from "@/lib/openPdf";
import { getCountryName } from "@/lib/countries";
import type { MisReportInput } from "@/lib/reports/misReportData";
import {
  CARRIER_CHURN_TYPES,
  DIAMETER_SS7_CHANGE_TYPES,
  DIAMETER_SS7_FILTER_VALUE,
  Ir21RoutingChangeRow,
  Ir21RoutingChangeSummary,
  ProviderSuggestion,
  Region,
  RoutingChangeType,
  ServiceName,
} from "@ccip/shared-types";

const TIMEFRAMES = ["1m", "3m", "6m", "12m", "all"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];
const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  "1m": "Last 1 Month",
  "3m": "Last 3 Months",
  "6m": "Last 6 Months",
  "12m": "Last 12 Months",
  all: "All Time",
};

const REGION_OPTIONS: Region[] = [Region.AMERICAS, Region.MEA, Region.EUROPE, Region.APAC, Region.NON_TERRESTRIAL];
const SERVICE_OPTIONS: ServiceName[] = [ServiceName.SCCP, ServiceName.DSX, ServiceName.IPX];

// The "Change" filter's changeType value: "" (the default, pill labeled
// "Commercial Churn") and "ALL" ("Show Everything") are query-time-only
// sentinels -- "" means "don't send changeType at all" (the backend then
// applies its own default: ADDED/REMOVED/REPLACED, onboarding rows
// excluded); "ALL" is sent verbatim and means no restriction whatsoever,
// including onboarding rows. DIAMETER_SS7_FILTER_VALUE is a comma-joined
// pair (DIAMETER_REALM_UPDATE,POINT_CODE_GT_UPDATE) -- the "Diameter & SS7
// Config" pill covers both signaling-plane technical types as one filter.
// Every other value is a single real RoutingChangeType sent as-is.
type ChangeFilterValue = RoutingChangeType | "ALL" | "" | typeof DIAMETER_SS7_FILTER_VALUE;
// Distinct from the "" default above purely so the ToggleButtonGroup (which
// needs *some* non-empty value to mark a button selected) doesn't collide
// with "ALL", which is itself now a real, distinct filter value.
const DEFAULT_CHURN_PILL = "DEFAULT_CHURN";

const CHANGE_TYPE_COLOR: Record<RoutingChangeType, "success" | "error" | "warning" | "info" | "default"> = {
  ADDED: "success",
  REMOVED: "error",
  REPLACED: "warning",
  IP_SUBNET_UPDATE: "info",
  DIAMETER_REALM_UPDATE: "info",
  POINT_CODE_GT_UPDATE: "info",
  ADMIN_NAME_UPDATE: "default",
};
const CHANGE_TYPE_LABEL: Record<RoutingChangeType, string> = {
  ADDED: "+ ADDED",
  REMOVED: "− REMOVED",
  REPLACED: "⇄ REPLACED",
  IP_SUBNET_UPDATE: "🌐 IP / SUBNET",
  DIAMETER_REALM_UPDATE: "🔄 DIAMETER / DEA",
  POINT_CODE_GT_UPDATE: "📟 SS7 / GT",
  ADMIN_NAME_UPDATE: "ℹ ADMIN / NAME",
};

// The REPLACED/REMOVED distinction is the one reviewers ask about most --
// both mean "this MNO's declared provider for this service is gone", but
// only REPLACED means a specific competitor is on record as having won
// it. A REPLACED row can come from the IR.21 file's own text naming both
// the old and new carrier directly, OR from reconciling a same-service
// removal against this MNO's very first-upload addition when the file
// only ever documents the removal by itself (see
// UploadService.backfillChangeHistory's own reconciliation comment) --
// either way, the Routing Modification Details column always shows the
// specific old -> new pair for a REPLACED row, never just "gone".
const CHANGE_TYPE_TOOLTIP: Record<RoutingChangeType, string> = {
  ADDED: "This MNO/Customer newly declared this wholesale provider for this service, with no prior provider on file to compare against.",
  REMOVED:
    "The declared provider for this service was dropped, with no replacement identified anywhere in this MNO's IR.21 filings -- a pure loss, not (yet) a competitor's win.",
  REPLACED:
    "A direct competitive swap: the declared provider for this service changed from one wholesale carrier to another. See Routing Modification Details for the specific old → new providers -- this is what feeds both the Top Provider Gainer and Loser stats for the same event.",
  IP_SUBNET_UPDATE: "Network-layer configuration only (IP ranges, ASN, DNS) -- no carrier relationship changed.",
  DIAMETER_REALM_UPDATE: "Signaling-plane configuration only (Diameter realm, DEA, S6a) -- no carrier relationship changed.",
  POINT_CODE_GT_UPDATE: "SS7 signaling-point configuration only (global title, point code, STP) -- no carrier relationship changed.",
  ADMIN_NAME_UPDATE: "Administrative or metadata update (rebranding, contact details, spelling) -- no carrier relationship changed.",
};

/** In-scope event counts per "Change" pill, computed client-side from an
 * unfiltered-by-changeType fetch (see countsQueryString/allTypeRows below)
 * so every pill can show its own subtotal simultaneously, not just whichever
 * one is currently selected. Mirrors Ir21RoutingChangesService.fetchFiltered's
 * own changeType semantics exactly: the 3 carrier-churn counts (and their
 * "commercial" union) exclude onboarding-flagged rows, same as the default
 * feed view and the KPI cards above; the 4 technical/admin counts never
 * need that exclusion (onboarding rows are only ever a carrier ADDED), and
 * "everything" is the one count that deliberately includes onboarding rows,
 * matching what the "Show Everything" pill itself actually fetches. */
interface PillCounts {
  commercial: number;
  added: number;
  replaced: number;
  removed: number;
  ipSubnet: number;
  diameterSs7: number;
  admin: number;
  everything: number;
}
interface ChangeFilterPillDef {
  value: ChangeFilterValue;
  label: string;
  countKey: keyof PillCounts;
  tooltip: string;
}

// Segment A -- genuine wholesale carrier switches, the "did we win or lose a
// carrier relationship" view a commercial/carrier-relations reviewer cares
// about. Segment B -- real IR.21 declarations too, but never a market-churn
// event: network-layer config, signaling-plane config, and administrative
// metadata a NOC/engineering reviewer would care about instead. Grouped and
// rendered as two visually distinct ToggleButtonGroups (see the JSX below)
// separated by a vertical Divider, but both still drive the single shared
// `changeType` state -- since every pill's `value` is unique across both
// groups, at most one button is ever "selected" at a time regardless of
// which group it lives in.
const COMMERCIAL_CHURN_PILLS: ChangeFilterPillDef[] = [
  {
    value: "",
    label: "Commercial Churn (Default)",
    countKey: "commercial",
    tooltip: "Aggregates + ADDED, ⇄ REPLACED, and − REMOVED -- every genuine wholesale carrier win, loss, or swap. Excludes onboarding rows from an MNO's very first IR.21 upload, which aren't real competitive activity.",
  },
  { value: "ADDED", label: "+ ADDED", countKey: "added", tooltip: CHANGE_TYPE_TOOLTIP.ADDED },
  { value: "REPLACED", label: "⇄ REPLACED", countKey: "replaced", tooltip: CHANGE_TYPE_TOOLTIP.REPLACED },
  { value: "REMOVED", label: "− REMOVED", countKey: "removed", tooltip: CHANGE_TYPE_TOOLTIP.REMOVED },
];
const TECHNICAL_ADMIN_PILLS: ChangeFilterPillDef[] = [
  { value: "IP_SUBNET_UPDATE", label: "🌐 IP & Subnets", countKey: "ipSubnet", tooltip: CHANGE_TYPE_TOOLTIP.IP_SUBNET_UPDATE },
  {
    value: DIAMETER_SS7_FILTER_VALUE,
    label: "🔄 Diameter & SS7 Config",
    countKey: "diameterSs7",
    tooltip: `${CHANGE_TYPE_TOOLTIP.DIAMETER_REALM_UPDATE} Also covers SS7 signaling-point config (global title, point code, STP).`,
  },
  { value: "ADMIN_NAME_UPDATE", label: "ℹ Admin & Entity Updates", countKey: "admin", tooltip: CHANGE_TYPE_TOOLTIP.ADMIN_NAME_UPDATE },
  {
    value: "ALL",
    label: "Show Everything",
    countKey: "everything",
    tooltip: "No restriction -- every event of every type, including onboarding rows and technical/administrative updates that the other pills all hide.",
  },
];

// Flat lookup across both pill groups -- used by the active-filter
// breadcrumb strip below to show a human label for whatever `changeType`
// value is currently selected, without duplicating the 8 labels again.
const ALL_CHANGE_PILLS = [...COMMERCIAL_CHURN_PILLS, ...TECHNICAL_ADMIN_PILLS];
function changeFilterLabel(value: ChangeFilterValue): string {
  return ALL_CHANGE_PILLS.find((p) => p.value === value)?.label ?? value;
}

// On mobile, a pill row that used to wrap into many short vertical lines
// (Timeframe with 5 options, Region with 6, both Change segments) instead
// becomes one horizontally-scrollable strip -- a touch-swipe row reads far
// better on a narrow screen than half a dozen wrapped lines of capsules
// pushing the actual data table below the fold. Every pill inside such a
// group also needs flexShrink: 0 (see ChangeFilterPill and the two plain
// ToggleButton groups below) so scrolling, not squeezing, is what happens
// when the strip doesn't fit.
function scrollablePillGroupSx(mobile: boolean) {
  return {
    flexWrap: mobile ? ("nowrap" as const) : ("wrap" as const),
    overflowX: mobile ? ("auto" as const) : ("visible" as const),
    WebkitOverflowScrolling: "touch" as const,
    pb: mobile ? 0.75 : 0,
  };
}

// Shared active/inactive pill styling for the Master Filter Bar's three
// ToggleButtonGroups (Timeframe, Region, Service) -- a solid navy fill with
// white bold text and a teal accent border on the selected pill, matching
// the same high-contrast treatment ChangeFilterPill already uses for the
// Change filter row below, so "what's actively scoping the data" reads at
// a glance instead of blending into a faint gray. Centralized here rather
// than repeated per group so all three stay visually identical.
const masterPillGroupSx = {
  "& .MuiToggleButton-root": {
    borderRadius: "999px !important",
    textTransform: "none",
    px: 1.5,
    border: "1px solid",
    borderColor: "#CFD8DC",
    bgcolor: "#FFFFFF",
    color: "#0A2540",
    fontWeight: 500,
    flexShrink: 0,
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

/** Absolute "DD-MMM-YYYY" (e.g. "01-Sep-2026") -- explicit dates for an
 * audit-style change log read better than a humanized relative time
 * ("3 days ago"), which forces a hover just to know the actual date and
 * drifts as the page sits open. Full timestamp still lives in the
 * Tooltip below for anyone who wants time-of-day precision too. */
function formatAbsoluteDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short" });
  return `${day}-${month}-${d.getFullYear()}`;
}

/** Same "DD-MMM-YYYY" style as formatAbsoluteDate, for a plain "YYYY-MM-DD"
 * date-only string (what a native <input type="date"> and the Custom Date
 * Range picker's own state hold) rather than a full ISO timestamp. */
function formatDateShort(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${day}-${month}-${date.getUTCFullYear()}`;
}

interface CustomDateRange {
  from: string;
  to: string;
}

// Sentinel so the Timeframe ToggleButtonGroup can mark a distinct "Custom
// Range" button selected without colliding with any real Timeframe value --
// same pattern as DEFAULT_CHURN_PILL below for the Change filter group.
const CUSTOM_RANGE_PILL = "CUSTOM_RANGE";

function DateCell(params: ICellRendererParams<Ir21RoutingChangeRow>) {
  const iso = params.value as string;
  if (!iso) return <span>-</span>;
  return (
    <InfoTooltip title={new Date(iso).toLocaleString()}>
      <span>{formatAbsoluteDate(iso)}</span>
    </InfoTooltip>
  );
}

function RegionCell(params: ICellRendererParams<Ir21RoutingChangeRow>) {
  const region = params.value as Region | null;
  if (!region) return <span style={{ color: "rgba(0,0,0,0.4)" }}>-</span>;
  const palette = REGION_CHIP_COLOR[region] ?? REGION_CHIP_COLOR[Region.NON_TERRESTRIAL];
  return <Chip label={region} size="small" sx={{ bgcolor: palette.bgcolor, color: palette.color, fontWeight: 600 }} />;
}

function ServiceCell(params: ICellRendererParams<Ir21RoutingChangeRow>) {
  return <Chip size="small" variant="outlined" label={params.value as string} />;
}

function ChangeTypeCell(params: ICellRendererParams<Ir21RoutingChangeRow>) {
  const v = params.value as RoutingChangeType;
  const chip = <Chip size="small" color={CHANGE_TYPE_COLOR[v]} label={CHANGE_TYPE_LABEL[v]} sx={{ fontWeight: 600 }} />;
  if (!params.data?.isInitialOnboarding) {
    return <InfoTooltip title={CHANGE_TYPE_TOOLTIP[v]}>{chip}</InfoTooltip>;
  }
  return (
    <InfoTooltip title="From this MNO's very first-ever IR.21 upload -- onboarding, not a real competitive win. Excluded from Total Churn Events and the Top Provider Gainer/Loser KPIs.">
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        {chip}
        <Chip label="Onboarding" size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
      </Box>
    </InfoTooltip>
  );
}

const NON_CARRIER_CHANGE_TYPES = new Set<RoutingChangeType>(["IP_SUBNET_UPDATE", "DIAMETER_REALM_UPDATE", "POINT_CODE_GT_UPDATE", "ADMIN_NAME_UPDATE"]);

function DetailsCell(params: ICellRendererParams<Ir21RoutingChangeRow>) {
  const row = params.data;
  if (!row) return null;
  if (NON_CARRIER_CHANGE_TYPES.has(row.changeType)) {
    return <span style={{ color: "rgba(0,0,0,0.6)" }}>{row.description ?? "-"}</span>;
  }
  if (row.changeType === "REPLACED") return <span>{row.oldProviderName} &rarr; {row.newProviderName}</span>;
  if (row.changeType === "ADDED") return <span>+ {row.newProviderName}</span>;
  return <span>&minus; {row.oldProviderName}</span>;
}

/** stopPropagation so clicking the PDF icon doesn't also trigger the row's
 * own onRowClicked navigation to the operator's detail page. */
function PdfCell(params: ICellRendererParams<Ir21RoutingChangeRow>) {
  if (!params.data?.hasPdfDocument) return <span style={{ color: "rgba(0,0,0,0.4)" }}>-</span>;
  return (
    <IconButton
      size="small"
      color="error"
      title="View IR.21 PDF"
      onClick={(e) => {
        e.stopPropagation();
        if (params.data) openMnoPdf(params.data.mnoId);
      }}
    >
      <PictureAsPdfIcon fontSize="small" />
    </IconButton>
  );
}

/** One "Change" filter pill, with its live subtotal badge baked in. Active
 * styling (solid navy fill, white bold text, teal accent border) is driven
 * entirely by the "&.Mui-selected" CSS branch rather than a JS-computed
 * boolean, so it always exactly reflects whichever button the parent
 * ToggleButtonGroup itself considers selected -- including the badge's own
 * colors, targeted via the nested ".pill-count-badge" descendant selector.
 * `disabled` is still a real prop (CSS can't disable a control), so a pill
 * with zero events in the current scope is dimmed and unclickable -- unless
 * it's the one currently active, so a filter that was valid a moment ago
 * never traps the user on a suddenly-disabled selected button. */
function ChangeFilterPill({
  pillValue,
  label,
  count,
  isActive,
  tooltip,
}: {
  pillValue: string;
  label: string;
  count: number;
  isActive: boolean;
  tooltip: string;
}) {
  return (
    <InfoTooltip title={tooltip}>
    <ToggleButton
      value={pillValue}
      disabled={count === 0 && !isActive}
      sx={{
        borderRadius: "999px !important",
        textTransform: "none",
        px: 1.5,
        py: 0.5,
        gap: 0.75,
        flexShrink: 0,
        border: "1px solid",
        borderColor: "#CFD8DC",
        bgcolor: "#FFFFFF",
        color: "#0A2540",
        fontWeight: 500,
        transition: "box-shadow 0.15s, opacity 0.15s",
        "&:hover": { bgcolor: "#F4F6F8", boxShadow: "0 2px 6px rgba(10,37,64,0.12)" },
        "&.Mui-disabled": { opacity: 0.4, bgcolor: "#FFFFFF", color: "#0A2540", borderColor: "#E3E8EC" },
        "&.Mui-selected, &.Mui-selected:hover": {
          bgcolor: "#0A2540",
          color: "#FFFFFF",
          fontWeight: 700,
          borderColor: "#00D4B2",
          boxShadow: "0 2px 8px rgba(10,37,64,0.25)",
        },
        "& .pill-count-badge": { bgcolor: "rgba(10,37,64,0.08)", color: "#0A2540" },
        "&.Mui-selected .pill-count-badge": { bgcolor: "rgba(255,255,255,0.22)", color: "#FFFFFF" },
        "&.Mui-disabled .pill-count-badge": { bgcolor: "rgba(10,37,64,0.06)", color: "rgba(10,37,64,0.5)" },
      }}
    >
      <span>{label}</span>
      <Box
        component="span"
        className="pill-count-badge"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 20,
          height: 18,
          px: 0.6,
          borderRadius: "999px",
          fontSize: 11,
          fontWeight: 700,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {count}
      </Box>
    </ToggleButton>
    </InfoTooltip>
  );
}

export default function Ir21ChangesPage() {
  const router = useRouter();
  // Below "md" (900px), the filter Paper collapses behind a "Filter &
  // Refine" trigger + bottom sheet Drawer instead of sitting inline --
  // three-plus stacked ToggleButtonGroups otherwise push the actual data
  // table well below the fold on a phone.
  const isMobile = useMediaQuery((theme: Theme) => theme.breakpoints.down("md"));
  const [filterDrawerOpen, setFilterDrawerOpen] = React.useState(false);

  const [timeframe, setTimeframe] = React.useState<Timeframe>("3m");
  const [region, setRegion] = React.useState<Region | "">("");
  const [service, setService] = React.useState<ServiceName | "">("");
  const [changeType, setChangeType] = React.useState<ChangeFilterValue>("");
  const [search, setSearch] = React.useState("");
  const [provider, setProvider] = React.useState<ProviderSuggestion | null>(null);
  const [providerInput, setProviderInput] = React.useState("");
  const [providerOptions, setProviderOptions] = React.useState<ProviderSuggestion[]>([]);

  // Custom Date Range (Master Filter Bar) -- when set, this replaces the
  // Timeframe preset entirely for every query below rather than combining
  // with it; see dateRangeQueryParams. `pendingRange` is the popover's own
  // in-progress draft (the two <input type="date"> fields), only committed
  // to `customRange` on "Apply" so partially-typed dates never trigger a
  // fetch.
  const [customRange, setCustomRange] = React.useState<CustomDateRange | null>(null);
  const [rangeAnchor, setRangeAnchor] = React.useState<HTMLElement | null>(null);
  const [pendingRange, setPendingRange] = React.useState<CustomDateRange>({ from: "", to: "" });

  // `summary` no longer drives any on-page KPI cards (the Market Capture &
  // Churn Pivot table below is the primary analytical driver now) -- kept
  // solely to feed the downloadable MIS report's executive summary section
  // (buildReportInput below), which still wants Total Churn Events / Top
  // Gainer / Top Loser / Active Switching figures even though the live page
  // presents that same information through the pivot instead.
  const [summary, setSummary] = React.useState<Ir21RoutingChangeSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = React.useState(true);
  const [rows, setRows] = React.useState<Ir21RoutingChangeRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  // The summary fetch (feeding the MIS report only, see above) intentionally
  // uses a narrower scope than the table below (timeframe/region/service
  // only -- never changeType, provider, or search), matching the same
  // "overall picture for the selected top-level scope" semantics the pivot
  // and charts also use via overviewQueryString.
  // An active Custom Date Range replaces the Timeframe preset outright in
  // every query below -- the two are mutually exclusive in the UI (picking
  // one clears the other; see the Master Filter Bar's ToggleButtonGroup
  // onChange and the Custom Range popover's Apply handler).
  const applyDateRangeParams = React.useCallback(
    (params: URLSearchParams) => {
      if (customRange) {
        params.set("fromDate", customRange.from);
        params.set("toDate", customRange.to);
      } else if (timeframe !== "all") {
        params.set("timeframe", timeframe);
      }
    },
    [customRange, timeframe],
  );

  const overviewQueryString = React.useMemo(() => {
    const params = new URLSearchParams();
    applyDateRangeParams(params);
    if (region) params.set("region", region);
    if (service) params.set("service", service);
    return params.toString();
  }, [applyDateRangeParams, region, service]);

  const queryString = React.useMemo(() => {
    const params = new URLSearchParams();
    applyDateRangeParams(params);
    if (region) params.set("region", region);
    if (service) params.set("service", service);
    if (changeType) params.set("changeType", changeType);
    if (provider) params.set("providerId", String(provider.id));
    if (search) params.set("search", search);
    return params.toString();
  }, [applyDateRangeParams, region, service, changeType, provider, search]);

  React.useEffect(() => {
    let cancelled = false;
    setSummaryLoading(true);
    api
      .get<Ir21RoutingChangeSummary>(`/analytics/ir21-changes/summary?${overviewQueryString}`)
      .then((s) => !cancelled && setSummary(s))
      .finally(() => !cancelled && setSummaryLoading(false));
    return () => {
      cancelled = true;
    };
  }, [overviewQueryString]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<Ir21RoutingChangeRow[]>(`/analytics/ir21-changes/feed?${queryString}`)
      .then((f) => !cancelled && setRows(f))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [queryString]);

  // Same scope as queryString (timeframe/region/service/provider/search) but
  // always fetched with changeType=ALL, i.e. every RoutingChangeType with no
  // restriction, so every "Change" pill's subtotal badge can be computed
  // simultaneously from one fetch -- not just whichever single pill is
  // currently selected. A separate round trip rather than deriving counts
  // from `rows` above, since `rows` is itself already narrowed to whichever
  // one changeType is active.
  const countsQueryString = React.useMemo(() => {
    const params = new URLSearchParams();
    applyDateRangeParams(params);
    if (region) params.set("region", region);
    if (service) params.set("service", service);
    params.set("changeType", "ALL");
    if (provider) params.set("providerId", String(provider.id));
    if (search) params.set("search", search);
    return params.toString();
  }, [applyDateRangeParams, region, service, provider, search]);

  const [allTypeRows, setAllTypeRows] = React.useState<Ir21RoutingChangeRow[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    api
      .get<Ir21RoutingChangeRow[]>(`/analytics/ir21-changes/feed?${countsQueryString}`)
      .then((f) => !cancelled && setAllTypeRows(f))
      .catch(() => !cancelled && setAllTypeRows([]));
    return () => {
      cancelled = true;
    };
  }, [countsQueryString]);

  // Market dynamics dataset: scoped to the Master Filter Bar's own
  // dimensions only (Timeframe/Custom Range/Region/Service, via
  // overviewQueryString -- the same scope the KPI cards use), deliberately
  // ignoring the lower Change/Provider/Search refinements. Backs both the
  // always-visible "Executive Market Dynamics" chart strip and the Market
  // Share Pivot Summary modal (a comprehensive market-share view triggered
  // from above those controls), so both stay in sync off one fetch instead
  // of two.
  const [dynamicsRows, setDynamicsRows] = React.useState<Ir21RoutingChangeRow[]>([]);
  const [dynamicsLoading, setDynamicsLoading] = React.useState(true);
  React.useEffect(() => {
    let cancelled = false;
    setDynamicsLoading(true);
    api
      .get<Ir21RoutingChangeRow[]>(`/analytics/ir21-changes/feed?${overviewQueryString}`)
      .then((f) => !cancelled && setDynamicsRows(f))
      .finally(() => !cancelled && setDynamicsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [overviewQueryString]);

  // Bucketed exactly the way Ir21RoutingChangesService.fetchFiltered itself
  // interprets each pill's changeType value -- see PillCounts' own doc
  // comment for why the carrier-churn counts exclude onboarding rows and
  // "everything" deliberately doesn't.
  const pillCounts: PillCounts = React.useMemo(() => {
    const diameterSs7Types = new Set<string>(DIAMETER_SS7_CHANGE_TYPES);
    const carrierChurnTypes = new Set<string>(CARRIER_CHURN_TYPES);
    let commercial = 0;
    let added = 0;
    let replaced = 0;
    let removed = 0;
    let ipSubnet = 0;
    let diameterSs7 = 0;
    let admin = 0;
    for (const r of allTypeRows) {
      if (carrierChurnTypes.has(r.changeType) && !r.isInitialOnboarding) {
        commercial++;
        if (r.changeType === "ADDED") added++;
        else if (r.changeType === "REPLACED") replaced++;
        else if (r.changeType === "REMOVED") removed++;
      } else if (r.changeType === "IP_SUBNET_UPDATE") ipSubnet++;
      else if (diameterSs7Types.has(r.changeType)) diameterSs7++;
      else if (r.changeType === "ADMIN_NAME_UPDATE") admin++;
    }
    return { commercial, added, replaced, removed, ipSubnet, diameterSs7, admin, everything: allTypeRows.length };
  }, [allTypeRows, loading]);

  React.useEffect(() => {
    if (!providerInput.trim()) {
      setProviderOptions([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .get<ProviderSuggestion[]>(`/provider/suggestions?q=${encodeURIComponent(providerInput)}`)
        .then(setProviderOptions)
        .catch(() => setProviderOptions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [providerInput]);

  // Distinct MNO count behind the currently filtered table rows -- an
  // operator with changes on all three services (SCCP/DSX/IPX) is 3 rows
  // but 1 operator, so this is never just `rows.length`. Derived client-
  // side from the already-fetched feed (not a separate API round trip) so
  // it updates instantly with every filter change, per the task's own
  // "client-side computation" requirement.
  const uniqueOperatorCount = React.useMemo(() => new Set(rows.map((r) => r.mnoId)).size, [rows]);

  // Distinct-entity subtotals for the column-header chips, derived
  // client-side from the already-fetched filtered feed (rows) -- same
  // "no extra API round trip" reasoning as uniqueOperatorCount above, so
  // every filter change (timeframe, provider, search, etc.) recomputes
  // these instantly.
  const columnSubtotals = React.useMemo(
    () => ({
      countries: new Set(rows.map((r) => r.country).filter(Boolean)).size,
      services: new Set(rows.map((r) => r.serviceName).filter(Boolean)).size,
      changeTypes: new Set(rows.map((r) => r.changeType).filter(Boolean)).size,
      providers: new Set(rows.flatMap((r) => [r.oldProviderName, r.newProviderName]).filter(Boolean)).size,
    }),
    [rows],
  );

  // Reused by both chart clicks (MarketDynamicsCharts) and pivot-row clicks
  // (MarketCapturePivot) -- either one selecting a carrier sets the same
  // `provider` state the plain "Wholesale Provider" search field above
  // reads and writes, so all three stay in sync automatically.
  const handleChartServiceClick = (svc: string) => {
    setService(svc as ServiceName);
  };
  const handleChartCarrierClick = (providerId: number, providerName: string) => {
    setProvider({ id: providerId, providerName, matchedAlias: null });
    setProviderInput(providerName);
  };
  const handleChartRegionClick = (regionValue: string) => {
    setRegion(regionValue as Region);
  };
  const clearProviderSelection = () => {
    setProvider(null);
    setProviderInput("");
  };

  // Counts exactly the filter/selection dimensions "Clear Filters" flushes
  // below -- drives both the button's own enabled state and its "(N
  // active)" label, so the two never drift out of sync with each other.
  const activeFilterCount =
    (customRange || timeframe !== "3m" ? 1 : 0) +
    (region ? 1 : 0) +
    (service ? 1 : 0) +
    (changeType ? 1 : 0) +
    (search ? 1 : 0) +
    (provider ? 1 : 0);

  // One-shot reset back to the page's baseline view. Provider and its
  // driving Autocomplete input are cleared together -- leaving providerInput
  // stale would show old typed text in a box whose `value` had already
  // reset to null. There are no URL query params to clean up here: unlike
  // /search/mno, this page's filters were never synced to the address bar
  // in the first place (queryString/overviewQueryString only ever feed the
  // API fetch), so resetting this state is already the complete flush.
  const resetAllFilters = () => {
    setTimeframe("3m");
    setCustomRange(null);
    setRegion("");
    setService("");
    setChangeType("");
    setSearch("");
    setProvider(null);
    setProviderInput("");
  };

  // ---- MIS report downloads ----
  // pdfReport/excelReport/csvReport (and the heavy libraries they wrap --
  // jspdf, jspdf-autotable, exceljs) are dynamically imported only once a
  // user actually picks a format, so this page's own initial bundle never
  // pays for a report nobody may ever generate this session.
  const [reportMenuAnchor, setReportMenuAnchor] = React.useState<HTMLElement | null>(null);
  const [generatingReport, setGeneratingReport] = React.useState<"pdf" | "excel" | "csv" | null>(null);

  // Every format reports on exactly the same two things currently on
  // screen: `summary` (the KPI cards' own Timeframe/Region/Service-only
  // scope) for the executive KPI blocks, and `rows` (the fully filtered
  // dataset behind the table -- every matching row, not just the current
  // grid page) for the ledger and every chart/aggregate derived from it.
  const dateScopeLabel = customRange ? `${formatDateShort(customRange.from)} → ${formatDateShort(customRange.to)}` : TIMEFRAME_LABELS[timeframe];

  const buildReportInput = (): MisReportInput => ({
    generatedAt: new Date(),
    scope: {
      timeframe: dateScopeLabel,
      region: region || "All",
      service: service || "All",
      changeCategory: changeFilterLabel(changeType),
      provider: provider?.providerName ?? null,
      search: search || null,
    },
    summary,
    rows,
  });

  const handleDownloadPdf = async () => {
    setReportMenuAnchor(null);
    setGeneratingReport("pdf");
    try {
      const { generatePdfReport } = await import("@/lib/reports/pdfReport");
      await generatePdfReport(buildReportInput());
    } finally {
      setGeneratingReport(null);
    }
  };
  const handleDownloadExcel = async () => {
    setReportMenuAnchor(null);
    setGeneratingReport("excel");
    try {
      const { generateExcelReport } = await import("@/lib/reports/excelReport");
      await generateExcelReport(buildReportInput());
    } finally {
      setGeneratingReport(null);
    }
  };
  const handleDownloadCsv = async () => {
    setReportMenuAnchor(null);
    setGeneratingReport("csv");
    try {
      const { generateCsvExport } = await import("@/lib/reports/csvReport");
      generateCsvExport(rows);
    } finally {
      setGeneratingReport(null);
    }
  };
  const REPORT_GENERATING_LABEL: Record<"pdf" | "excel" | "csv", string> = {
    pdf: "Generating CXO Brief…",
    excel: "Generating Workbook…",
    csv: "Generating CSV…",
  };

  // Unified Master Filter Strip -- Row 1 (Timeframe/Custom Range, Region,
  // Service pills) plus Row 2 (Wholesale Provider search, MNO/TADIG search,
  // Reset Filters), always rendered inline at the very top of the page on
  // every device. Only the finer Change-type classification lives outside
  // this strip (refineFilterBody, just above the ledger table) -- everything
  // else that scopes the page's data lives here. The Row 1 pill groups are
  // each independently horizontally-scrollable on mobile
  // (scrollablePillGroupSx), so showing them unconditionally doesn't
  // reintroduce the vertical stacking problem the old single combined
  // Drawer was built to avoid.
  const masterFilterBody = (
    <>
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", rowGap: 1.5, columnGap: 3, mb: 2 }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Timeframe:
            </Typography>
            <InfoTooltip title="Filters routing changes based on the effective change dates declared by MNOs in their official GSMA IR.21 filings.">
              <InfoOutlinedIcon fontSize="small" sx={{ color: "text.disabled", fontSize: 16 }} />
            </InfoTooltip>
          </Box>
          <ToggleButtonGroup
            exclusive
            size="small"
            color="primary"
            value={customRange ? CUSTOM_RANGE_PILL : timeframe}
            onChange={(event, v: string | null) => {
              if (!v) return;
              if (v === CUSTOM_RANGE_PILL) {
                setPendingRange(customRange ?? { from: "", to: "" });
                setRangeAnchor(event.currentTarget as HTMLElement);
                return;
              }
              setTimeframe(v as Timeframe);
              setCustomRange(null);
            }}
            sx={{
              display: "flex",
              ...scrollablePillGroupSx(isMobile),
              ...masterPillGroupSx,
            }}
          >
            {TIMEFRAMES.map((t) => (
              <ToggleButton key={t} value={t}>
                {TIMEFRAME_LABELS[t]}
              </ToggleButton>
            ))}
            <ToggleButton value={CUSTOM_RANGE_PILL}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <DateRangeIcon fontSize="small" />
                {customRange ? `${formatDateShort(customRange.from)} → ${formatDateShort(customRange.to)}` : "Custom Range"}
              </Box>
            </ToggleButton>
          </ToggleButtonGroup>
          <Popover
            open={!!rangeAnchor}
            anchorEl={rangeAnchor}
            onClose={() => setRangeAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          >
            <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5, minWidth: 260 }}>
              <Typography variant="subtitle2" fontWeight={700}>
                Custom Date Range
              </Typography>
              <TextField
                type="date"
                label="From Date"
                size="small"
                InputLabelProps={{ shrink: true }}
                value={pendingRange.from}
                onChange={(e) => setPendingRange((p) => ({ ...p, from: e.target.value }))}
              />
              <TextField
                type="date"
                label="To Date"
                size="small"
                InputLabelProps={{ shrink: true }}
                value={pendingRange.to}
                onChange={(e) => setPendingRange((p) => ({ ...p, to: e.target.value }))}
              />
              <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                {customRange && (
                  <Button
                    size="small"
                    onClick={() => {
                      setCustomRange(null);
                      setRangeAnchor(null);
                    }}
                  >
                    Clear
                  </Button>
                )}
                <Button
                  size="small"
                  variant="contained"
                  disabled={!pendingRange.from || !pendingRange.to || pendingRange.from > pendingRange.to}
                  onClick={() => {
                    setCustomRange(pendingRange);
                    setRangeAnchor(null);
                  }}
                >
                  Apply
                </Button>
              </Box>
            </Box>
          </Popover>
        </Box>

        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Region:
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={region || "ALL"}
            onChange={(_, v) => {
              if (!v) return;
              setRegion(v === "ALL" ? "" : v);
            }}
            sx={{
              display: "flex",
              ...scrollablePillGroupSx(isMobile),
              ...masterPillGroupSx,
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

        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Service:
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={service || "ALL"}
            onChange={(_, v) => {
              if (!v) return;
              setService(v === "ALL" ? "" : v);
            }}
            sx={{
              display: "flex",
              ...scrollablePillGroupSx(isMobile),
              ...masterPillGroupSx,
            }}
          >
            <ToggleButton value="ALL">All</ToggleButton>
            {SERVICE_OPTIONS.map((s) => (
              <ToggleButton key={s} value={s}>
                {s}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      </Box>

      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2 }}>
        <Autocomplete
          size="small"
          options={providerOptions}
          value={provider}
          inputValue={providerInput}
          onInputChange={(_, v) => setProviderInput(v)}
          onChange={(_, v) => setProvider(v)}
          getOptionLabel={(o) => o.providerName}
          isOptionEqualToValue={(o, v) => o.id === v.id}
          sx={{ minWidth: 260, flex: isMobile ? "1 1 100%" : undefined }}
          renderInput={(params) => <TextField {...params} label="Wholesale Provider" placeholder="e.g. Tata Communications" />}
        />
        <TextField
          size="small"
          label="Search MNO / Cust / TADIG"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 240, flex: isMobile ? "1 1 100%" : undefined }}
        />
        <Button
          variant="outlined"
          size="small"
          startIcon={<FilterAltOffIcon fontSize="small" />}
          onClick={resetAllFilters}
          disabled={activeFilterCount === 0}
          sx={{
            borderColor: "#CFD8DC",
            color: "#0A2540",
            whiteSpace: "nowrap",
            "&:hover": { borderColor: "#0A2540", bgcolor: "rgba(10,37,64,0.04)" },
          }}
        >
          {activeFilterCount > 0 ? `Reset Filters (${activeFilterCount} active)` : "Reset Filters"}
        </Button>
        {!isMobile && (
          <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center", ml: "auto" }}>
            {loading
              ? "Loading…"
              : `${rows.length} change(s) across ${uniqueOperatorCount} unique MNO/Cust${uniqueOperatorCount === 1 ? "" : "s"}`}
          </Typography>
        )}
      </Box>
    </>
  );

  // "Refine Results" -- Change classification pills only now that
  // Timeframe/Region/Service/Provider/MNO search all live in
  // masterFilterBody above (always inline); this stays a separate section
  // rendered just above the granular changes ledger, shared between the
  // inline desktop Paper and the mobile bottom-sheet Drawer.
  const refineFilterBody = (
    <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1.5 }}>
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.25 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Change:
          </Typography>
          <InfoTooltip title="Left group: genuine wholesale carrier switches -- a provider was actually added, removed, or replaced. This is real market churn, and the commercial/carrier-relations view defaults to it. Right group: real IR.21 declarations too (network config, signaling-plane config, administrative metadata), but never a carrier switch, so they're hidden from the default view unless explicitly selected.">
            <InfoOutlinedIcon fontSize="small" sx={{ color: "text.disabled", fontSize: 16 }} />
          </InfoTooltip>
        </Box>

        <ToggleButtonGroup
          exclusive
          size="small"
          value={changeType || DEFAULT_CHURN_PILL}
          onChange={(_, v) => {
            if (!v) return;
            setChangeType(v === DEFAULT_CHURN_PILL ? "" : v);
          }}
          sx={{ display: "flex", gap: 1, ...scrollablePillGroupSx(isMobile) }}
        >
          {COMMERCIAL_CHURN_PILLS.map(({ value, label, countKey, tooltip }) => {
            const pillValue = value || DEFAULT_CHURN_PILL;
            return (
              <ChangeFilterPill
                key={pillValue}
                pillValue={pillValue}
                label={label}
                count={pillCounts[countKey]}
                isActive={(changeType || DEFAULT_CHURN_PILL) === pillValue}
                tooltip={tooltip}
              />
            );
          })}
        </ToggleButtonGroup>

        {!isMobile && <Divider orientation="vertical" flexItem sx={{ my: 0.5, borderColor: "#CFD8DC" }} />}

        <ToggleButtonGroup
          exclusive
          size="small"
          value={changeType || DEFAULT_CHURN_PILL}
          onChange={(_, v) => {
            if (!v) return;
            setChangeType(v === DEFAULT_CHURN_PILL ? "" : v);
          }}
          sx={{ display: "flex", gap: 1, ...scrollablePillGroupSx(isMobile) }}
        >
          {TECHNICAL_ADMIN_PILLS.map(({ value, label, countKey, tooltip }) => {
            const pillValue = value || DEFAULT_CHURN_PILL;
            return (
              <ChangeFilterPill
                key={pillValue}
                pillValue={pillValue}
                label={label}
                count={pillCounts[countKey]}
                isActive={(changeType || DEFAULT_CHURN_PILL) === pillValue}
                tooltip={tooltip}
              />
            );
          })}
        </ToggleButtonGroup>
      </Box>

      <InfoTooltip title="Inspect raw IR.21 <ChangeHistory> parsing rules and overrides.">
        <Button
          component={Link}
          href="/admin/mno-normalization?tab=changelog"
          size="small"
          startIcon={<RuleIcon fontSize="small" />}
          sx={{ whiteSpace: "nowrap" }}
        >
          View Full Normalization Audit &rarr;
        </Button>
      </InfoTooltip>
    </Box>
  );

  return (
    <RequireAuth>
      <AppShell>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
          Market Intelligence &amp; Routing Changes
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Tracks changes to each MNO / Customer&apos;s canonical declared provider per service (SCCP, DSX, IPX) across
          successive IR.21 re-uploads — provider additions, removals, and replacements, for commercial and
          carrier-relations review.
        </Typography>

        {/* Unified Master Filter Strip -- global scoping (Timeframe/Custom
           Range, Region, Service) plus Wholesale Provider search, MNO/TADIG
           search, and Reset Filters, always visible at the very top
           regardless of device width. Everything below reacts to this. */}
        <Paper sx={{ p: 2, mb: 3, bgcolor: "#F8FAFC", border: "1px solid #E2E8F0" }}>{masterFilterBody}</Paper>

        {/* The page's primary analytical driver -- embedded directly rather
           than behind a modal, per-carrier click cross-filters the charts
           and ledger below via the shared `provider` selection. */}
        <MarketCapturePivot
          rows={dynamicsRows}
          loading={dynamicsLoading}
          scopeLabel={`${dateScopeLabel} | ${region || "All Regions"} | ${service || "All Services"}`}
          selectedProviderId={provider?.id ?? null}
          onSelectProvider={handleChartCarrierClick}
          onClearSelection={clearProviderSelection}
        />

        <MarketDynamicsCharts
          rows={dynamicsRows}
          loading={dynamicsLoading}
          selectedProviderId={provider?.id ?? null}
          selectedProviderName={provider?.providerName ?? null}
          onServiceClick={handleChartServiceClick}
          onCarrierClick={handleChartCarrierClick}
          onRegionClick={handleChartRegionClick}
        />

        {isMobile ? (
          <>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
              <Badge badgeContent={activeFilterCount} color="primary" invisible={activeFilterCount === 0}>
                <Button
                  variant="outlined"
                  startIcon={<TuneIcon />}
                  onClick={() => setFilterDrawerOpen(true)}
                  sx={{ minHeight: 44, whiteSpace: "nowrap", borderColor: "#CFD8DC", color: "#0A2540" }}
                >
                  Refine Results
                </Button>
              </Badge>
              <Typography variant="body2" color="text.secondary" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {loading ? "Loading…" : `${rows.length} change(s) across ${uniqueOperatorCount} MNO/Cust${uniqueOperatorCount === 1 ? "" : "s"}`}
              </Typography>
            </Box>

            {/* Bottom-sheet Drawer -- Change/Provider/Search only now that
               Timeframe/Region/Service live in the always-visible Master
               Control Bar above; reflowed into a scrollable full-width
               sheet with its own dedicated footer actions. */}
            <Drawer
              anchor="bottom"
              open={filterDrawerOpen}
              onClose={() => setFilterDrawerOpen(false)}
              PaperProps={{ sx: { maxHeight: "88vh", borderTopLeftRadius: 16, borderTopRightRadius: 16, display: "flex", flexDirection: "column" } }}
            >
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 2, borderBottom: "1px solid", borderColor: "divider" }}>
                <Typography variant="h6" fontWeight={700}>
                  Refine Results
                </Typography>
                <IconButton onClick={() => setFilterDrawerOpen(false)} aria-label="Close filters" sx={{ minWidth: 44, minHeight: 44 }}>
                  <CloseIcon />
                </IconButton>
              </Box>
              <Box sx={{ p: 2, overflowY: "auto", flex: 1 }}>{refineFilterBody}</Box>
              <Box sx={{ display: "flex", gap: 1, p: 2, borderTop: "1px solid", borderColor: "divider" }}>
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={resetAllFilters}
                  disabled={activeFilterCount === 0}
                  startIcon={<FilterAltOffIcon />}
                  sx={{ minHeight: 44, borderColor: "#CFD8DC", color: "#0A2540" }}
                >
                  Clear All
                </Button>
                <Button fullWidth variant="contained" onClick={() => setFilterDrawerOpen(false)} sx={{ minHeight: 44 }}>
                  {loading ? "Show Results" : `Show ${rows.length} Result${rows.length === 1 ? "" : "s"}`}
                </Button>
              </Box>
            </Drawer>
          </>
        ) : (
          <Paper sx={{ p: 2, mb: 2 }}>{refineFilterBody}</Paper>
        )}

        {/* Active-filter context strip -- names every dimension currently
           narrowing the table (not just "N active"), each removable on its
           own, so a reviewer who arrived here via a KPI-card click or a
           provider search always sees exactly what's constraining the view
           and how to back out of just one piece of it, not only "reset
           everything". Rendered only when something is actually filtering;
           the baseline view (3m, no provider/search/change override) shows
           nothing here at all. */}
        {activeFilterCount > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Filtered by:
            </Typography>
            {customRange ? (
              <Chip
                size="small"
                label={`Range: ${formatDateShort(customRange.from)} → ${formatDateShort(customRange.to)}`}
                onDelete={() => setCustomRange(null)}
              />
            ) : (
              timeframe !== "3m" && (
                <Chip size="small" label={`Timeframe: ${TIMEFRAME_LABELS[timeframe]}`} onDelete={() => setTimeframe("3m")} />
              )
            )}
            {region && <Chip size="small" label={`Region: ${region}`} onDelete={() => setRegion("")} />}
            {service && <Chip size="small" label={`Service: ${service}`} onDelete={() => setService("")} />}
            {changeType && <Chip size="small" label={`Change: ${changeFilterLabel(changeType)}`} onDelete={() => setChangeType("")} />}
            {provider && (
              <Chip
                size="small"
                color="primary"
                label={`Provider: ${provider.providerName}`}
                onDelete={clearProviderSelection}
              />
            )}
            {search && <Chip size="small" label={`Search: "${search}"`} onDelete={() => setSearch("")} />}
            <Button size="small" onClick={resetAllFilters} startIcon={<FilterAltOffIcon fontSize="small" />} sx={{ ml: 0.5 }}>
              Reset to Default View
            </Button>
          </Box>
        )}

        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1.5 }}>
          <Button
            variant="contained"
            disabled={rows.length === 0 || !!generatingReport}
            startIcon={generatingReport ? <CircularProgress size={16} sx={{ color: "#fff" }} /> : <AssessmentOutlinedIcon />}
            endIcon={!generatingReport && <ArrowDropDownIcon />}
            onClick={(e) => setReportMenuAnchor(e.currentTarget)}
            sx={{
              minHeight: 44,
              bgcolor: "#0A2540",
              color: "#FFFFFF",
              "&:hover": { bgcolor: "#0A2540", boxShadow: 4 },
              "&.Mui-disabled": { bgcolor: generatingReport ? "#0A2540" : undefined, color: generatingReport ? "#FFFFFF" : undefined },
            }}
          >
            {generatingReport ? REPORT_GENERATING_LABEL[generatingReport] : "Download MIS Report"}
          </Button>
          <Menu anchorEl={reportMenuAnchor} open={!!reportMenuAnchor} onClose={() => setReportMenuAnchor(null)}>
            <MenuItem onClick={handleDownloadPdf}>
              <ListItemText primary="📄 Executive PDF Report (with Charts)" secondary="Formatted CXO executive brief with market share graphs & KPIs" />
            </MenuItem>
            <MenuItem onClick={handleDownloadExcel}>
              <ListItemText primary="📊 Detailed MIS Workbook (.xlsx)" secondary="Formatted multi-tab spreadsheet with summary KPIs & data" />
            </MenuItem>
            <MenuItem onClick={handleDownloadCsv}>
              <ListItemText primary="📑 Raw CSV Export (.csv)" secondary="Unformatted raw feed for data pipelines" />
            </MenuItem>
          </Menu>
        </Box>

        {!loading && rows.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 5, textAlign: "center" }}>
            <Typography variant="body1" fontWeight={600} sx={{ mb: 0.5 }}>
              No changes match your current filters
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {activeFilterCount > 0
                ? "Try widening the timeframe, or clear a filter above to see more results."
                : "No routing changes have been recorded for this scope yet."}
            </Typography>
            {activeFilterCount > 0 && (
              <Button variant="outlined" startIcon={<FilterAltOffIcon />} onClick={resetAllFilters}>
                Clear Filters
              </Button>
            )}
          </Paper>
        ) : (
        <DataGrid<Ir21RoutingChangeRow>
          rowData={rows}
          renderRowCount={(rowCount) => `${rowCount} change(s) across ${uniqueOperatorCount} MNO/Cust${uniqueOperatorCount === 1 ? "" : "s"}`}
          columnDefs={[
            { field: "effectiveDate", headerName: "Date", cellRenderer: DateCell, minWidth: 130 },
            { field: "region", headerName: "Region", cellRenderer: RegionCell, minWidth: 140 },
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
              field: "mnoName",
              headerName: "MNO / Cust",
              flex: 1.3,
              minWidth: 180,
              headerComponent: ColumnHeaderWithSubtotal,
              headerComponentParams: { subtotal: uniqueOperatorCount, entityLabel: "MNO / Cust" },
            },
            { field: "tadigCode", headerName: "TADIG", maxWidth: 100 },
            {
              field: "serviceName",
              headerName: "Service",
              cellRenderer: ServiceCell,
              maxWidth: 130,
              headerComponent: ColumnHeaderWithSubtotal,
              headerComponentParams: { subtotal: columnSubtotals.services, entityLabel: "Service" },
            },
            {
              field: "changeType",
              headerName: "Change Action",
              cellRenderer: ChangeTypeCell,
              minWidth: 170,
              headerComponent: ColumnHeaderWithSubtotal,
              headerComponentParams: { subtotal: columnSubtotals.changeTypes, entityLabel: "Change Type" },
            },
            {
              headerName: "Routing Modification Details",
              cellRenderer: DetailsCell,
              flex: 1.6,
              minWidth: 260,
              sortable: false,
              filter: false,
              headerComponent: ColumnHeaderWithSubtotal,
              headerComponentParams: {
                subtotal: columnSubtotals.providers,
                entityLabel: "Wholesale Provider",
                infoTooltip:
                  "Green (+ ADDED) indicates a newly declared route; Red (- REMOVED) indicates a decommissioned route; Amber (⇄ REPLACED) indicates a direct carrier switch.",
              },
            },
            { field: "hasPdfDocument", headerName: "IR.21 PDF", cellRenderer: PdfCell, sortable: false, filter: false, minWidth: 100, flex: 0.6 },
          ]}
          onRowClicked={(row) => router.push(`/search/mno/${row.mnoId}`)}
          showTopPagination
          height={600}
        />
        )}
      </AppShell>
    </RequireAuth>
  );
}
