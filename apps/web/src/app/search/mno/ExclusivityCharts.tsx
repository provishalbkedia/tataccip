"use client";

import * as React from "react";
import { Box, Chip, Collapse, Grid, IconButton, Paper, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { aggregateCarrierExclusivity } from "@/lib/reports/exclusivityReportData";
import type { MnoSummaryWithExclusivity } from "./page";

// A rotating palette for whichever wholesale carriers turn out to hold
// exclusive accounts in the current dataset -- carrier identity here isn't
// fixed the way SCCP/DSX/IPX is on the Market Intelligence page, so colors
// are assigned by rank rather than by name.
const DONUT_PALETTE = ["#0A2540", "#00D4B2", "#0B6FBF", "#EF6C00", "#6A1B9A", "#2E7D32", "#8E24AA", "#00796B"];
const OTHERS_COLOR = "#CFD8DC";

function CustomTooltip({
  active,
  payload,
  formatter,
}: {
  active?: boolean;
  payload?: Array<{ payload: Record<string, unknown> }>;
  formatter: (p: Record<string, unknown>) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <Box sx={{ bgcolor: "#0A2540", color: "#fff", px: 1.5, py: 1, borderRadius: 1, fontSize: 12, boxShadow: 3 }}>
      {formatter(payload[0].payload)}
    </Box>
  );
}

export default function ExclusivityCharts({
  rows,
  onProviderClick,
  onVulnerabilityClick,
}: {
  rows: MnoSummaryWithExclusivity[];
  onProviderClick: (providerName: string) => void;
  onVulnerabilityClick: (mode: "full" | "shared") => void;
}) {
  const [expanded, setExpanded] = React.useState(true);
  const [showOthers, setShowOthers] = React.useState(false);

  // Ranked by exclusive service assignments (SCCP/DSX/IPX-solo, counted
  // independently per service) rather than only full-portfolio exclusivity
  // -- see aggregateCarrierExclusivity's own doc comment for why: a
  // dominant multi-service carrier can hold many single-service exclusive
  // slots while rarely being the literal sole provider across an MNO's
  // *entire* declared portfolio, which used to make it vanish from this
  // chart entirely even while clearly present in the underlying data.
  const carrierShare = React.useMemo(() => aggregateCarrierExclusivity(rows), [rows]);

  const { donutData, othersBreakdown } = React.useMemo(() => {
    // Top 7 named slices + an "Others" bucket for the long tail -- a donut
    // with 20+ slivers is unreadable and defeats the "at a glance" purpose.
    // "Others" itself stays inspectable via the chip list rendered below
    // the chart (see showOthers), not just a vague leftover percentage.
    if (carrierShare.length <= 8) {
      return {
        donutData: carrierShare.map((c) => ({ providerName: c.providerName, count: c.totalExclusiveAssignments, pct: c.pctOfExclusiveAssignments })),
        othersBreakdown: [] as { providerName: string; count: number }[],
      };
    }
    const top = carrierShare.slice(0, 7);
    const rest = carrierShare.slice(7);
    const othersTotal = rest.reduce((sum, c) => sum + c.totalExclusiveAssignments, 0);
    const grandTotal = carrierShare.reduce((sum, c) => sum + c.totalExclusiveAssignments, 0) || 1;
    return {
      donutData: [
        ...top.map((c) => ({ providerName: c.providerName, count: c.totalExclusiveAssignments, pct: c.pctOfExclusiveAssignments })),
        { providerName: "Others", count: othersTotal, pct: (othersTotal / grandTotal) * 100 },
      ],
      othersBreakdown: rest.map((c) => ({ providerName: c.providerName, count: c.totalExclusiveAssignments })),
    };
  }, [carrierShare]);

  const vulnerabilityData = React.useMemo(() => {
    const fully = rows.filter((r) => r.isFullyExclusive).length;
    const shared = rows.length - fully;
    return [
      { mode: "full" as const, label: "Fully Exclusive (Single Provider)", count: fully },
      { mode: "shared" as const, label: "Multi-Provider (Shared)", count: shared },
    ];
  }, [rows]);

  return (
    <Paper sx={{ mb: 3 }}>
      <Box
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5, cursor: "pointer" }}
        onClick={() => setExpanded((v) => !v)}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ShowChartIcon sx={{ color: "#0A2540" }} />
          <Typography variant="subtitle1" fontWeight={700}>
            Exclusivity &amp; Market Share
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Click a slice or bar to drill down
          </Typography>
        </Box>
        <IconButton size="small">{expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}</IconButton>
      </Box>
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <Box sx={{ px: 2, pb: 2 }}>
          {rows.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
              No MNOs / Customers in the current search scope.
            </Typography>
          ) : (
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ p: 1.5, height: "100%" }}>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ color: "#0A2540" }}>
                    Carrier Exclusivity Share
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
                    Which wholesale carriers hold the most exclusive service assignments (SCCP/DSX/IPX-solo)
                  </Typography>
                  {donutData.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
                      No exclusive service assignments in this scope.
                    </Typography>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie
                            // Animation off: Recharts' Pie entrance/update
                            // animation interpolates sectors by array index,
                            // and when the slice count itself changes between
                            // renders (e.g. narrowing the search changes how
                            // many distinct carriers show up), that
                            // interpolation can end up leaving every sector's
                            // <path> unrendered rather than just skipping the
                            // animation -- reproduced directly against this
                            // page's own data. The chart's own click-to-drill
                            // interactivity matters far more here than an
                            // entrance flourish.
                            isAnimationActive={false}
                            data={donutData}
                            dataKey="count"
                            nameKey="providerName"
                            innerRadius={55}
                            outerRadius={90}
                            paddingAngle={2}
                            cursor="pointer"
                            onClick={(_, index) => {
                              const entry = donutData[index];
                              if (entry.providerName === "Others") setShowOthers((v) => !v);
                              else onProviderClick(entry.providerName);
                            }}
                            label={({ name, percent }: { name?: string; percent?: number }) =>
                              `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                            }
                            labelLine={false}
                          >
                            {donutData.map((d, i) => (
                              <Cell key={d.providerName} fill={d.providerName === "Others" ? OTHERS_COLOR : DONUT_PALETTE[i % DONUT_PALETTE.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            content={
                              <CustomTooltip
                                formatter={(p) =>
                                  p.providerName === "Others"
                                    ? `Others: ${p.count} exclusive assignments (${(p.pct as number).toFixed(1)}%) — click to see the breakdown`
                                    : `${p.providerName}: ${p.count} exclusive assignments (${(p.pct as number).toFixed(1)}%)`
                                }
                              />
                            }
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      {othersBreakdown.length > 0 && showOthers && (
                        <Box sx={{ mt: 1, p: 1, bgcolor: "#F4F6F8", borderRadius: 1 }}>
                          <Typography variant="caption" fontWeight={700} sx={{ color: "#0A2540", display: "block", mb: 0.5 }}>
                            Inside &quot;Others&quot; ({othersBreakdown.length} carriers):
                          </Typography>
                          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                            {othersBreakdown.map((c) => (
                              <Chip
                                key={c.providerName}
                                size="small"
                                clickable
                                onClick={() => onProviderClick(c.providerName)}
                                label={`${c.providerName} (${c.count})`}
                                sx={{ bgcolor: "#fff", border: "1px solid #CFD8DC" }}
                              />
                            ))}
                          </Box>
                        </Box>
                      )}
                    </>
                  )}
                </Paper>
              </Grid>

              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ p: 1.5, height: "100%" }}>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ color: "#0A2540" }}>
                    Exclusivity Vulnerability
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
                    Single-provider lock-in vs multi-provider redundancy, current scope
                  </Typography>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={vulnerabilityData} layout="vertical" margin={{ left: 8, right: 24 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 11 }} />
                      <RechartsTooltip
                        content={<CustomTooltip formatter={(p) => `${p.label}: ${p.count} MNOs (${rows.length > 0 ? (((p.count as number) / rows.length) * 100).toFixed(1) : "0.0"}%)`} />}
                      />
                      <Bar
                        isAnimationActive={false}
                        dataKey="count"
                        cursor="pointer"
                        onClick={(_, index) => onVulnerabilityClick(vulnerabilityData[index].mode)}
                        radius={3}
                      >
                        {vulnerabilityData.map((d) => (
                          <Cell key={d.mode} fill={d.mode === "full" ? "#F59E0B" : "#0B6FBF"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>
            </Grid>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}
