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
  Card,
  CardContent,
  Chip,
  Divider,
  Drawer,
  Grid,
  IconButton,
  Paper,
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
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import DataGrid from "@/components/DataGrid";
import ColumnHeaderWithSubtotal from "@/components/ColumnHeaderWithSubtotal";
import InfoTooltip from "@/components/InfoTooltip";
import { api } from "@/lib/api";
import { openMnoPdf } from "@/lib/openPdf";
import { getCountryName } from "@/lib/countries";
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

const ACTIVE_KPI_LABEL: Record<"churn" | "gainer" | "loser" | "switching", string> = {
  churn: "Total Churn Events",
  gainer: "Top Provider Gainer",
  loser: "Top Provider Loser",
  switching: "Active Switching MNOs/Custs",
};

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

function KpiCard({
  label,
  value,
  color,
  tooltip,
  active,
  disabled,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  color: string;
  tooltip: string;
  active: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <Grid item xs={12} sm={6} md={3}>
      <Card
        variant="outlined"
        onClick={disabled ? undefined : onClick}
        sx={{
          borderTop: 4,
          borderColor: color,
          height: "100%",
          cursor: onClick && !disabled ? "pointer" : "default",
          outline: active ? "2px solid" : "none",
          outlineColor: "primary.main",
          outlineOffset: "-1px",
          opacity: disabled ? 0.6 : 1,
          transition: "box-shadow 0.15s",
          "&:hover": onClick && !disabled ? { boxShadow: 3 } : undefined,
        }}
      >
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4 }}>
              {label}
            </Typography>
            <InfoTooltip title={tooltip}>
              <InfoOutlinedIcon fontSize="small" sx={{ color: "text.disabled", fontSize: 16 }} />
            </InfoTooltip>
            {active && <Chip label="Filtered" size="small" color="primary" sx={{ ml: "auto", height: 20, flexShrink: 0 }} />}
          </Box>
          {typeof value === "string" ? (
            <Typography variant="h6" fontWeight={700} sx={{ mt: 0.5, wordBreak: "break-word", overflowWrap: "break-word" }}>
              {value}
            </Typography>
          ) : (
            value
          )}
        </CardContent>
      </Card>
    </Grid>
  );
}

/** Provider name + gross/net stats for the Gainer/Loser KPI cards, laid out
 * as a wrapping name line plus a separate stat chip row instead of one long
 * interpolated string -- a name like "Tata Communications" combined with
 * "(+38 gains | Net: +37)" routinely exceeds a quarter-width desktop card
 * (and any width on mobile) as a single noWrap line, which is what forced
 * the old ellipsis truncation. */
function ChurnKpiValue({
  providerName,
  statLabel,
  statCount,
  operatorsCount,
  netDelta,
  tone,
}: {
  providerName: string;
  statLabel: string;
  statCount: number;
  operatorsCount: number;
  netDelta: number;
  tone: "success" | "error";
}) {
  return (
    <Box sx={{ mt: 0.5 }}>
      <Typography variant="subtitle1" fontWeight={700} sx={{ wordBreak: "break-word", overflowWrap: "break-word", lineHeight: 1.3 }}>
        {providerName}
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75, mt: 0.5 }}>
        <Chip
          size="small"
          color={tone}
          variant="outlined"
          label={`${operatorsCount} MNO/Cust${operatorsCount === 1 ? "" : "s"} (${tone === "success" ? "+" : "-"}${statCount} ${statLabel})`}
          sx={{ fontWeight: 600 }}
        />
        <Typography variant="caption" color="text.secondary">
          Net: {netDelta >= 0 ? "+" : ""}
          {netDelta}
        </Typography>
      </Box>
    </Box>
  );
}

type ChurnEntry = Ir21RoutingChangeSummary["topGainingProviders"][number];
type SwitchingEntry = Ir21RoutingChangeSummary["topSwitchingOperators"][number];

const kpiAutocompleteSx = (tone: "success" | "error" | "warning") => ({
  mt: 0.5,
  bgcolor: "#F4F6F8",
  "& .MuiOutlinedInput-root": {
    fontSize: "0.75rem",
    py: "2px !important",
    "& fieldset": { borderColor: tone === "success" ? "success.main" : tone === "error" ? "error.main" : "#0A2540" },
  },
});

/** Searchable ranked selector embedded in the Gainer/Loser KPI cards,
 * letting a reviewer type a carrier name (or rank number -- MUI's default
 * filter matches anywhere in the rendered option label) to jump straight
 * to any provider's gain/loss events, not just the single top-ranked one
 * ChurnKpiValue headlines above it. Selecting an entry drives the same
 * `provider`/`providerRole` state the plain "Wholesale Provider"
 * Autocomplete below reads and writes, so the two stay in sync without
 * separate wiring: whichever entry is "selected" here is exactly whichever
 * the card's own headline is currently showing. `e.stopPropagation()` on
 * the wrapper keeps opening/typing in the field from also firing the
 * card's own onClick (which would otherwise jump the selection back to the
 * #1 entry every time). */
function ChurnProviderAutocomplete({
  entries,
  metric,
  role,
  selectedProviderId,
  onSelect,
  onClear,
  tone,
  emptyLabel,
}: {
  entries: ChurnEntry[];
  metric: "grossGains" | "grossLosses";
  role: "gainer" | "loser";
  selectedProviderId?: number;
  onSelect: (entry: ChurnEntry) => void;
  onClear: () => void;
  tone: "success" | "error";
  emptyLabel: string;
}) {
  const label = (entry: ChurnEntry, rank: number) => {
    const count = metric === "grossGains" ? entry.grossGains : entry.grossLosses;
    const noun = role === "gainer" ? "Service Gain" : "Service Loss";
    const opNoun = `MNO/Cust${entry.uniqueOperatorsCount === 1 ? "" : "s"}`;
    return `${rank}. ${entry.providerName} — ${entry.uniqueOperatorsCount} ${opNoun} (${role === "gainer" ? "+" : "-"}${count} ${noun} | Net: ${entry.netDelta >= 0 ? "+" : ""}${entry.netDelta})`;
  };
  const options = entries.map((entry, i) => ({ entry, rank: i + 1, label: label(entry, i + 1) }));
  const selected = options.find((o) => o.entry.providerId === selectedProviderId) ?? null;

  return (
    <Box onClick={(e) => e.stopPropagation()}>
      <KpiAutocompleteHint />
      <Autocomplete
        size="small"
        fullWidth
        options={options}
        value={selected}
        disabled={entries.length === 0}
        noOptionsText={emptyLabel}
        clearOnEscape
        disableClearable={false}
        getOptionLabel={(o) => o.label}
        isOptionEqualToValue={(o, v) => o.entry.providerId === v.entry.providerId}
        onChange={(_, v) => (v ? onSelect(v.entry) : onClear())}
        renderInput={(params) => <TextField {...params} placeholder={entries.length === 0 ? emptyLabel : "Search provider…"} />}
        sx={kpiAutocompleteSx(tone)}
      />
    </Box>
  );
}

/** Shared hint row for every searchable KPI-card control (Gainer, Loser,
 * Active Switching Operators) -- identical tooltip text across all three
 * per the platform's UX spec, so it's centralized here rather than
 * repeated at each call site. */
function KpiAutocompleteHint() {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 1 }}>
      <Typography variant="caption" color="text.secondary">
        Search &amp; filter
      </Typography>
      <InfoTooltip title="Type or select any ranked carrier/MNO to isolate their specific churn feed and re-scope the results table below.">
        <InfoOutlinedIcon fontSize="small" sx={{ color: "text.disabled", fontSize: 14 }} />
      </InfoTooltip>
    </Box>
  );
}

/** Same searchable ranked pattern as ChurnProviderAutocomplete, embedded in
 * the "Active Switching Operators" card -- lets a reviewer type an
 * operator name or TADIG to isolate one operator's full switching history
 * (every ADDED/REMOVED/REPLACED event, not narrowed to REPLACED-only; see
 * selectSwitchingOperator below for why forcing REPLACED there was already
 * fixed as a bug). Unlike the Gainer/Loser cards, this card's own headline
 * is a plain count with no single "current entry" to default to, so this
 * control has no forced default selection -- it shows a match when the
 * shared `search` state equals one entry's operator name *or* its TADIG,
 * since the field it's synced with is explicitly labeled "Search Operator
 * / TADIG" and accepts either. Filling that shared box (selectSwitchingOperator,
 * below) still writes the name, not the TADIG -- a deliberate readability
 * choice, "Croatian Telecom" over "HRVCN" -- accepted with eyes open that
 * 6 operator names in the current dataset are shared by two different
 * MNOs each (e.g. two "Movistar" entities), so for those the table can
 * include a second, unrelated MNO's rows alongside the one actually
 * selected; typing or syncing in a TADIG instead avoids that ambiguity
 * entirely, since TADIG is always unique. */
function SwitchingOperatorAutocomplete({
  entries,
  searchText,
  onSelect,
  onClear,
  onTextChange,
}: {
  entries: SwitchingEntry[];
  searchText: string;
  onSelect: (entry: SwitchingEntry) => void;
  onClear: () => void;
  onTextChange: (text: string) => void;
}) {
  const label = (entry: SwitchingEntry, rank: number) => `${rank}. ${entry.operatorName} (${entry.tadigCode}) — ${entry.changeCount} switches`;
  const options = entries.map((entry, i) => ({ entry, rank: i + 1, label: label(entry, i + 1) }));
  // Matches on TADIG too, not just operator name -- the shared "Search
  // Operator / TADIG" box below is explicitly a TADIG search as well, and
  // this control needs to reflect a value typed or synced there in either
  // form for the two-way sync to actually hold for both of that field's
  // documented uses.
  const selected = options.find((o) => o.entry.operatorName === searchText || o.entry.tadigCode === searchText) ?? null;

  return (
    <Box onClick={(e) => e.stopPropagation()}>
      <KpiAutocompleteHint />
      <Autocomplete
        size="small"
        fullWidth
        options={options}
        value={selected}
        // Controlled by the same shared `search` state the plain "Search
        // Operator / TADIG" box below reads and writes -- this is what
        // makes partial/in-progress typing there mirror up here live, not
        // just a completed exact match. `value` above still only resolves
        // to a real "selected" option on an exact name/TADIG match; the
        // raw text mirrors regardless, same as the field it's synced with.
        inputValue={searchText}
        onInputChange={(_, v, reason) => {
          // Only forward genuine user keystrokes -- MUI also fires this
          // with reason "reset" whenever `inputValue` changes for any
          // other reason (a selection, or this same prop being set from
          // outside), and blindly forwarding those would fight the
          // shared state instead of just following it.
          if (reason === "input") onTextChange(v);
        }}
        disabled={entries.length === 0}
        noOptionsText="No switching MNOs / Customers this period"
        clearOnEscape
        disableClearable={false}
        getOptionLabel={(o) => o.label}
        isOptionEqualToValue={(o, v) => o.entry.tadigCode === v.entry.tadigCode}
        onChange={(_, v) => (v ? onSelect(v.entry) : onClear())}
        renderInput={(params) => <TextField {...params} placeholder="Search MNO / Cust / TADIG…" />}
        sx={kpiAutocompleteSx("warning")}
      />
    </Box>
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
  const [providerRole, setProviderRole] = React.useState<"gainer" | "loser" | null>(null);
  const [activeKpi, setActiveKpi] = React.useState<"churn" | "gainer" | "loser" | "switching" | null>(null);

  const [summary, setSummary] = React.useState<Ir21RoutingChangeSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = React.useState(true);
  const [rows, setRows] = React.useState<Ir21RoutingChangeRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  // The 4 KPI cards intentionally use a narrower scope than the table below
  // (timeframe/region/service/search only -- never changeType, provider, or
  // providerRole) so they always show the overall picture for whatever
  // top-level scope is selected. Without this split, clicking any one KPI
  // (e.g. "Active Switching Operators", which narrows the table to REPLACED
  // events) would also recompute the *other* three cards against that same
  // narrow slice -- REPLACED events are rare enough that this routinely
  // collapsed every card to "no data" even when the overall dataset had
  // hundreds of real events in the selected window.
  //
  // `search` is deliberately excluded here too, even though it's a
  // top-level filter row control like timeframe/region/service: searching
  // for one operator (by hand, or via the Active Switching Operators
  // card's own autocomplete below, which fills this same field) is a
  // drill-down into a single entity, not a dataset-scope change -- the
  // exact same reasoning that keeps changeType/provider/providerRole out
  // of this query. Without this exclusion, picking one operator from that
  // card's dropdown would shrink its own options list down to just the
  // operator you picked, making every other operator unreachable without
  // first clearing the search box.
  const overviewQueryString = React.useMemo(() => {
    const params = new URLSearchParams();
    if (timeframe !== "all") params.set("timeframe", timeframe);
    if (region) params.set("region", region);
    if (service) params.set("service", service);
    return params.toString();
  }, [timeframe, region, service]);

  const queryString = React.useMemo(() => {
    const params = new URLSearchParams();
    if (timeframe !== "all") params.set("timeframe", timeframe);
    if (region) params.set("region", region);
    if (service) params.set("service", service);
    if (changeType) params.set("changeType", changeType);
    if (provider) params.set("providerId", String(provider.id));
    if (provider && providerRole) params.set("providerRole", providerRole);
    if (search) params.set("search", search);
    return params.toString();
  }, [timeframe, region, service, changeType, provider, providerRole, search]);

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
    if (timeframe !== "all") params.set("timeframe", timeframe);
    if (region) params.set("region", region);
    if (service) params.set("service", service);
    params.set("changeType", "ALL");
    if (provider) params.set("providerId", String(provider.id));
    if (provider && providerRole) params.set("providerRole", providerRole);
    if (search) params.set("search", search);
    return params.toString();
  }, [timeframe, region, service, provider, providerRole, search]);

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

  const topGainer = summary?.topGainingProviders[0];
  const topLoser = summary?.topLosingProviders[0];

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

  // The KPI card headline (ChurnKpiValue) and its ranked search control
  // (ChurnProviderAutocomplete) both show whichever provider is currently
  // selected -- matched purely by provider.id, independent of
  // providerRole. This is what makes the sync bidirectional: picking a
  // provider from the plain "Wholesale Provider" Autocomplete below (which
  // never sets providerRole, since a generic pick has no gainer/loser
  // direction) still shows up in whichever card(s) that provider actually
  // ranks in -- both, if it's genuinely both a gainer and a loser this
  // period. providerRole is now purely a table-query concern (which
  // direction of events to show), decoupled from which card highlights
  // the selection. A selected provider absent from a given list falls
  // back to that card's own #1 default rather than showing empty.
  const displayedGainer = (provider && summary?.topGainingProviders.find((e) => e.providerId === provider.id)) || topGainer;
  const displayedLoser = (provider && summary?.topLosingProviders.find((e) => e.providerId === provider.id)) || topLoser;

  const selectGainer = (entry: ChurnEntry) => {
    setActiveKpi("gainer");
    setProvider({ id: entry.providerId, providerName: entry.providerName, matchedAlias: null });
    setProviderRole("gainer");
    setProviderInput(entry.providerName);
    // changeType stays unset -- the backend's providerRole=gainer filter
    // already scopes to ADDED+REPLACED-as-newProvider server-side, so
    // there's no need to also drive the (single-select) Change toggle.
    setChangeType("");
  };
  const selectLoser = (entry: ChurnEntry) => {
    setActiveKpi("loser");
    setProvider({ id: entry.providerId, providerName: entry.providerName, matchedAlias: null });
    setProviderRole("loser");
    setProviderInput(entry.providerName);
    setChangeType("");
  };
  // Clearing either card's own search control only resets that role's
  // drill-down (falling back to the #1 default via displayedGainer/
  // displayedLoser above) -- it deliberately leaves timeframe, region,
  // service, and search untouched, per Task 3's two-way sync requirement.
  const clearGainerSelection = () => {
    if (providerRole !== "gainer") return;
    setActiveKpi(null);
    setProvider(null);
    setProviderRole(null);
    setProviderInput("");
  };
  const clearLoserSelection = () => {
    if (providerRole !== "loser") return;
    setActiveKpi(null);
    setProvider(null);
    setProviderRole(null);
    setProviderInput("");
  };
  const selectSwitchingOperator = (entry: SwitchingEntry) => {
    setActiveKpi("switching");
    setProvider(null);
    setProviderRole(null);
    setProviderInput("");
    // Filled with the operator name, not TADIG -- see
    // SwitchingOperatorAutocomplete's own doc comment for the readability
    // tradeoff this accepts (a handful of same-named operators can match
    // more broadly than the one specific TADIG selected).
    setSearch(entry.operatorName);
    // Not narrowed to changeType=REPLACED -- see handleSwitchingClick's own
    // comment below; that exact narrowing was already fixed as a bug
    // (REPLACED events are rare, so it routinely produced an empty table).
    // This shows the operator's full switching history instead.
    setChangeType("");
  };
  const clearSwitchingSelection = () => {
    setSearch("");
    setActiveKpi(null);
  };

  const handleChurnClick = () => {
    setActiveKpi("churn");
    setProvider(null);
    setProviderRole(null);
    setProviderInput("");
    setSearch("");
    setChangeType("");
  };
  const handleGainerClick = () => {
    if (!topGainer) return;
    selectGainer(topGainer);
  };
  const handleLoserClick = () => {
    if (!topLoser) return;
    selectLoser(topLoser);
  };
  const handleSwitchingClick = () => {
    setActiveKpi("switching");
    setProvider(null);
    setProviderRole(null);
    setProviderInput("");
    setSearch("");
    // The backend counts an MNO as an "active switching operator" the
    // moment it has *any* routing change (ADDED, REMOVED, or REPLACED) in
    // the period -- see Ir21RoutingChangesService.summary's `operators`
    // map, which isn't scoped to REPLACED. Narrowing the table to
    // changeType=REPLACED here (an earlier version of this handler did)
    // showed almost nothing, since a literal carrier-for-carrier
    // replacement is rare -- most switching activity is an ADDED or
    // REMOVED event. Leaving changeType clear shows every event for every
    // operator the KPI is actually counting, matching its own number.
    setChangeType("");
  };

  // Counts exactly the filter/selection dimensions "Clear Filters" flushes
  // below -- drives both the button's own enabled state and its "(N
  // active)" label, so the two never drift out of sync with each other.
  const activeFilterCount =
    (timeframe !== "3m" ? 1 : 0) +
    (region ? 1 : 0) +
    (service ? 1 : 0) +
    (changeType ? 1 : 0) +
    (search ? 1 : 0) +
    (provider ? 1 : 0) +
    (activeKpi ? 1 : 0);

  // One-shot reset back to the page's baseline view. Provider and its
  // driving Autocomplete input are cleared together -- leaving providerInput
  // stale would show old typed text in a box whose `value` had already
  // reset to null. There are no URL query params to clean up here: unlike
  // /search/mno, this page's filters were never synced to the address bar
  // in the first place (queryString/overviewQueryString only ever feed the
  // API fetch), so resetting this state is already the complete flush.
  const resetAllFilters = () => {
    setTimeframe("3m");
    setRegion("");
    setService("");
    setChangeType("");
    setSearch("");
    setProvider(null);
    setProviderInput("");
    setProviderRole(null);
    setActiveKpi(null);
  };

  // Shared between the inline desktop Paper and the mobile bottom-sheet
  // Drawer -- identical controls either way, just a different container.
  // The trailing count/"Clear Filters" pair is desktop-only: the mobile
  // Drawer has its own dedicated footer (Clear All / Show N Results)
  // instead, so showing both would be redundant inside the sheet.
  const filterBody = (
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
            value={timeframe}
            onChange={(_, v: Timeframe | null) => {
              if (!v) return;
              setTimeframe(v);
              setActiveKpi(null);
              setProviderRole(null);
            }}
            sx={{
              display: "flex",
              ...scrollablePillGroupSx(isMobile),
              "& .MuiToggleButton-root": { borderRadius: "999px !important", textTransform: "none", px: 1.5, border: "1px solid", borderColor: "divider", flexShrink: 0 },
            }}
          >
            {TIMEFRAMES.map((t) => (
              <ToggleButton key={t} value={t}>
                {TIMEFRAME_LABELS[t]}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
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
              setActiveKpi(null);
              setProviderRole(null);
            }}
            sx={{
              display: "flex",
              ...scrollablePillGroupSx(isMobile),
              "& .MuiToggleButton-root": { borderRadius: "999px !important", textTransform: "none", px: 1.5, border: "1px solid", borderColor: "divider", flexShrink: 0 },
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
              setActiveKpi(null);
              setProviderRole(null);
            }}
            sx={{
              display: "flex",
              ...scrollablePillGroupSx(isMobile),
              "& .MuiToggleButton-root": { borderRadius: "999px !important", textTransform: "none", px: 1.5, border: "1px solid", borderColor: "divider", flexShrink: 0 },
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

      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1.5, mb: 2 }}>
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
              setActiveKpi(null);
              setProviderRole(null);
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
              setActiveKpi(null);
              setProviderRole(null);
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

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
        <Autocomplete
          size="small"
          options={providerOptions}
          value={provider}
          inputValue={providerInput}
          onInputChange={(_, v) => setProviderInput(v)}
          onChange={(_, v) => {
            setProvider(v);
            setActiveKpi(null);
            setProviderRole(null);
          }}
          getOptionLabel={(o) => o.providerName}
          isOptionEqualToValue={(o, v) => o.id === v.id}
          sx={{ minWidth: 260, flex: isMobile ? "1 1 100%" : undefined }}
          renderInput={(params) => <TextField {...params} label="Wholesale Provider" placeholder="e.g. Tata Communications" />}
        />
        <TextField
          size="small"
          label="Search MNO / Cust / TADIG"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setActiveKpi(null);
            setProviderRole(null);
          }}
          sx={{ minWidth: 240, flex: isMobile ? "1 1 100%" : undefined }}
        />
        {!isMobile && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center" }}>
              {loading
                ? "Loading…"
                : `${rows.length} change(s) across ${uniqueOperatorCount} unique MNO/Cust${uniqueOperatorCount === 1 ? "" : "s"}`}
            </Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<FilterAltOffIcon />}
              onClick={resetAllFilters}
              disabled={activeFilterCount === 0}
              sx={{
                ml: "auto",
                alignSelf: "center",
                borderColor: "#CFD8DC",
                color: "#0A2540",
                "&:hover": { borderColor: "#0A2540", bgcolor: "rgba(10,37,64,0.04)" },
              }}
            >
              {activeFilterCount > 0 ? `Clear Filters (${activeFilterCount} active)` : "Clear Filters"}
            </Button>
          </>
        )}
      </Box>
    </>
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

        <Grid container spacing={2} sx={{ mb: 3 }}>
          <KpiCard
            label="Total Churn Events"
            value={summaryLoading ? "…" : summary?.totalChurnEvents ?? 0}
            color="#0A2540"
            tooltip="Total count of genuine carrier routing switches (additions, removals, and direct replacements across SCCP, DSX, and IPX) recorded in this period -- excludes IP/Subnet, Diameter/SS7, and Admin/Name updates, and excludes bulk-onboarding rows from an MNO's very first IR.21 upload, none of which is real market churn."
            active={activeKpi === "churn"}
            onClick={handleChurnClick}
          />
          <KpiCard
            label="Top Provider Gainer"
            value={
              summaryLoading ? (
                "…"
              ) : displayedGainer ? (
                <>
                  <ChurnKpiValue
                    providerName={displayedGainer.providerName}
                    statLabel="Service Gain"
                    statCount={displayedGainer.grossGains}
                    operatorsCount={displayedGainer.uniqueOperatorsCount}
                    netDelta={displayedGainer.netDelta}
                    tone="success"
                  />
                  <ChurnProviderAutocomplete
                    entries={summary?.topGainingProviders ?? []}
                    metric="grossGains"
                    role="gainer"
                    selectedProviderId={displayedGainer.providerId}
                    onSelect={selectGainer}
                    onClear={clearGainerSelection}
                    tone="success"
                    emptyLabel="No gains this period"
                  />
                </>
              ) : (
                "No gains this period"
              )
            }
            color="#2E7D32"
            tooltip="Wholesale carrier that achieved the highest gross new routing wins and competitor replacements across all MNO filings in this timeframe -- genuine carrier switches only, never a bulk-onboarding row from an MNO's first-ever IR.21 upload."
            active={activeKpi === "gainer"}
            disabled={!topGainer}
            onClick={handleGainerClick}
          />
          <KpiCard
            label="Top Provider Loser"
            value={
              summaryLoading ? (
                "…"
              ) : displayedLoser ? (
                <>
                  <ChurnKpiValue
                    providerName={displayedLoser.providerName}
                    statLabel="Service Loss"
                    statCount={displayedLoser.grossLosses}
                    operatorsCount={displayedLoser.uniqueOperatorsCount}
                    netDelta={displayedLoser.netDelta}
                    tone="error"
                  />
                  <ChurnProviderAutocomplete
                    entries={summary?.topLosingProviders ?? []}
                    metric="grossLosses"
                    role="loser"
                    selectedProviderId={displayedLoser.providerId}
                    onSelect={selectLoser}
                    onClear={clearLoserSelection}
                    tone="error"
                    emptyLabel="No losses recorded"
                  />
                </>
              ) : (
                "No losses recorded"
              )
            }
            color="#C62828"
            tooltip="Wholesale carrier that experienced the highest gross lost routes and removals across all MNO filings in this timeframe."
            active={activeKpi === "loser"}
            disabled={!topLoser}
            onClick={handleLoserClick}
          />
          <KpiCard
            label="Active Switching MNOs / Custs"
            value={
              summaryLoading ? (
                "…"
              ) : (
                <>
                  <Typography variant="h6" fontWeight={700} sx={{ mt: 0.5 }}>
                    {summary?.activeSwitchingOperatorCount ?? 0}
                  </Typography>
                  <SwitchingOperatorAutocomplete
                    entries={summary?.topSwitchingOperators ?? []}
                    searchText={search}
                    onSelect={selectSwitchingOperator}
                    onClear={clearSwitchingSelection}
                    onTextChange={(text) => {
                      setSearch(text);
                      setActiveKpi(null);
                      setProviderRole(null);
                    }}
                  />
                </>
              )
            }
            color="#EF6C00"
            tooltip="Count of unique MNOs / TADIG entities that modified at least one signaling or data roaming route during this period."
            active={activeKpi === "switching"}
            onClick={handleSwitchingClick}
          />
        </Grid>

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
                  Filter &amp; Refine
                </Button>
              </Badge>
              <Typography variant="body2" color="text.secondary" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {loading ? "Loading…" : `${rows.length} change(s) across ${uniqueOperatorCount} MNO/Cust${uniqueOperatorCount === 1 ? "" : "s"}`}
              </Typography>
            </Box>

            {/* Bottom-sheet Drawer -- every control from the desktop Paper,
               unchanged, just reflowed into a scrollable full-width sheet
               with its own dedicated footer actions, so a phone user never
               has to scroll past 3+ stacked ToggleButtonGroups to reach the
               actual data. */}
            <Drawer
              anchor="bottom"
              open={filterDrawerOpen}
              onClose={() => setFilterDrawerOpen(false)}
              PaperProps={{ sx: { maxHeight: "88vh", borderTopLeftRadius: 16, borderTopRightRadius: 16, display: "flex", flexDirection: "column" } }}
            >
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 2, borderBottom: "1px solid", borderColor: "divider" }}>
                <Typography variant="h6" fontWeight={700}>
                  Filter &amp; Refine
                </Typography>
                <IconButton onClick={() => setFilterDrawerOpen(false)} aria-label="Close filters" sx={{ minWidth: 44, minHeight: 44 }}>
                  <CloseIcon />
                </IconButton>
              </Box>
              <Box sx={{ p: 2, overflowY: "auto", flex: 1 }}>{filterBody}</Box>
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
          <Paper sx={{ p: 2, mb: 2 }}>{filterBody}</Paper>
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
            {timeframe !== "3m" && (
              <Chip size="small" label={`Timeframe: ${TIMEFRAME_LABELS[timeframe]}`} onDelete={() => setTimeframe("3m")} />
            )}
            {region && <Chip size="small" label={`Region: ${region}`} onDelete={() => setRegion("")} />}
            {service && <Chip size="small" label={`Service: ${service}`} onDelete={() => setService("")} />}
            {changeType && <Chip size="small" label={`Change: ${changeFilterLabel(changeType)}`} onDelete={() => setChangeType("")} />}
            {provider && (
              <Chip
                size="small"
                color="primary"
                label={`Provider: ${provider.providerName}${providerRole ? ` (${providerRole})` : ""}`}
                onDelete={() => {
                  setProvider(null);
                  setProviderInput("");
                  setProviderRole(null);
                  setActiveKpi(null);
                }}
              />
            )}
            {search && (
              <Chip
                size="small"
                label={`Search: "${search}"`}
                onDelete={() => {
                  setSearch("");
                  setActiveKpi(null);
                }}
              />
            )}
            {activeKpi && <Chip size="small" color="secondary" label={`View: ${ACTIVE_KPI_LABEL[activeKpi]}`} onDelete={() => setActiveKpi(null)} />}
            <Button size="small" onClick={resetAllFilters} startIcon={<FilterAltOffIcon fontSize="small" />} sx={{ ml: 0.5 }}>
              Reset to Default View
            </Button>
          </Box>
        )}

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
          exportFileName="ir21-routing-changes"
          showTopPagination
          height={600}
        />
        )}
      </AppShell>
    </RequireAuth>
  );
}
