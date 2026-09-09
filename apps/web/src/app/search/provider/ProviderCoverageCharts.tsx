"use client";

import * as React from "react";
import { Box, Chip, Collapse, Grid, IconButton, Paper, Tooltip, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import StarIcon from "@mui/icons-material/Star";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import ListAltOutlinedIcon from "@mui/icons-material/ListAltOutlined";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { ProviderStatsSource, ProviderSummary } from "@ccip/shared-types";

/** Compact round reset affordance for an individual chart card's own
 * header -- mirrors ExclusivityCharts.tsx's identical component on MNO
 * Search, kept as its own local copy for the same reason that file's own
 * comment gives for not sharing colorForProvider/CHART_PALETTE: an
 * independent feature area, not worth a shared module for ~15 lines. */
function ChartResetIconButton({ onReset }: { onReset: () => void }) {
  return (
    <Tooltip title="Reset filters to all providers">
      <IconButton
        size="small"
        onClick={onReset}
        sx={{
          width: 28,
          height: 28,
          flexShrink: 0,
          border: "1px solid #E2E8F0",
          bgcolor: "#F1F5F9",
          color: "#0A2540",
          "&:hover": { bgcolor: "#FEE2E2", color: "#DC2626", borderColor: "#CBD5E1" },
        }}
      >
        <RestartAltIcon sx={{ fontSize: 17 }} />
      </IconButton>
    </Tooltip>
  );
}

// This platform is Tata Communications' own CCIP -- same reasoning as the
// MNO Search page's Exclusivity Standing callout: leadership wants Tata
// Comm's own coverage standing surfaced explicitly, not just left to
// however tall its bar happens to land in a ranked chart.
const HOME_CARRIER = "Tata Comm";

// Deliberately a local copy of the same hash-based palette ExclusivityCharts
// uses on the MNO Search page (not a shared import) -- both pages want a
// carrier name to map to a consistent color, but they're independent
// feature areas and this is the only place either needs the palette itself,
// so a shared module would be pure indirection for ~15 lines used twice.
const CHART_PALETTE = [
  "#0B6FBF", "#00A98A", "#EF6C00", "#6A1B9A", "#C2185B",
  "#2E7D32", "#8E24AA", "#00796B", "#D84315", "#455A64",
  "#5D4037", "#1565C0", "#AD1457", "#33691E", "#4527A0", "#00838F",
];
function colorForProvider(name: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return CHART_PALETTE[Math.abs(hash) % CHART_PALETTE.length];
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

const SOURCE_SCOPE_LABEL: Record<ProviderStatsSource, string> = {
  [ProviderStatsSource.IR21]: "IR.21-declared",
  [ProviderStatsSource.REACH_LIST]: "Reach List-claimed",
  [ProviderStatsSource.BOTH]: "combined IR.21 + Reach List",
};

const TOP_N = 10;

export default function ProviderCoverageCharts({
  rankedProviders,
  source,
  searchQuery,
  onProviderClick,
  hasActiveFilters,
  onResetAllFilters,
  onScrollToResults,
}: {
  // Already deduped (one entry per provider id, even in "Both (Combined)"
  // source mode) and sorted descending by stats.totalMnos -- the page
  // computes this once and shares it with the "Quick Benchmark Shortcuts"
  // banner too, rather than each place re-deriving its own copy.
  rankedProviders: ProviderSummary[];
  source: ProviderStatsSource;
  // The page's own free-text search box (page.tsx's `q`) -- both charts
  // below already aggregate over `rankedProviders`, which the page itself
  // has already narrowed to whatever this term matches, so naming it in
  // each chart's own title/subtitle just makes explicit what's already
  // true of the data: a search for "China Mobile" isn't showing "all
  // providers" scoped down, it's effectively that one provider's own
  // profile, and the chart chrome should say so rather than leave the
  // reader to infer it from a single bar/row.
  searchQuery?: string;
  onProviderClick: (providerName: string) => void;
  // Whether ANY filter on the page is currently non-default -- drives the
  // round reset icon shown on each chart card's own header.
  hasActiveFilters: boolean;
  onResetAllFilters: () => void;
  // Scrolls the already-rendered results table into view immediately --
  // used by the "click to view details in the table below" footnote.
  onScrollToResults: () => void;
}) {
  const [expanded, setExpanded] = React.useState(true);
  const rankedByMnos = rankedProviders;
  const dedupedRows = rankedProviders;

  const topProvidersData = React.useMemo(
    () =>
      rankedByMnos.slice(0, TOP_N).map((p) => ({
        providerName: p.providerName,
        totalMnos: p.stats.totalMnos,
        totalCountries: p.stats.totalCountries,
      })),
    [rankedByMnos],
  );

  const serviceMixData = React.useMemo(() => {
    const totals = dedupedRows.reduce(
      (acc, p) => ({
        sccp: acc.sccp + p.stats.sccpCount,
        dsx: acc.dsx + p.stats.dsxCount,
        ipx: acc.ipx + p.stats.ipxCount,
      }),
      { sccp: 0, dsx: 0, ipx: 0 },
    );
    return [
      { service: "SCCP", label: "SCCP Relationships", count: totals.sccp },
      { service: "DSX", label: "DSX Relationships", count: totals.dsx },
      { service: "IPX", label: "IPX Relationships", count: totals.ipx },
    ];
  }, [dedupedRows]);

  const homeCarrierRank = rankedByMnos.findIndex((p) => p.providerName === HOME_CARRIER);
  const homeCarrierEntry = homeCarrierRank >= 0 ? rankedByMnos[homeCarrierRank] : null;

  const activeSearchTerm = searchQuery?.trim() || null;
  // A free-text search is a SUBSTRING match against provider names, so it
  // can genuinely match more than one distinct real provider (e.g.
  // searching "Orange" could match both "Orange France" and "Orange
  // International Carriers" -- two different companies, not a typo or bad
  // data). Both charts below always aggregate across every row currently in
  // `dedupedRows`, so when that's more than one provider, titling the chart
  // "— <search term>" as if it were that one provider's own number would be
  // actively wrong, not just imprecise -- the isSingleMatch/isMultiMatch
  // split below only uses the singular "this IS that provider's data"
  // phrasing when the search really did narrow to exactly one row.
  const matchCount = dedupedRows.length;
  const isSingleMatch = !!activeSearchTerm && matchCount === 1;
  const isMultiMatch = !!activeSearchTerm && matchCount > 1;
  const barChartTitle = isSingleMatch
    ? `Provider Footprint — ${activeSearchTerm}`
    : isMultiMatch
      ? `Top Providers Matching "${activeSearchTerm}" (${matchCount})`
      : "Top Providers by MNO Coverage";
  const serviceMixTitle = isSingleMatch
    ? `Service Coverage Mix — ${activeSearchTerm}`
    : isMultiMatch
      ? `Service Coverage Mix — ${matchCount} Providers Matching "${activeSearchTerm}"`
      : "Service Coverage Mix — All Providers";
  const serviceMixSubtitle = isSingleMatch
    ? `SCCP vs DSX vs IPX relationship breakdown for ${activeSearchTerm}`
    : isMultiMatch
      ? `SCCP vs DSX vs IPX relationships summed across ${matchCount} providers matching "${activeSearchTerm}" — not any single provider's own split`
      : "SCCP vs DSX vs IPX relationships across all listed providers";

  return (
    <Paper sx={{ mb: 3 }}>
      <Box
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5, cursor: "pointer" }}
        onClick={() => setExpanded((v) => !v)}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <ShowChartIcon sx={{ color: "#0A2540" }} />
          <Typography variant="subtitle1" fontWeight={700}>
            Provider Coverage Overview
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {SOURCE_SCOPE_LABEL[source]} footprint, current search scope
          </Typography>
        </Box>
        <IconButton size="small" onClick={(e) => e.stopPropagation()} onClickCapture={() => setExpanded((v) => !v)}>
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <Box sx={{ px: 2, pb: 2 }}>
          {dedupedRows.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
              No providers in the current search scope.
            </Typography>
          ) : (
            <>
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
                    Tata Comm Coverage Standing
                  </Typography>
                </Box>
                {homeCarrierEntry ? (
                  <>
                    <Chip size="small" label={`${homeCarrierEntry.stats.totalMnos} MNOs Covered`} sx={{ fontWeight: 700, bgcolor: "#fff" }} />
                    <Chip size="small" label={`${homeCarrierEntry.stats.totalCountries} Countries`} sx={{ fontWeight: 700, bgcolor: "#fff" }} />
                    <Chip size="small" label={`Rank #${homeCarrierRank + 1} of ${rankedByMnos.length}`} sx={{ fontWeight: 700, bgcolor: "#fff" }} />
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Tata Comm has no {SOURCE_SCOPE_LABEL[source]} footprint in the current search scope.
                  </Typography>
                )}
              </Box>

              <Grid container spacing={2} sx={{ mb: 1 }}>
                <Grid item xs={12} md={6}>
                  <Paper variant="outlined" sx={{ p: 1.5, height: "100%" }}>
                    <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ color: "#0A2540" }}>
                          {barChartTitle}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
                          {topProvidersData.length < rankedByMnos.length
                            ? `Top ${topProvidersData.length} of ${rankedByMnos.length} providers, ranked by total MNOs served`
                            : "Ranked by total MNOs served"}
                        </Typography>
                      </Box>
                      {hasActiveFilters && <ChartResetIconButton onReset={onResetAllFilters} />}
                    </Box>
                    <Box sx={{ position: "relative", minHeight: 320 }}>
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={topProvidersData} layout="vertical" margin={{ left: 8, right: 24 }}>
                          <XAxis type="number" hide />
                          <YAxis
                            type="category"
                            dataKey="providerName"
                            width={130}
                            // Bold + navy for the actively-searched provider's
                            // own row label -- everything else stays the
                            // plain default so only the one row the search
                            // narrowed to stands out, not the whole axis.
                            tick={(props: { x?: string | number; y?: string | number; payload?: { value: string } }) => {
                              const label = props.payload?.value ?? "";
                              const isActive = !!activeSearchTerm && label.toLowerCase() === activeSearchTerm.toLowerCase();
                              return (
                                <text
                                  x={props.x}
                                  y={props.y}
                                  dy={4}
                                  textAnchor="end"
                                  fontSize={isActive ? 12 : 11}
                                  fontWeight={isActive ? 800 : 400}
                                  fill={isActive ? "#0A2540" : "#5A6B7B"}
                                >
                                  {label}
                                </text>
                              );
                            }}
                          />
                          <RechartsTooltip
                            content={
                              <CustomTooltip
                                formatter={(p) => `${p.providerName}: ${p.totalMnos} MNOs across ${p.totalCountries} countries`}
                              />
                            }
                          />
                          <Bar
                            isAnimationActive={false}
                            dataKey="totalMnos"
                            cursor="pointer"
                            onClick={(d) => onProviderClick((d as unknown as { providerName: string }).providerName)}
                            radius={3}
                          >
                            {topProvidersData.map((d) => {
                              const isActive = !!activeSearchTerm && d.providerName.toLowerCase() === activeSearchTerm.toLowerCase();
                              return (
                                <Cell
                                  key={d.providerName}
                                  fill={d.providerName === HOME_CARRIER ? "#F59E0B" : colorForProvider(d.providerName)}
                                  stroke={isActive ? "#0A2540" : undefined}
                                  strokeWidth={isActive ? 2 : undefined}
                                />
                              );
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </Box>
                    {topProvidersData.length > 0 && (
                      <Box
                        onClick={onScrollToResults}
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 0.75,
                          mt: 1.5,
                          color: "#0284C7",
                          cursor: "pointer",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          "&:hover": { color: "#0369A1", textDecoration: "underline" },
                        }}
                      >
                        <ListAltOutlinedIcon fontSize="small" sx={{ fontSize: 16 }} />
                        <span>
                          Showing {rankedByMnos.length} provider{rankedByMnos.length === 1 ? "" : "s"} — click to view
                          details in the table below ↓
                        </span>
                      </Box>
                    )}
                  </Paper>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Paper variant="outlined" sx={{ p: 1.5, height: "100%" }}>
                    <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          <Typography variant="subtitle2" fontWeight={700} sx={{ color: "#0A2540" }}>
                            {serviceMixTitle}
                          </Typography>
                          <Tooltip title="Total provider-to-MNO relationships declared for each service, summed across every provider in the current search scope -- shows which service has the broadest wholesale coverage overall, not any single provider's own split.">
                            <InfoOutlinedIcon fontSize="small" sx={{ color: "text.disabled", fontSize: 16, cursor: "help" }} />
                          </Tooltip>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
                          {serviceMixSubtitle}
                        </Typography>
                      </Box>
                      {hasActiveFilters && <ChartResetIconButton onReset={onResetAllFilters} />}
                    </Box>
                    <Box sx={{ position: "relative", minHeight: 320 }}>
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={serviceMixData} layout="vertical" margin={{ left: 8, right: 24 }}>
                          <XAxis type="number" hide />
                          <YAxis type="category" dataKey="service" width={130} tick={{ fontSize: 11 }} />
                          <RechartsTooltip content={<CustomTooltip formatter={(p) => `${p.label}: ${p.count}`} />} />
                          <Bar isAnimationActive={false} dataKey="count" radius={3}>
                            {serviceMixData.map((d, i) => (
                              <Cell key={d.service} fill={["#0B6FBF", "#00A98A", "#EF6C00"][i]} />
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
    </Paper>
  );
}
