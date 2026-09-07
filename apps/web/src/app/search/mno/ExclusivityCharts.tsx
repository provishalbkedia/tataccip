"use client";

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import CloseIcon from "@mui/icons-material/Close";
import StarIcon from "@mui/icons-material/Star";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { aggregateCarrierExclusivity, ExclusivityAggregationMode } from "@/lib/reports/exclusivityReportData";
import type { MnoSummaryWithExclusivity } from "./page";

const AGGREGATION_MODE_LABEL: Record<ExclusivityAggregationMode, string> = {
  full: "Fully Exclusive",
  sccp: "SCCP-solo",
  dsx: "DSX-solo",
  ipx: "IPX-solo",
  any: "any exclusive (SCCP/DSX/IPX-solo)",
};

// This platform is Tata Communications' own CCIP -- leadership specifically
// wants Tata Comm's own competitive standing surfaced explicitly (see the
// KPI strip below) regardless of where it currently ranks, not just left to
// however big or small its donut slice happens to be.
const HOME_CARRIER = "Tata Comm";

// A fixed palette assigned deterministically per carrier NAME (via a hash),
// not by rank position -- ranking a carrier's slice by count means its
// palette index (and therefore its color) used to shift every time the
// filtered scope changed rank order, which read as the clicked slice's
// color "hijacking" to whatever sat at palette index 0. A name always maps
// to the same color now, regardless of scope or rank.
const DONUT_PALETTE = [
  "#0B6FBF", "#00A98A", "#EF6C00", "#6A1B9A", "#C2185B",
  "#2E7D32", "#8E24AA", "#00796B", "#D84315", "#455A64",
  "#5D4037", "#1565C0", "#AD1457", "#33691E", "#4527A0", "#00838F",
];
const OTHERS_COLOR = "#CFD8DC";

// FNV-1a -- a well-distributed 32-bit hash, so two carrier names landing on
// the same palette slot (an open-ended name set into a fixed palette can
// never be fully collision-free) is rare in practice rather than routine,
// the way a naive multiply-and-add hash into a small palette tended to be.
function colorForCarrier(name: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return DONUT_PALETTE[Math.abs(hash) % DONUT_PALETTE.length];
}

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
  providerScopedRows,
  aggregationMode,
  activeProviderFilter,
  onProviderClick,
  onResetProviderFilter,
  onVulnerabilityClick,
}: {
  rows: MnoSummaryWithExclusivity[];
  // Same underlying data as `rows`, but narrowed to the active Wholesale
  // Provider filter (page.tsx's baseFilteredRows, not chartRows) -- used
  // ONLY by the Exclusivity Vulnerability bar below, and only while a
  // provider filter is active, to answer a different, carrier-specific
  // question ("of THIS carrier's own accounts, how many are exclusively
  // ours vs shared with a competitor") than the donut's market-wide one.
  providerScopedRows: MnoSummaryWithExclusivity[];
  // Mirrors the page's own active Exclusivity Scope pill (mapped via
  // toAggregationMode) -- "full"/"sccp"/"dsx"/"ipx" scope the donut and the
  // Tata Comm KPI strip to exactly that pill's own definition; "any" is the
  // default cross-service view. Reacting to this is what keeps the chart in
  // sync with the pill bar above it -- selecting "Fully Exclusive" now
  // shows Tata Comm's *fully exclusive* count/share/rank here too, not the
  // broad "any service" figures regardless of which pill is active.
  aggregationMode: ExclusivityAggregationMode;
  activeProviderFilter: string;
  onProviderClick: (providerName: string) => void;
  onResetProviderFilter: () => void;
  onVulnerabilityClick: (mode: "full" | "shared") => void;
}) {
  const [expanded, setExpanded] = React.useState(true);
  const [showOthers, setShowOthers] = React.useState(false);

  // Ranked within the active Exclusivity Scope (aggregationMode) -- "any"
  // counts exclusive service assignments (SCCP/DSX/IPX-solo, independently
  // per service) rather than only full-portfolio exclusivity; see
  // aggregateCarrierExclusivity's own doc comment for why "any" exists and
  // how each single-dimension mode differs from it.
  const carrierShare = React.useMemo(() => aggregateCarrierExclusivity(rows, aggregationMode), [rows, aggregationMode]);

  const { donutData, othersBreakdown } = React.useMemo(() => {
    // Top 7 named slices + an "Others" bucket for the long tail -- a donut
    // with 20+ slivers is unreadable and defeats the "at a glance" purpose.
    // "Others" itself stays fully inspectable via its own breakdown dialog
    // (see showOthers) rather than a vague leftover percentage.
    if (carrierShare.length <= 8) {
      return {
        donutData: carrierShare.map((c) => ({ providerName: c.providerName, count: c.totalExclusiveAssignments, pct: c.pctOfExclusiveAssignments })),
        othersBreakdown: [] as { providerName: string; count: number; pct: number }[],
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
      othersBreakdown: rest.map((c) => ({ providerName: c.providerName, count: c.totalExclusiveAssignments, pct: c.pctOfExclusiveAssignments })),
    };
  }, [carrierShare]);

  // Two distinct questions depending on whether a carrier is selected:
  // - No provider filter: "of the whole addressable market, how much is
  //   locked to a single carrier vs has redundancy" -- a market-structure
  //   metric, computed from `rows` (the same unfiltered-by-provider set the
  //   donut uses), so it doesn't move just because a carrier gets
  //   highlighted.
  // - A provider filter active: "of THIS carrier's own accounts, how many
  //   are exclusively ours vs shared with a competitor" -- a carrier's own
  //   vulnerability to displacement, computed from providerScopedRows (the
  //   provider-narrowed row set). Every row there already involves the
  //   filtered carrier by construction, so isFullyExclusive on one of them
  //   can only mean *that* carrier is the sole provider (a row can't be
  //   fully exclusive to two different carriers at once) -- no separate
  //   "is this MY exclusive account" check is needed beyond the flag
  //   already on the row.
  const isCarrierScoped = !!activeProviderFilter;
  const vulnerabilitySourceRows = isCarrierScoped ? providerScopedRows : rows;
  const vulnerabilityData = React.useMemo(() => {
    const fully = vulnerabilitySourceRows.filter((r) => r.isFullyExclusive).length;
    const shared = vulnerabilitySourceRows.length - fully;
    return [
      {
        mode: "full" as const,
        label: isCarrierScoped ? `Exclusive to ${activeProviderFilter}` : "Fully Exclusive (Single Provider)",
        count: fully,
      },
      {
        mode: "shared" as const,
        label: isCarrierScoped ? "Shared with Other Carriers" : "Multi-Provider (Shared)",
        count: shared,
      },
    ];
  }, [vulnerabilitySourceRows, isCarrierScoped, activeProviderFilter]);

  const homeCarrierRank = carrierShare.findIndex((c) => c.providerName === HOME_CARRIER);
  const homeCarrierEntry = homeCarrierRank >= 0 ? carrierShare[homeCarrierRank] : null;

  return (
    <Paper sx={{ mb: 3 }}>
      <Box
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5, cursor: "pointer" }}
        onClick={() => setExpanded((v) => !v)}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <ShowChartIcon sx={{ color: "#0A2540" }} />
          <Typography variant="subtitle1" fontWeight={700}>
            Exclusivity &amp; Market Share
          </Typography>
          {activeProviderFilter ? (
            <Chip
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onResetProviderFilter();
              }}
              onDelete={(e) => {
                e.stopPropagation();
                onResetProviderFilter();
              }}
              deleteIcon={<CloseIcon fontSize="small" sx={{ color: "#fff !important" }} />}
              label={`Reset Drill-down: ${activeProviderFilter}`}
              sx={{ bgcolor: "#0A2540", color: "#fff", fontWeight: 600 }}
            />
          ) : (
            <Typography variant="caption" color="text.secondary">
              Click a slice or bar to drill down
            </Typography>
          )}
        </Box>
        <IconButton size="small" onClick={(e) => e.stopPropagation()} onClickCapture={() => setExpanded((v) => !v)}>
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <Box sx={{ px: 2, pb: 2 }}>
          {rows.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
              No MNOs / Customers in the current search scope.
            </Typography>
          ) : (
            <>
              {/* High-visibility active drill-down ribbon -- a second,
                 larger escape hatch than the compact header chip above, so
                 a user who filtered from a slice never has to hunt for how
                 to back out of it. */}
              {activeProviderFilter && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 1,
                    mb: 2,
                    p: 1.5,
                    borderRadius: 1,
                    bgcolor: "#EEF3FB",
                    border: "1px solid #0B6FBF",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Filtering by Carrier:
                    </Typography>
                    <Chip size="small" label={activeProviderFilter} sx={{ fontWeight: 700, bgcolor: "#0A2540", color: "#fff" }} />
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<RestartAltIcon fontSize="small" />}
                    onClick={onResetProviderFilter}
                    sx={{ borderColor: "#0B6FBF", color: "#0B6FBF" }}
                  >
                    Reset Chart Filter
                  </Button>
                </Box>
              )}

              {/* Tata Comm executive standing -- pulled out as its own
                 explicit metric so leadership can track it directly rather
                 than hunting for a possibly tiny, crowded-label slice. */}
              <Box
                onClick={() => homeCarrierEntry && onProviderClick(HOME_CARRIER)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 1.5,
                  mb: 2,
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: "#E6FBF6",
                  border: "1px solid #00D4B2",
                  cursor: homeCarrierEntry ? "pointer" : "default",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <StarIcon sx={{ color: "#00A98A", fontSize: 18 }} />
                  <Typography variant="body2" fontWeight={700} sx={{ color: "#0A2540" }}>
                    Tata Comm Exclusivity Standing
                  </Typography>
                </Box>
                {homeCarrierEntry ? (
                  <>
                    <Chip
                      size="small"
                      label={`${homeCarrierEntry.exclusiveMnoCount} ${AGGREGATION_MODE_LABEL[aggregationMode]} MNOs`}
                      sx={{ fontWeight: 700, bgcolor: "#fff" }}
                    />
                    <Chip
                      size="small"
                      label={`${homeCarrierEntry.pctOfExclusiveAssignments.toFixed(1)}% of ${AGGREGATION_MODE_LABEL[aggregationMode]} Footprint`}
                      sx={{ fontWeight: 700, bgcolor: "#fff" }}
                    />
                    <Chip size="small" label={`Rank #${homeCarrierRank + 1} of ${carrierShare.length}`} sx={{ fontWeight: 700, bgcolor: "#fff" }} />
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No {AGGREGATION_MODE_LABEL[aggregationMode]} accounts for Tata Comm in the current scope.
                  </Typography>
                )}
              </Box>

              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} md={6}>
                  <Paper variant="outlined" sx={{ p: 1.5, height: "100%" }}>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ color: "#0A2540" }}>
                      Carrier Exclusivity Share
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
                      Which wholesale carriers hold the most {AGGREGATION_MODE_LABEL[aggregationMode]} accounts
                    </Typography>
                    {/* Fixed minHeight + position:relative so this card never
                       collapses smaller than the chart needs, even for a
                       single render frame -- ResponsiveContainer's own
                       height is already a literal number below, not a
                       percentage needing a ResizeObserver pass, but the
                       *empty*-state branch (a short text line) previously
                       had no equivalent height reservation, which is
                       exactly the kind of asymmetry that lets a card
                       flash short if `rows` starts empty (before the API
                       response lands) and then jumps taller once it
                       arrives. */}
                    <Box sx={{ position: "relative", minHeight: 320 }}>
                    {donutData.length === 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
                        No {AGGREGATION_MODE_LABEL[aggregationMode]} accounts in this scope.
                      </Typography>
                    ) : (
                      <ResponsiveContainer width="100%" height={320}>
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
                              if (entry.providerName === "Others") setShowOthers(true);
                              else onProviderClick(entry.providerName);
                            }}
                            label={({ name, percent }: { name?: string; percent?: number }) =>
                              `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                            }
                            labelLine={false}
                          >
                            {donutData.map((d) => {
                              const isActive = d.providerName === activeProviderFilter;
                              return (
                                <Cell
                                  key={d.providerName}
                                  // Fill strictly reflects the carrier's own
                                  // stable identity color at all times --
                                  // selection is communicated purely via the
                                  // stroke, never by swapping the fill.
                                  fill={d.providerName === "Others" ? OTHERS_COLOR : colorForCarrier(d.providerName)}
                                  stroke={isActive ? "#0A2540" : "#FFFFFF"}
                                  strokeWidth={isActive ? 3 : 1}
                                />
                              );
                            })}
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
                    )}
                    </Box>
                  </Paper>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Paper variant="outlined" sx={{ p: 1.5, height: "100%" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <Typography variant="subtitle2" fontWeight={700} sx={{ color: "#0A2540" }}>
                        Exclusivity Vulnerability
                      </Typography>
                      <Tooltip
                        title={
                          isCarrierScoped
                            ? `Of ${activeProviderFilter}'s own on-net MNOs in this scope, how many have declared ${activeProviderFilter} as their sole provider (locked in, safe from displacement) vs also declare at least one other carrier for some service (a contested account a competitor could win). Always reflects the selected carrier -- this is the one chart that DOES change when you pick a different Wholesale Provider.`
                            : "Across the whole current scope (not narrowed by any single carrier), how many MNOs have exactly one wholesale provider across all their declared services (fully locked in) vs declare 2+ different providers (redundant, contestable). A market-structure metric -- select a Wholesale Provider above to see this carrier's own exclusive-vs-shared split instead."
                        }
                        arrow
                      >
                        <InfoOutlinedIcon fontSize="small" sx={{ color: "text.disabled", fontSize: 16, cursor: "help" }} />
                      </Tooltip>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
                      {isCarrierScoped
                        ? `${activeProviderFilter}'s own accounts: exclusively theirs vs shared with a competitor`
                        : "Single-provider lock-in vs multi-provider redundancy, current scope"}
                    </Typography>
                    <Box sx={{ position: "relative", minHeight: 320 }}>
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={vulnerabilityData} layout="vertical" margin={{ left: 8, right: 24 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 11 }} />
                        <RechartsTooltip
                          content={
                            <CustomTooltip
                              formatter={(p) =>
                                `${p.label}: ${p.count} MNOs (${
                                  vulnerabilitySourceRows.length > 0 ? (((p.count as number) / vulnerabilitySourceRows.length) * 100).toFixed(1) : "0.0"
                                }%)`
                              }
                            />
                          }
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
                    </Box>
                  </Paper>
                </Grid>
              </Grid>
            </>
          )}
        </Box>
      </Collapse>

      <Dialog open={showOthers} onClose={() => setShowOthers(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Other Exclusive Wholesale Carriers
          <IconButton size="small" onClick={() => setShowOthers(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ "& th": { bgcolor: "#F4F6F8", fontWeight: 700, fontSize: 12, color: "#5A6B7B" } }}>
                <TableCell>Carrier</TableCell>
                <TableCell align="right">Exclusive MNOs</TableCell>
                <TableCell align="right">% Share</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {othersBreakdown.map((c) => (
                <TableRow key={c.providerName} hover>
                  <TableCell>{c.providerName}</TableCell>
                  <TableCell align="right">{c.count}</TableCell>
                  <TableCell align="right">{c.pct.toFixed(1)}%</TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      onClick={() => {
                        onProviderClick(c.providerName);
                        setShowOthers(false);
                      }}
                    >
                      Filter &rarr;
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowOthers(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
