"use client";

import * as React from "react";
import Link from "next/link";
import { Alert, Box, Button, Card, CardContent, Chip, Grid, Skeleton, Tooltip, Typography } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import CellTowerIcon from "@mui/icons-material/CellTower";
import BusinessIcon from "@mui/icons-material/Business";
import HubIcon from "@mui/icons-material/Hub";
import RouterIcon from "@mui/icons-material/Router";
import LanIcon from "@mui/icons-material/Lan";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import RuleIcon from "@mui/icons-material/Rule";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import ActiveBaselineBanner from "@/components/ActiveBaselineBanner";
import VideoModal from "@/components/VideoModal";
import { api, ApiError } from "@/lib/api";
import { BRIEF_VIDEO, MASTERCLASS_VIDEO, type VideoAsset } from "@/lib/videos";
import { DashboardMetrics } from "@ccip/shared-types";

function StatTile({
  label,
  value,
  icon,
  color,
  href,
  tooltip,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  href?: string;
  tooltip: string;
}) {
  const card = (
    <Card
      sx={{
        height: "100%",
        borderTop: 4,
        borderColor: color,
        ...(href && {
          cursor: "pointer",
          transition: "transform 0.15s ease, box-shadow 0.15s ease",
          "&:hover": { transform: "translateY(-2px)", boxShadow: 3 },
        }),
      }}
    >
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Typography variant="overline" color="text.secondary">
                {label}
              </Typography>
              <Tooltip title={tooltip} arrow placement="top">
                <HelpOutlineIcon sx={{ fontSize: 15, color: "text.disabled", cursor: "help" }} />
              </Tooltip>
            </Box>
            <Typography variant="h4" fontWeight={700}>
              {value.toLocaleString()}
            </Typography>
          </Box>
          <Box sx={{ color, opacity: 0.8 }}>{icon}</Box>
        </Box>
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}>
      {card}
    </Link>
  ) : (
    card
  );
}

export default function DashboardPage() {
  const [metrics, setMetrics] = React.useState<DashboardMetrics | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [activeVideo, setActiveVideo] = React.useState<VideoAsset | null>(null);

  React.useEffect(() => {
    api
      .get<DashboardMetrics>("/dashboard/metrics")
      .then(setMetrics)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load metrics"));
  }, []);

  return (
    <RequireAuth>
      <AppShell>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
          Dashboard
        </Typography>
        <ActiveBaselineBanner />

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 1.5,
            mb: 3,
            p: 2,
            bgcolor: "#F4F6F8",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
          }}
        >
          <Typography variant="body2" fontWeight={600} sx={{ mr: 0.5 }}>
            New here?
          </Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={<PlayCircleOutlineIcon />}
            onClick={() => setActiveVideo(BRIEF_VIDEO)}
            sx={{ bgcolor: "#0A2540", "&:hover": { bgcolor: "#061A2E" } }}
          >
            Watch Quick Intro (80s)
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<SchoolOutlinedIcon />}
            onClick={() => setActiveVideo(MASTERCLASS_VIDEO)}
            sx={{ borderColor: "#00D4B2", color: "#0A2540", "&:hover": { borderColor: "#00A896", bgcolor: "rgba(0,212,178,0.08)" } }}
          >
            Platform Deep-Dive (7m)
          </Button>
          <Link href="/help" style={{ marginLeft: "auto", fontSize: "0.875rem", color: "#0B6FBF", textDecoration: "none" }}>
            View complete written documentation in Platform Guide &amp; Help →
          </Link>
        </Box>

        <VideoModal video={activeVideo} onClose={() => setActiveVideo(null)} />

        {metrics && (
          <Chip
            icon={<InfoOutlinedIcon fontSize="small" />}
            label={`Derived from ${metrics.totalMnos.toLocaleString()} IR.21-declared operator records — the platform's authoritative source of truth. ${metrics.reachlistOnlyMnoCount.toLocaleString()} legacy TADIGs were auto-created from Reach List uploads before MNO normalization was enforced; ${metrics.pendingMnoNormalizationCount.toLocaleString()} newer Reach List rows are queued for admin review instead of being auto-created. Informational use only.`}
            size="small"
            variant="outlined"
            sx={{ mb: 3, color: "text.secondary", borderColor: "divider" }}
          />
        )}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Grid container spacing={2}>
          {!metrics
            ? Array.from({ length: 7 }).map((_, i) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={i}>
                  <Skeleton variant="rounded" height={110} />
                </Grid>
              ))
            : [
            {
              label: "Total MNOs",
              key: "totalMnos" as const,
              icon: <CellTowerIcon fontSize="large" />,
              color: "#0A2540",
              href: "/search/mno",
              tooltip: `MNOs / Customers with a full, authoritative GSMA IR.21 declaration on file — the platform's source of truth for MNO count. ${metrics.reachlistOnlyMnoCount.toLocaleString()} legacy TADIGs were auto-created from Reach List uploads before MNO normalization was enforced (kept as-is, not retroactively removed). Reach List ingestion no longer creates a new MNO automatically — an unmatched row is now queued under "Unresolved Reach List Aliases" for admin review instead.`,
            },
            {
              label: "Total Providers",
              key: "totalProviders" as const,
              icon: <BusinessIcon fontSize="large" />,
              color: "#0B6FBF",
              href: "/search/provider",
              tooltip: "Wholesale/IPX providers that actually back at least one live SCCP, DSX, or IPX relationship — not a raw row count, so old unresolved provider-name fragments from historical uploads don't inflate this number.",
            },
            {
              label: "Total Connections",
              key: "totalConnections" as const,
              icon: <HubIcon fontSize="large" />,
              color: "#2E7D32",
              href: "/search/mno",
              tooltip: "Total individual (MNO/Cust, Provider, Service) routing relationships declared and authenticated in the active GSMA IR.21 dataset across SCCP, DSX, and IPX.",
            },
            {
              label: "SCCP Relationships",
              key: "sccpCount" as const,
              icon: <RouterIcon fontSize="large" />,
              color: "#0B6FBF",
              href: "/search/mno?service=SCCP&hasProvider=true",
              tooltip: "Total signaling (SS7 / SCCP) carrier relationships declared across all active IR.21 MNO profiles (including primary and secondary gateway routes). Click to view all MNOs with declared SCCP routing.",
            },
            {
              label: "DSX Relationships",
              key: "dsxCount" as const,
              icon: <LanIcon fontSize="large" />,
              color: "#0B6FBF",
              href: "/search/mno?service=DSX&hasProvider=true",
              tooltip: "Total LTE Diameter Edge Agent (DSX / Diameter) routing relationships declared in IR.21 Section 20. Click to view all MNOs with declared DSX / Diameter routing.",
            },
            {
              label: "IPX Relationships",
              key: "ipxCount" as const,
              icon: <SwapHorizIcon fontSize="large" />,
              color: "#0B6FBF",
              href: "/search/mno?service=IPX&hasProvider=true",
              tooltip: "Total Data Roaming (GRX / IPX) provider relationships declared in IR.21 Section 17. Click to view all MNOs with declared IPX data roaming.",
            },
            {
              label: "Unresolved Reach List Aliases",
              key: "pendingMnoNormalizationCount" as const,
              icon: <RuleIcon fontSize="large" />,
              color: "#EF6C00",
              href: "/admin/mno-normalization",
              tooltip: "Reach List rows whose operator/TADIG didn't match an existing IR.21 MNO by exact TADIG or a confident name match. Reach List ingestion no longer auto-creates a new MNO for these — an admin needs to map each one to the right existing operator (or confirm it's genuinely new and needs its own IR.21 upload).",
            },
              ].map((tile) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={tile.key}>
                  <StatTile label={tile.label} value={metrics[tile.key]} icon={tile.icon} color={tile.color} href={tile.href} tooltip={tile.tooltip} />
                </Grid>
              ))}
        </Grid>
      </AppShell>
    </RequireAuth>
  );
}
