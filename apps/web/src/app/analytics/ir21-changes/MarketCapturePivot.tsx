"use client";

import * as React from "react";
import NextLink from "next/link";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import CloseIcon from "@mui/icons-material/Close";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingFlatIcon from "@mui/icons-material/TrendingFlat";
import BoltIcon from "@mui/icons-material/Bolt";
import type { Ir21RoutingChangeRow } from "@ccip/shared-types";
import { buildPivotData, PivotMigrationEntry, PivotProviderEntry, PivotTrend } from "@/lib/reports/pivotData";

const TREND_STYLE: Record<PivotTrend, { color: string; bg: string; icon: React.ReactNode }> = {
  "Capturing Market": { color: "#2E7D32", bg: "rgba(46,125,50,0.1)", icon: <TrendingUpIcon fontSize="small" /> },
  Defending: { color: "#5A6B7B", bg: "rgba(90,107,123,0.1)", icon: <TrendingFlatIcon fontSize="small" /> },
  "Losing Share": { color: "#C62828", bg: "rgba(198,40,40,0.1)", icon: <TrendingDownIcon fontSize="small" /> },
};

function formatAbsoluteDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short" });
  return `${day}-${month}-${d.getFullYear()}`;
}

/** Every row here already carries a real numeric mnoId (Ir21RoutingChangeRow
 * requires it, joined server-side off the same MnoMaster record the row's
 * TADIG came from) -- the TADIG-search fallback only guards a future data
 * shape that drops it, so a drill-down link is never a dead 404. */
function mnoProfileHref(m: PivotMigrationEntry): string {
  return m.mnoId ? `/search/mno/${m.mnoId}` : `/search/mno?q=${encodeURIComponent(m.tadigCode)}`;
}

/** Opens in a new tab rather than navigating the current one -- an
 * executive drilling into one migrated operator from this pivot shouldn't
 * lose the filtered pivot analysis they were just reading. */
function MnoDrillDownLink({
  migration,
  children,
  showIcon = true,
}: {
  migration: PivotMigrationEntry;
  children: React.ReactNode;
  showIcon?: boolean;
}) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <Tooltip title={`Open ${migration.mnoName} (${migration.tadigCode}) connectivity profile →`}>
      <Box
        component={NextLink}
        href={mnoProfileHref(migration)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        sx={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}
      >
        <Typography
          component="span"
          sx={{
            fontWeight: 600,
            fontSize: "inherit",
            color: "#0A2540",
            cursor: "pointer",
            "&:hover": { color: "#00838F", textDecoration: "underline" },
          }}
        >
          {children}
        </Typography>
        {showIcon && (
          <OpenInNewIcon sx={{ fontSize: 13, ml: 0.5, color: "#94A3B8", opacity: hovered ? 1 : 0, transition: "opacity 0.15s ease" }} />
        )}
      </Box>
    </Tooltip>
  );
}

function TrendBadge({ trend }: { trend: PivotTrend }) {
  const style = TREND_STYLE[trend];
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        py: 0.25,
        borderRadius: "999px",
        bgcolor: style.bg,
        color: style.color,
        fontWeight: 600,
        fontSize: 12,
      }}
    >
      {style.icon}
      {trend}
    </Box>
  );
}

function ProviderPivotRow({
  entry,
  selected,
  onSelect,
}: {
  entry: PivotProviderEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <>
      <TableRow
        hover
        onClick={onSelect}
        sx={{
          cursor: "pointer",
          "& > *": { borderBottom: expanded ? "none" : undefined },
          ...(selected && {
            bgcolor: "#E3F2FD",
            borderLeft: "4px solid #00D4B2",
            "& td:first-of-type": { pl: "12px !important" },
          }),
        }}
      >
        <TableCell sx={{ width: 40 }}>
          <IconButton
            size="small"
            onClick={(e) => {
              // Expanding/collapsing the migration detail tree is a
              // separate gesture from selecting the provider row for
              // chart cross-filtering -- stopPropagation keeps this click
              // from also bubbling into the TableRow's onSelect below.
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            aria-label={expanded ? `Collapse ${entry.providerName}` : `Expand ${entry.providerName}`}
            sx={{
              width: 22,
              height: 22,
              minWidth: 22,
              p: 0,
              borderRadius: "4px",
              border: "1px solid #CBD5E1",
              bgcolor: expanded ? "#0A2540" : "#FFFFFF",
              color: expanded ? "#FFFFFF" : "#0A2540",
              fontWeight: 700,
              fontSize: "0.82rem",
              lineHeight: 1,
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              transition: "all 0.15s ease",
              "&:hover": {
                bgcolor: expanded ? "#0F375E" : "#F1F5F9",
                borderColor: "#94A3B8",
                transform: "scale(1.06)",
              },
            }}
          >
            {expanded ? "−" : "+"}
          </IconButton>
        </TableCell>
        <TableCell sx={{ fontWeight: 700 }}>
          {entry.providerName}
          {selected && <Chip label="Selected" size="small" sx={{ ml: 1, height: 18, fontSize: 10, fontWeight: 700, bgcolor: "#00D4B2", color: "#0A2540" }} />}
        </TableCell>
        <TableCell>
          <Chip
            size="small"
            label={`${entry.net >= 0 ? "+" : ""}${entry.net} Net ${entry.net >= 0 ? "Gain" : "Loss"}`}
            sx={{
              fontWeight: 700,
              bgcolor: entry.net >= 0 ? "rgba(46,125,50,0.1)" : "rgba(198,40,40,0.1)",
              color: entry.net >= 0 ? "#2E7D32" : "#C62828",
            }}
          />
        </TableCell>
        <TableCell align="center" sx={{ color: "#2E7D32", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          +{entry.gains}
        </TableCell>
        <TableCell align="center" sx={{ color: "#C62828", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          -{entry.losses}
        </TableCell>
        <TableCell align="center" sx={{ fontVariantNumeric: "tabular-nums" }}>
          {entry.impactedMnoCount}
        </TableCell>
        <TableCell>
          <TrendBadge trend={entry.trend} />
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={7} sx={{ py: 0, borderBottom: expanded ? undefined : "none" }}>
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Box sx={{ my: 1.5, ml: 5, border: "1px solid #E1E6EB", borderRadius: 1, overflow: "hidden" }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ "& th": { bgcolor: "#F4F6F8", fontWeight: 700, fontSize: 12, color: "#5A6B7B" } }}>
                    <TableCell>Date</TableCell>
                    <TableCell>MNO / Customer Name</TableCell>
                    <TableCell>TADIG</TableCell>
                    <TableCell>Country</TableCell>
                    <TableCell>Service</TableCell>
                    <TableCell>Action</TableCell>
                    <TableCell>Displaced / Competing Carrier</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entry.migrations.map((m, i) => (
                    <TableRow key={i} hover onClick={(e) => e.stopPropagation()}>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{formatAbsoluteDate(m.date)}</TableCell>
                      <TableCell>
                        <MnoDrillDownLink migration={m}>{m.mnoName}</MnoDrillDownLink>
                      </TableCell>
                      <TableCell>
                        <MnoDrillDownLink migration={m} showIcon={false}>
                          {m.tadigCode}
                        </MnoDrillDownLink>
                      </TableCell>
                      <TableCell>{m.country}</TableCell>
                      <TableCell>{m.service}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={m.actionLabel}
                          sx={{
                            fontWeight: 600,
                            bgcolor: m.isGain ? "rgba(46,125,50,0.1)" : "rgba(198,40,40,0.1)",
                            color: m.isGain ? "#2E7D32" : "#C62828",
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ color: "text.secondary" }}>{m.detail}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

/** The page's central analytical driver -- embedded directly (not behind a
 * modal) so a reviewer sees carrier win/loss movement the moment the page
 * loads, and clicking any provider row cross-filters the Executive Market
 * Dynamics charts and the granular changes ledger below via the same
 * `provider` selection those already react to (see Ir21ChangesPage's
 * onSelectProvider/onClearSelection wiring). */
export default function MarketCapturePivot({
  rows,
  loading,
  scopeLabel,
  serviceFilter,
  onClearServiceFilter,
  selectedProviderId,
  onSelectProvider,
  onClearSelection,
}: {
  rows: Ir21RoutingChangeRow[];
  loading: boolean;
  // Date range + Region only -- the active Service pill is rendered as its
  // own interactive/removable piece right after this (see below), rather
  // than baked into the string, so it can carry a click-to-clear affordance
  // the plain "Scope: ..." sentence never could.
  scopeLabel: string;
  serviceFilter: string;
  onClearServiceFilter: () => void;
  selectedProviderId: number | null;
  onSelectProvider: (providerId: number, providerName: string) => void;
  onClearSelection: () => void;
}) {
  const pivotData = React.useMemo(() => buildPivotData(rows), [rows]);
  const [exporting, setExporting] = React.useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { generatePivotExcelReport } = await import("@/lib/reports/pivotExcelReport");
      await generatePivotExcelReport({
        generatedAt: new Date(),
        scopeLabel: `${scopeLabel} | ${serviceFilter || "All Services"}`,
        pivotData,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Paper elevation={2} sx={{ mb: 3, border: "1px solid #E2E8F0" }}>
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "stretch", sm: "flex-start" },
          justifyContent: "space-between",
          gap: 1.5,
          p: 2,
          borderBottom: "1px solid #E2E8F0",
        }}
      >
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <BoltIcon sx={{ color: "#00D4B2" }} />
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: { xs: "1.05rem", sm: "1.25rem" } }}>
              Wholesale Carrier Market Capture &amp; Churn Pivot
            </Typography>
            {selectedProviderId !== null && (
              <Button size="small" startIcon={<CloseIcon fontSize="small" />} onClick={onClearSelection} sx={{ color: "#0A2540" }}>
                Clear Selection
              </Button>
            )}
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
            <Typography variant="body2" color="text.secondary">
              Scope: {scopeLabel} |
            </Typography>
            {serviceFilter ? (
              <Chip
                label={`${serviceFilter} ✕`}
                size="small"
                onClick={onClearServiceFilter}
                sx={{
                  height: 20,
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  bgcolor: "#E2E8F0",
                  cursor: "pointer",
                  "&:hover": { bgcolor: "#CBD5E1" },
                }}
              />
            ) : (
              <Typography variant="body2" color="text.secondary">
                All Services
              </Typography>
            )}
          </Box>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0, justifyContent: { xs: "space-between", sm: "flex-end" } }}>
          <Button
            variant="contained"
            size="small"
            disabled={exporting || pivotData.length === 0}
            startIcon={exporting ? <CircularProgress size={14} sx={{ color: "#fff" }} /> : <DownloadIcon fontSize="small" />}
            onClick={handleExport}
            sx={{ bgcolor: "#0A2540", "&:hover": { bgcolor: "#0A2540", boxShadow: 3 } }}
          >
            {exporting ? "Exporting…" : "Export Pivot to Excel (.xlsx)"}
          </Button>
        </Box>
      </Box>
      {loading ? (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 8 }}>
          <CircularProgress size={28} />
        </Box>
      ) : pivotData.length === 0 ? (
        <Box sx={{ p: 5, textAlign: "center" }}>
          <Typography variant="body1" fontWeight={600} sx={{ mb: 0.5 }}>
            No carrier gain/loss events in this scope
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Widen the Timeframe or Region in the Master Filter Bar to see carrier movement.
          </Typography>
        </Box>
      ) : (
        <>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              mx: 2,
              mt: 1.5,
              mb: 0.5,
              px: 1.5,
              py: 0.6,
              bgcolor: "#F8FAFC",
              border: "1px dashed #CBD5E1",
              borderRadius: "6px",
            }}
          >
            <InfoOutlinedIcon sx={{ fontSize: 16, color: "#0284C7" }} />
            <Typography sx={{ color: "#475569", fontSize: "0.78rem", fontWeight: 500 }}>
              <strong>Interactive Matrix:</strong> Click any carrier row to cross-filter the <strong>Executive Market Dynamics</strong>{" "}
              charts below. Use <strong>[+]</strong> to expand and <strong>[−]</strong> to collapse account migration details.
            </Typography>
          </Box>
        <TableContainer sx={{ maxHeight: "55vh" }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow sx={{ "& th": { bgcolor: "#0A2540", color: "#fff", fontWeight: 700 } }}>
                <TableCell sx={{ width: 40, bgcolor: "#0A2540 !important" }} />
                <TableCell sx={{ bgcolor: "#0A2540 !important", color: "#fff !important" }}>Wholesale Provider</TableCell>
                <TableCell sx={{ bgcolor: "#0A2540 !important", color: "#fff !important" }}>Net Movement</TableCell>
                <TableCell align="center" sx={{ bgcolor: "#0A2540 !important", color: "#fff !important" }}>
                  Service Gains (+)
                </TableCell>
                <TableCell align="center" sx={{ bgcolor: "#0A2540 !important", color: "#fff !important" }}>
                  Service Losses (-)
                </TableCell>
                <TableCell align="center" sx={{ bgcolor: "#0A2540 !important", color: "#fff !important" }}>
                  Impacted MNOs / Custs
                </TableCell>
                <TableCell sx={{ bgcolor: "#0A2540 !important", color: "#fff !important" }}>Market Share Trend</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pivotData.map((entry) => (
                <ProviderPivotRow
                  key={entry.providerId}
                  entry={entry}
                  selected={entry.providerId === selectedProviderId}
                  onSelect={() =>
                    entry.providerId === selectedProviderId ? onClearSelection() : onSelectProvider(entry.providerId, entry.providerName)
                  }
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        </>
      )}
    </Paper>
  );
}
