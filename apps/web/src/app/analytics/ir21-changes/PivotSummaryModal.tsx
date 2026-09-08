"use client";

import * as React from "react";
import NextLink from "next/link";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import DownloadIcon from "@mui/icons-material/Download";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingFlatIcon from "@mui/icons-material/TrendingFlat";
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

function ProviderPivotRow({ entry }: { entry: PivotProviderEntry }) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <>
      <TableRow hover sx={{ "& > *": { borderBottom: expanded ? "none" : undefined } }}>
        <TableCell sx={{ width: 40 }}>
          <IconButton size="small" onClick={() => setExpanded((v) => !v)} aria-label={expanded ? "Collapse" : "Expand"}>
            {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell sx={{ fontWeight: 700 }}>{entry.providerName}</TableCell>
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
                    <TableRow key={i} hover>
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

export default function PivotSummaryModal({
  open,
  onClose,
  rows,
  loading,
  scopeLabel,
}: {
  open: boolean;
  onClose: () => void;
  rows: Ir21RoutingChangeRow[];
  loading: boolean;
  scopeLabel: string;
}) {
  const pivotData = React.useMemo(() => buildPivotData(rows), [rows]);
  const [exporting, setExporting] = React.useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { generatePivotExcelReport } = await import("@/lib/reports/pivotExcelReport");
      await generatePivotExcelReport({ generatedAt: new Date(), scopeLabel, pivotData });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "stretch", sm: "flex-start" },
          justifyContent: "space-between",
          gap: 1.5,
          pb: 1,
        }}
      >
        <Box>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: { xs: "1.05rem", sm: "1.25rem" } }}>
            Wholesale Carrier Market Capture &amp; Churn Pivot
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Scope: {scopeLabel}
          </Typography>
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
          <IconButton onClick={onClose} aria-label="Close">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
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
          <TableContainer sx={{ maxHeight: "60vh" }}>
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
                  <ProviderPivotRow key={entry.providerId} entry={entry} />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
    </Dialog>
  );
}
