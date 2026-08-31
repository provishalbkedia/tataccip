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
  FormControl,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Select,
  type SelectChangeEvent,
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

function relativeTime(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years > 1 ? "s" : ""} ago`;
}

function DateCell(params: ICellRendererParams<Ir21RoutingChangeRow>) {
  const iso = params.value as string;
  if (!iso) return <span>-</span>;
  return (
    <Tooltip title={new Date(iso).toLocaleString()}>
      <span>{relativeTime(iso)}</span>
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
  netDelta,
  tone,
}: {
  providerName: string;
  statLabel: string;
  statCount: number;
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
          label={`${tone === "success" ? "+" : "-"}${statCount} ${statLabel}`}
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

/** Ranked dropdown embedded in the Gainer/Loser KPI cards, letting a
 * reviewer pivot straight to any provider's gain/loss events -- not just
 * the single top-ranked one ChurnKpiValue headlines above it. Selecting an
 * entry drives the same `provider`/`providerRole` state the plain
 * "Wholesale Provider" Autocomplete below reads and writes, so the two
 * stay in sync without separate wiring: whichever entry is "selected" here
 * is exactly whichever the card's own headline is currently showing.
 * `e.stopPropagation()` on the wrapper keeps opening the menu from also
 * firing the card's own onClick (which would otherwise jump the selection
 * back to the #1 entry every time). */
function ChurnProviderSelect({
  entries,
  metric,
  role,
  selectedProviderId,
  onSelect,
  tone,
  emptyLabel,
}: {
  entries: ChurnEntry[];
  metric: "grossGains" | "grossLosses";
  role: "gainer" | "loser";
  selectedProviderId?: number;
  onSelect: (entry: ChurnEntry) => void;
  tone: "success" | "error";
  emptyLabel: string;
}) {
  const value = selectedProviderId !== undefined ? String(selectedProviderId) : "";

  return (
    <FormControl size="small" fullWidth sx={{ mt: 1 }} onClick={(e) => e.stopPropagation()}>
      <Select
        displayEmpty
        value={value}
        disabled={entries.length === 0}
        onChange={(e: SelectChangeEvent) => {
          const id = Number(e.target.value);
          const entry = entries.find((x) => x.providerId === id);
          if (entry) onSelect(entry);
        }}
        sx={{
          fontSize: "0.75rem",
          bgcolor: "background.paper",
          "& .MuiSelect-select": { py: 0.5, px: 1 },
          "& .MuiOutlinedInput-notchedOutline": { borderColor: tone === "success" ? "success.main" : "error.main" },
        }}
        MenuProps={{ PaperProps: { style: { maxHeight: 320 } } }}
      >
        {entries.length === 0 ? (
          <MenuItem disabled value="">
            {emptyLabel}
          </MenuItem>
        ) : (
          entries.map((entry, i) => (
            <MenuItem key={entry.providerId} value={String(entry.providerId)} sx={{ fontSize: "0.8125rem" }}>
              {`${i + 1}. ${entry.providerName} (${role === "gainer" ? "+" : "-"}${metric === "grossGains" ? entry.grossGains : entry.grossLosses} ${role === "gainer" ? "gains" : "losses"} | Net: ${entry.netDelta >= 0 ? "+" : ""}${entry.netDelta})`}
            </MenuItem>
          ))
        )}
      </Select>
    </FormControl>
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
  const overviewQueryString = React.useMemo(() => {
    const params = new URLSearchParams();
    if (timeframe !== "all") params.set("timeframe", timeframe);
    if (region) params.set("region", region);
    if (service) params.set("service", service);
    if (search) params.set("search", search);
    return params.toString();
  }, [timeframe, region, service, search]);

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

  // The KPI card headline (ChurnKpiValue) and its ranked dropdown
  // (ChurnProviderSelect) both show whichever entry the user last picked
  // for that role -- defaulting to the #1 ranked entry until they pick a
  // different one. A manual pick via the plain "Wholesale Provider"
  // Autocomplete below never sets providerRole, so it correctly leaves
  // both cards showing their own #1 default rather than a guess.
  const displayedGainer = providerRole === "gainer" && provider ? (summary?.topGainingProviders.find((e) => e.providerId === provider.id) ?? topGainer) : topGainer;
  const displayedLoser = providerRole === "loser" && provider ? (summary?.topLosingProviders.find((e) => e.providerId === provider.id) ?? topLoser) : topLoser;

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
          Tracks changes to each operator&apos;s canonical declared provider per service (SCCP, DSX, IPX) across
          successive IR.21 re-uploads — provider additions, removals, and replacements, for commercial and
          carrier-relations review.
        </Typography>

        <Grid container spacing={2} sx={{ mb: 3 }}>
          <KpiCard
            label="Total Churn Events"
            value={summaryLoading ? "…" : summary?.totalChurnEvents ?? 0}
            color="#0A2540"
            tooltip="Total number of routing modifications (carrier additions, removals, and replacements across SCCP, DSX, IPX) declared across IR.21 filings within the selected period."
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
                    statLabel="gains"
                    statCount={displayedGainer.grossGains}
                    netDelta={displayedGainer.netDelta}
                    tone="success"
                  />
                  <ChurnProviderSelect
                    entries={summary?.topGainingProviders ?? []}
                    metric="grossGains"
                    role="gainer"
                    selectedProviderId={displayedGainer.providerId}
                    onSelect={selectGainer}
                    tone="success"
                    emptyLabel="No gains this period"
                  />
                </>
              ) : (
                "No gains this period"
              )
            }
            color="#2E7D32"
            tooltip="Wholesale carrier with the highest gross additions and contract wins (ADDED + REPLACED-as-new-provider) across all MNO declarations in this period. Net delta (gains minus losses) shown alongside for context. Use the dropdown to explore the full ranked list."
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
                    statLabel="losses"
                    statCount={displayedLoser.grossLosses}
                    netDelta={displayedLoser.netDelta}
                    tone="error"
                  />
                  <ChurnProviderSelect
                    entries={summary?.topLosingProviders ?? []}
                    metric="grossLosses"
                    role="loser"
                    selectedProviderId={displayedLoser.providerId}
                    onSelect={selectLoser}
                    tone="error"
                    emptyLabel="No losses recorded"
                  />
                </>
              ) : (
                "No losses recorded"
              )
            }
            color="#C62828"
            tooltip="Wholesale carrier with the highest gross losses and competitor replacements (REMOVED + REPLACED-as-old-provider) across all MNO declarations in this period — ranked by gross losses, not net position, so a provider that's still net-positive overall can still show up here if it genuinely lost some accounts. Empty only when zero providers have any recorded loss at all in this period. Use the dropdown to explore the full ranked list."
            active={activeKpi === "loser"}
            disabled={!topLoser}
            onClick={handleLoserClick}
          />
          <KpiCard
            label="Active Switching Operators"
            value={summaryLoading ? "…" : summary?.activeSwitchingOperatorCount ?? 0}
            color="#EF6C00"
            tooltip="Number of distinct MNOs / TADIG entities that had at least one routing provider change (switch, add, or drop) within the selected period. Click to show every change event for those operators in the table below."
            active={activeKpi === "switching"}
            onClick={handleSwitchingClick}
          />
        </Grid>

        <Paper sx={{ p: 2, mb: 2 }}>
          <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Timeframe:
            </Typography>
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
              label="Search Operator / TADIG"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setActiveKpi(null);
                setProviderRole(null);
              }}
              sx={{ minWidth: 240 }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center" }}>
              {loading ? "Loading…" : `${rows.length} change(s)`}
            </Typography>
          </Box>
        </Paper>

        <DataGrid<Ir21RoutingChangeRow>
          rowData={rows}
          columnDefs={[
            { field: "effectiveDate", headerName: "Date", cellRenderer: DateCell, minWidth: 130 },
            { field: "region", headerName: "Region", cellRenderer: RegionCell, minWidth: 140 },
            { field: "country", headerName: "Country", maxWidth: 110 },
            { field: "mnoName", headerName: "Operator (MNO)", flex: 1.3, minWidth: 180 },
            { field: "tadigCode", headerName: "TADIG", maxWidth: 100 },
            { field: "serviceName", headerName: "Service", cellRenderer: ServiceCell, maxWidth: 110 },
            { field: "changeType", headerName: "Change Action", cellRenderer: ChangeTypeCell, minWidth: 150 },
            { headerName: "Routing Modification Details", cellRenderer: DetailsCell, flex: 1.6, minWidth: 240, sortable: false, filter: false },
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
