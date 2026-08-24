"use client";

import * as React from "react";
import Link from "next/link";
import { Alert, Box, Card, CardContent, Grid, Skeleton, Typography } from "@mui/material";
import CellTowerIcon from "@mui/icons-material/CellTower";
import BusinessIcon from "@mui/icons-material/Business";
import HubIcon from "@mui/icons-material/Hub";
import RouterIcon from "@mui/icons-material/Router";
import LanIcon from "@mui/icons-material/Lan";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import ActiveBaselineBanner from "@/components/ActiveBaselineBanner";
import { api, ApiError } from "@/lib/api";
import { DashboardMetrics } from "@ccip/shared-types";

function StatTile({
  label,
  value,
  icon,
  color,
  href,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  href?: string;
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
      title={href ? "Click to explore..." : undefined}
    >
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Box>
            <Typography variant="overline" color="text.secondary">
              {label}
            </Typography>
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
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Grid container spacing={2}>
          {[
            { label: "Total MNOs", key: "totalMnos" as const, icon: <CellTowerIcon fontSize="large" />, color: "#0A2540", href: "/search/mno" },
            { label: "Total Providers", key: "totalProviders" as const, icon: <BusinessIcon fontSize="large" />, color: "#0B6FBF", href: "/search/provider" },
            { label: "Total Connections", key: "totalConnections" as const, icon: <HubIcon fontSize="large" />, color: "#2E7D32", href: "/search/mno" },
            { label: "SCCP Relationships", key: "sccpCount" as const, icon: <RouterIcon fontSize="large" />, color: "#0B6FBF", href: "/search/provider?service=SCCP&source=IR21" },
            { label: "DSX Relationships", key: "dsxCount" as const, icon: <LanIcon fontSize="large" />, color: "#0B6FBF", href: "/search/provider?service=DSX&source=IR21" },
            { label: "IPX Relationships", key: "ipxCount" as const, icon: <SwapHorizIcon fontSize="large" />, color: "#0B6FBF", href: "/search/provider?service=IPX&source=IR21" },
          ].map((tile) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={tile.key}>
              {metrics ? (
                <StatTile label={tile.label} value={metrics[tile.key]} icon={tile.icon} color={tile.color} href={tile.href} />
              ) : (
                <Skeleton variant="rounded" height={110} />
              )}
            </Grid>
          ))}
        </Grid>
      </AppShell>
    </RequireAuth>
  );
}
