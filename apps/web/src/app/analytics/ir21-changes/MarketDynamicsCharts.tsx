"use client";

import * as React from "react";
import { Box, Button, Chip, CircularProgress, Collapse, Grid, IconButton, Paper, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Ir21RoutingChangeRow } from "@ccip/shared-types";
import { aggregateByRegion, REGION_COLORS } from "@/lib/reports/misReportData";
import { buildPivotData } from "@/lib/reports/pivotData";

// Per this feature's own spec: SCCP teal, DSX navy, IPX indigo -- a
// deliberately different assignment than the PDF/Excel report's own
// SERVICE_COLORS (misReportData.ts), which was fixed under an earlier spec
// and already ships in verified reports; changing it there now would be an
// unrelated regression risk for zero benefit, so this on-screen chart keeps
// its own palette rather than sharing that constant.
const SERVICE_CHART_COLORS: Record<string, string> = {
  SCCP: "#00D4B2",
  DSX: "#0A2540",
  IPX: "#5C6AC4",
};

function CustomTooltip({ active, payload, formatter }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: Record<string, unknown> }>; formatter: (p: Record<string, unknown>) => string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <Box sx={{ bgcolor: "#0A2540", color: "#fff", px: 1.5, py: 1, borderRadius: 1, fontSize: 12, boxShadow: 3 }}>
      {formatter(payload[0].payload)}
    </Box>
  );
}

interface ChartPanelProps {
  title: string;
  subtitle: string;
  // Optional per-panel header action -- only the Service donut currently
  // uses this (its "Clear <Service> ✕" chip), but kept generic on
  // ChartPanel itself rather than special-cased, in case a future panel
  // needs the same "own header-right action" slot.
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}
function ChartPanel({ title, subtitle, headerRight, children }: ChartPanelProps) {
  return (
    <Grid item xs={12} md={4}>
      <Paper variant="outlined" sx={{ p: 1.5, height: "100%", display: "flex", flexDirection: "column" }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
          <Box>
            <Typography variant="subtitle2" fontWeight={700} sx={{ color: "#0A2540" }}>
              {title}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
              {subtitle}
            </Typography>
          </Box>
          {headerRight}
        </Box>
        <Box sx={{ flex: 1, minHeight: 220 }}>{children}</Box>
      </Paper>
    </Grid>
  );
}

export default function MarketDynamicsCharts({
  rows,
  loading,
  selectedProviderId,
  selectedProviderName,
  selectedService,
  selectedRegion,
  onServiceClick,
  onCarrierClick,
  onRegionClick,
  onClearService,
  onResetDrilldowns,
}: {
  rows: Ir21RoutingChangeRow[];
  loading: boolean;
  // Set when a carrier row is selected in the Market Capture & Churn Pivot
  // table above -- the Service donut and Regional bar narrow to just that
  // provider's own gain/loss rows (matched the same way buildPivotData
  // attributes a row to a provider: old OR new providerId), while the
  // Carrier Net Movement chart keeps showing every carrier but visually
  // highlights the selected one, so its relative standing among peers
  // stays visible rather than being isolated out of context.
  selectedProviderId?: number | null;
  selectedProviderName?: string | null;
  // The Master Filter Bar's own active Service/Region pill (page.tsx's
  // `service`/`region` state) -- NOT derived from `rows` or `serviceData`/
  // `regionData` themselves, because both of those are already the
  // *result* of filtering by these two dimensions server-side (see
  // page.tsx's overviewQueryString). Once service is narrowed to "DSX",
  // the donut has no other slice left to compare against, so "this is a
  // drill-down" can only be known from an explicit flag, not inferred from
  // a single 100% slice (which would look identical to "this timeframe
  // just happens to only have DSX events").
  selectedService: string;
  selectedRegion: string;
  onServiceClick: (service: string) => void;
  onCarrierClick: (providerId: number, providerName: string) => void;
  onRegionClick: (region: string) => void;
  onClearService: () => void;
  // Clears service + region + provider together -- the header's own
  // "Reset Drill-Down" button, a single escape hatch covering every
  // chart-driven narrowing at once (as opposed to onClearService, which
  // only backs out the Service donut's own selection).
  onResetDrilldowns: () => void;
}) {
  const [expanded, setExpanded] = React.useState(true);

  const providerScopedRows = React.useMemo(
    () => (selectedProviderId == null ? rows : rows.filter((r) => r.oldProviderId === selectedProviderId || r.newProviderId === selectedProviderId)),
    [rows, selectedProviderId],
  );

  const serviceData = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of providerScopedRows) counts.set(r.serviceName, (counts.get(r.serviceName) ?? 0) + 1);
    const total = providerScopedRows.length || 1;
    return Array.from(counts.entries())
      .map(([service, count]) => ({ service, count, pct: (count / total) * 100 }))
      .sort((a, b) => b.count - a.count);
  }, [providerScopedRows]);

  const carrierData = React.useMemo(() => {
    const all = buildPivotData(rows);
    // Cap to the 5 strongest gainers and 5 strongest losers -- an
    // unfiltered ranked list can run into dozens of carriers, which turns
    // a diverging bar chart into an unreadable wall; the same cap the PDF
    // report's own chart applies for identical reasons. The selected
    // carrier (if any) is always kept even when it would otherwise fall
    // outside the top 5+5, so highlighting it never silently vanishes.
    if (all.length <= 10) return all;
    const gainers = [...all].filter((p) => p.net > 0).sort((a, b) => b.net - a.net).slice(0, 5);
    const losers = [...all].filter((p) => p.net < 0).sort((a, b) => a.net - b.net).slice(0, 5);
    const capped = [...gainers, ...losers];
    if (selectedProviderId != null && !capped.some((p) => p.providerId === selectedProviderId)) {
      const selectedEntry = all.find((p) => p.providerId === selectedProviderId);
      if (selectedEntry) capped.push(selectedEntry);
    }
    return capped.sort((a, b) => b.net - a.net);
  }, [rows, selectedProviderId]);

  const regionData = React.useMemo(() => aggregateByRegion(providerScopedRows), [providerScopedRows]);

  // Names every chart-driven narrowing currently active, for the header's
  // "Reset Drill-Down (...)" button label -- deliberately excludes the
  // page's other, non-chart-driven filters (Timeframe, Change type,
  // MNO/TADIG search), which have their own separate reset affordances.
  const activeDrilldownLabels = [
    selectedService ? `Service: ${selectedService}` : null,
    selectedProviderName ? `Provider: ${selectedProviderName}` : null,
    selectedRegion ? `Region: ${selectedRegion}` : null,
  ].filter((l): l is string => !!l);

  return (
    <Paper sx={{ mb: 3 }}>
      <Box
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5, cursor: "pointer" }}
        onClick={() => setExpanded((v) => !v)}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ShowChartIcon sx={{ color: "#0A2540" }} />
          <Typography variant="subtitle1" fontWeight={700}>
            Executive Market Dynamics
          </Typography>
          {selectedProviderId != null && selectedProviderName ? (
            <Box
              component="span"
              sx={{
                px: 1,
                py: 0.25,
                borderRadius: "999px",
                bgcolor: "#E3F2FD",
                color: "#0A2540",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              Filtered: {selectedProviderName}
            </Box>
          ) : (
            <Typography variant="caption" color="text.secondary">
              Click any slice or bar to drill down
            </Typography>
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {activeDrilldownLabels.length > 0 && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<RestartAltIcon fontSize="small" />}
              onClick={(e) => {
                e.stopPropagation();
                onResetDrilldowns();
              }}
              sx={{
                height: 24,
                fontSize: "0.72rem",
                fontWeight: 700,
                textTransform: "none",
                borderColor: "#CBD5E1",
                color: "#DC2626",
                bgcolor: "#FFFFFF",
                "&:hover": { bgcolor: "#FEF2F2", borderColor: "#F87171" },
              }}
            >
              Reset Drill-Down ({activeDrilldownLabels.join(" · ")})
            </Button>
          )}
          <IconButton size="small">{expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}</IconButton>
        </Box>
      </Box>
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <Box sx={{ px: 2, pb: 2 }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : rows.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
              No carrier routing changes in the current Master Filter Bar scope.
            </Typography>
          ) : (
            <Grid container spacing={2}>
              <ChartPanel
                title="Routing Changes by Service"
                subtitle={selectedService ? `Filtered by ${selectedService} — click the slice again or clear to reset` : "Click a slice to filter Service"}
                headerRight={
                  selectedService && (
                    <Chip
                      onDelete={onClearService}
                      color="primary"
                      label={`Clear ${selectedService}`}
                      size="small"
                      sx={{
                        height: 24,
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        bgcolor: "#0A2540",
                        color: "#00D4B2",
                        flexShrink: 0,
                        "& .MuiChip-deleteIcon": { color: "#00D4B2", "&:hover": { color: "#FFFFFF" } },
                      }}
                    />
                  )
                }
              >
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      // Recharts' Pie entrance/update animation interpolates
                      // sectors by array index; when the slice count itself
                      // changes between renders (a filter narrowing the
                      // distinct service/carrier set), that interpolation
                      // can leave every sector unrendered instead of just
                      // skipping the animation -- reproduced directly on
                      // the MNO Search page's equivalent donut. Disabled
                      // here for the same reliability reason.
                      isAnimationActive={false}
                      data={serviceData}
                      dataKey="count"
                      nameKey="service"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      cursor="pointer"
                      onClick={(_, index) => onServiceClick(serviceData[index].service)}
                      label={({ name, percent }: { name?: string; percent?: number }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {serviceData.map((d) => (
                        <Cell key={d.service} fill={SERVICE_CHART_COLORS[d.service] ?? "#9AA5B1"} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      content={
                        <CustomTooltip formatter={(p) => `${p.service}: ${p.count} events (${(p.pct as number).toFixed(1)}%)`} />
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              </ChartPanel>

              <ChartPanel title="Carrier Net Movement" subtitle="Click a bar to filter by Provider">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={carrierData} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="providerName"
                      width={90}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)}
                    />
                    <ReferenceLine x={0} stroke="#CFD8DC" />
                    <RechartsTooltip
                      content={
                        <CustomTooltip
                          formatter={(p) => `${p.providerName}: Net ${(p.net as number) >= 0 ? "+" : ""}${p.net} (Gains ${p.gains}, Losses ${p.losses})`}
                        />
                      }
                    />
                    <Bar
                      isAnimationActive={false}
                      dataKey="net"
                      cursor="pointer"
                      onClick={(_, index) => onCarrierClick(carrierData[index].providerId, carrierData[index].providerName)}
                      radius={3}
                    >
                      {carrierData.map((d) => {
                        const isSelected = d.providerId === selectedProviderId;
                        const dimmed = selectedProviderId != null && !isSelected;
                        return (
                          <Cell
                            key={d.providerId}
                            fill={d.net >= 0 ? "#2E7D32" : "#C62828"}
                            fillOpacity={dimmed ? 0.35 : 1}
                            stroke={isSelected ? "#00D4B2" : undefined}
                            strokeWidth={isSelected ? 2 : undefined}
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>

              <ChartPanel title="Regional Churn Distribution" subtitle="Click a bar to filter Region">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={regionData} margin={{ top: 8 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis hide />
                    <RechartsTooltip content={<CustomTooltip formatter={(p) => `${p.label}: ${p.count} events (${(p.pct as number).toFixed(1)}%)`} />} />
                    <Bar
                      isAnimationActive={false}
                      dataKey="count"
                      cursor="pointer"
                      onClick={(_, index) => onRegionClick(regionData[index].label)}
                      radius={[3, 3, 0, 0]}
                    >
                      {regionData.map((d) => (
                        <Cell key={d.label} fill={REGION_COLORS[d.label] ?? "#9AA5B1"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
            </Grid>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}
