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

function KpiCard({ label, value, color }: { label: string; value: React.ReactNode; color: string }) {
  return (
    <Grid item xs={12} sm={6} md={3}>
      <Card variant="outlined" sx={{ borderTop: 4, borderColor: color, height: "100%" }}>
        <CardContent>
          <Typography variant="overline" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="h6" fontWeight={700} noWrap title={typeof value === "string" ? value : undefined}>
            {value}
          </Typography>
        </CardContent>
      </Card>
    </Grid>
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

  const [summary, setSummary] = React.useState<Ir21RoutingChangeSummary | null>(null);
  const [rows, setRows] = React.useState<Ir21RoutingChangeRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const queryString = React.useMemo(() => {
    const params = new URLSearchParams();
    if (timeframe !== "all") params.set("timeframe", timeframe);
    if (region) params.set("region", region);
    if (service) params.set("service", service);
    if (changeType) params.set("changeType", changeType);
    if (provider) params.set("providerId", String(provider.id));
    if (search) params.set("search", search);
    return params.toString();
  }, [timeframe, region, service, changeType, provider, search]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<Ir21RoutingChangeSummary>(`/analytics/ir21-changes/summary?${queryString}`),
      api.get<Ir21RoutingChangeRow[]>(`/analytics/ir21-changes/feed?${queryString}`),
    ])
      .then(([s, f]) => {
        if (cancelled) return;
        setSummary(s);
        setRows(f);
      })
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
          <KpiCard label="Total Churn Events" value={loading ? "…" : summary?.totalChurnEvents ?? 0} color="#0A2540" />
          <KpiCard
            label="Top Provider Gainer"
            value={loading ? "…" : topGainer ? `${topGainer.providerName} (+${topGainer.netGain})` : "—"}
            color="#2E7D32"
          />
          <KpiCard
            label="Top Provider Loser"
            value={loading ? "…" : topLoser ? `${topLoser.providerName} (-${topLoser.netLoss})` : "—"}
            color="#C62828"
          />
          <KpiCard
            label="Active Switching Operators"
            value={loading ? "…" : summary?.activeSwitchingOperatorCount ?? 0}
            color="#EF6C00"
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
              onChange={(_, v: Timeframe | null) => v && setTimeframe(v)}
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
              onChange={(_, v) => v && setRegion(v === "ALL" ? "" : v)}
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
              onChange={(_, v) => v && setService(v === "ALL" ? "" : v)}
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
              onChange={(_, v) => v && setChangeType(v === "ALL" ? "" : v)}
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
              onChange={(_, v) => setProvider(v)}
              getOptionLabel={(o) => o.providerName}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              sx={{ minWidth: 260 }}
              renderInput={(params) => <TextField {...params} label="Wholesale Provider" placeholder="e.g. Tata Communications" />}
            />
            <TextField
              size="small"
              label="Search Operator / TADIG"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
