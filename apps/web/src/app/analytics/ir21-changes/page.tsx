"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ICellRendererParams } from "ag-grid-community";
import {
  Autocomplete,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  IconButton,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import DataGrid from "@/components/DataGrid";
import { api } from "@/lib/api";
import { openMnoPdf } from "@/lib/openPdf";
import { getCountryName } from "@/lib/countries";
import {
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
const CHANGE_TYPE_OPTIONS: RoutingChangeType[] = [RoutingChangeType.ADDED, RoutingChangeType.REMOVED, RoutingChangeType.REPLACED];

const CHANGE_TYPE_COLOR: Record<RoutingChangeType, "success" | "error" | "warning"> = {
  ADDED: "success",
  REMOVED: "error",
  REPLACED: "warning",
};
const CHANGE_TYPE_LABEL: Record<RoutingChangeType, string> = {
  ADDED: "+ ADDED",
  REMOVED: "− REMOVED",
  REPLACED: "⇄ REPLACED",
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

function DateCell(params: ICellRendererParams<Ir21RoutingChangeRow>) {
  const iso = params.value as string;
  if (!iso) return <span>-</span>;
  return (
    <Tooltip title={new Date(iso).toLocaleString()}>
      <span>{formatAbsoluteDate(iso)}</span>
    </Tooltip>
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
  return <Chip size="small" color={CHANGE_TYPE_COLOR[v]} label={CHANGE_TYPE_LABEL[v]} sx={{ fontWeight: 600 }} />;
}

function DetailsCell(params: ICellRendererParams<Ir21RoutingChangeRow>) {
  const row = params.data;
  if (!row) return null;
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

/** AG Grid `headerComponent` -- renders a column's own header text plus an
 * MUI info-icon tooltip, matching KpiCard's own icon pattern. AG Grid
 * passes the configured `headerName` through `displayName`. */
function TooltipColumnHeader(props: { displayName: string; tooltipText: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      <span>{props.displayName}</span>
      <Tooltip title={props.tooltipText}>
        <InfoOutlinedIcon fontSize="small" sx={{ color: "text.disabled", fontSize: 15 }} />
      </Tooltip>
    </Box>
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
            <Tooltip title={tooltip}>
              <InfoOutlinedIcon fontSize="small" sx={{ color: "text.disabled", fontSize: 16 }} />
            </Tooltip>
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
      <Tooltip title="Type or select any ranked carrier/MNO to isolate their specific churn feed and re-scope the results table below.">
        <InfoOutlinedIcon fontSize="small" sx={{ color: "text.disabled", fontSize: 14 }} />
      </Tooltip>
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

export default function Ir21ChangesPage() {
  const router = useRouter();

  const [timeframe, setTimeframe] = React.useState<Timeframe>("3m");
  const [region, setRegion] = React.useState<Region | "">("");
  const [service, setService] = React.useState<ServiceName | "">("");
  const [changeType, setChangeType] = React.useState<RoutingChangeType | "">("");
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
            tooltip="Total count of routing modifications (carrier additions, removals, and direct replacements across SCCP, DSX, and IPX) recorded in this period."
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
            tooltip="Wholesale carrier that achieved the highest gross new routing wins and competitor replacements across all MNO filings in this timeframe."
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

        <Paper sx={{ p: 2, mb: 2 }}>
          <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, mb: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                Timeframe:
              </Typography>
              <Tooltip title="Filters routing changes based on the effective change dates declared by MNOs in their official GSMA IR.21 filings.">
                <InfoOutlinedIcon fontSize="small" sx={{ color: "text.disabled", fontSize: 16 }} />
              </Tooltip>
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
              sx={{ "& .MuiToggleButton-root": { borderRadius: "999px !important", textTransform: "none", px: 1.5, border: "1px solid", borderColor: "divider" } }}
            >
              {TIMEFRAMES.map((t) => (
                <ToggleButton key={t} value={t}>
                  {TIMEFRAME_LABELS[t]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, mb: 2 }}>
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
              sx={{ "& .MuiToggleButton-root": { borderRadius: "999px !important", textTransform: "none", px: 1.5, border: "1px solid", borderColor: "divider" } }}
            >
              <ToggleButton value="ALL">All</ToggleButton>
              {REGION_OPTIONS.map((r) => (
                <ToggleButton key={r} value={r}>
                  {r}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, mb: 2 }}>
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
              sx={{ "& .MuiToggleButton-root": { borderRadius: "999px !important", textTransform: "none", px: 1.5, border: "1px solid", borderColor: "divider" } }}
            >
              <ToggleButton value="ALL">All</ToggleButton>
              {SERVICE_OPTIONS.map((s) => (
                <ToggleButton key={s} value={s}>
                  {s}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
              Change:
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={changeType || "ALL"}
              onChange={(_, v) => {
                if (!v) return;
                setChangeType(v === "ALL" ? "" : v);
                setActiveKpi(null);
                setProviderRole(null);
              }}
              sx={{ "& .MuiToggleButton-root": { borderRadius: "999px !important", textTransform: "none", px: 1.5, border: "1px solid", borderColor: "divider" } }}
            >
              <ToggleButton value="ALL">All</ToggleButton>
              {CHANGE_TYPE_OPTIONS.map((c) => (
                <ToggleButton key={c} value={c}>
                  {CHANGE_TYPE_LABEL[c]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
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
              sx={{ minWidth: 260 }}
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
              sx={{ minWidth: 240 }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center" }}>
              {loading
                ? "Loading…"
                : `${rows.length} change(s) across ${uniqueOperatorCount} unique MNO/Cust${uniqueOperatorCount === 1 ? "" : "s"}`}
            </Typography>
          </Box>
        </Paper>

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
            },
            { field: "mnoName", headerName: "MNO / Cust", flex: 1.3, minWidth: 180 },
            { field: "tadigCode", headerName: "TADIG", maxWidth: 100 },
            { field: "serviceName", headerName: "Service", cellRenderer: ServiceCell, maxWidth: 110 },
            { field: "changeType", headerName: "Change Action", cellRenderer: ChangeTypeCell, minWidth: 150 },
            {
              headerName: "Routing Modification Details",
              cellRenderer: DetailsCell,
              flex: 1.6,
              minWidth: 240,
              sortable: false,
              filter: false,
              headerComponent: TooltipColumnHeader,
              headerComponentParams: {
                tooltipText:
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
      </AppShell>
    </RequireAuth>
  );
}
