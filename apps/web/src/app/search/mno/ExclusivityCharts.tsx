"use client";

import * as React from "react";
import { Box, Collapse, Grid, IconButton, Paper, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import type { MnoSummaryWithExclusivity } from "./page";

// A rotating palette for whichever wholesale carriers turn out to hold
// exclusive accounts in the current dataset -- carrier identity here isn't
// fixed the way SCCP/DSX/IPX is on the Market Intelligence page, so colors
// are assigned by rank rather than by name.
const DONUT_PALETTE = ["#0A2540", "#00D4B2", "#0B6FBF", "#EF6C00", "#6A1B9A", "#2E7D32", "#9AA5B1"];
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

  const donutData = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (!r.isFullyExclusive || !r.soleMasterProvider) continue;
      counts.set(r.soleMasterProvider, (counts.get(r.soleMasterProvider) ?? 0) + 1);
    }
    const total = Array.from(counts.values()).reduce((a, b) => a + b, 0) || 1;
    const ranked = Array.from(counts.entries())
      .map(([providerName, count]) => ({ providerName, count, pct: (count / total) * 100 }))
      .sort((a, b) => b.count - a.count);
    // Top 6 named slices + an "Others" bucket for the long tail -- a donut
    // with 20+ slivers is unreadable and defeats the "at a glance" purpose.
    if (ranked.length <= 7) return ranked;
    const top = ranked.slice(0, 6);
    const others = ranked.slice(6).reduce((sum, r) => sum + r.count, 0);
    return [...top, { providerName: "Others", count: others, pct: (others / total) * 100 }];
  }, [rows]);

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
                    Which wholesale carriers control the exclusive accounts
                  </Typography>
                  {donutData.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
                      No fully-exclusive MNOs in this scope.
                    </Typography>
                  ) : (
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie
                          data={donutData}
                          dataKey="count"
                          nameKey="providerName"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={2}
                          cursor="pointer"
                          onClick={(_, index) => {
                            const entry = donutData[index];
                            if (entry.providerName !== "Others") onProviderClick(entry.providerName);
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
                          content={<CustomTooltip formatter={(p) => `${p.providerName}: ${p.count} exclusive MNOs (${(p.pct as number).toFixed(1)}%)`} />}
                        />
                      </PieChart>
                    </ResponsiveContainer>
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
