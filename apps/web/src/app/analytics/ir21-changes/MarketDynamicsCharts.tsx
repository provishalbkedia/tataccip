"use client";

import * as React from "react";
import { Box, CircularProgress, Collapse, Grid, IconButton, Paper, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ShowChartIcon from "@mui/icons-material/ShowChart";
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
  children: React.ReactNode;
}
function ChartPanel({ title, subtitle, children }: ChartPanelProps) {
  return (
    <Grid item xs={12} md={4}>
      <Paper variant="outlined" sx={{ p: 1.5, height: "100%", display: "flex", flexDirection: "column" }}>
        <Typography variant="subtitle2" fontWeight={700} sx={{ color: "#0A2540" }}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
          {subtitle}
        </Typography>
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
  onServiceClick,
  onCarrierClick,
  onRegionClick,
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
  onServiceClick: (service: string) => void;
  onCarrierClick: (providerId: number, providerName: string) => void;
  onRegionClick: (region: string) => void;
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
        <IconButton size="small">{expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}</IconButton>
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
              <ChartPanel title="Routing Changes by Service" subtitle="Click a slice to filter Service">
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
