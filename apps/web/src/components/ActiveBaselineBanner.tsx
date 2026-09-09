"use client";

import * as React from "react";
import { Box, Chip, Typography } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { api } from "@/lib/api";
import { ActiveBaselineInfo } from "@ccip/shared-types";

function formatUploadTimestamp(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "UTC" });
  return `${date} at ${time} UTC`;
}

/** "Active IR.21 Baseline" status ribbon -- shown on the Admin Menu and
 * Dashboard. Only meaningful once someone has used "Replace Active
 * Dataset" at least once; before that there's no single baseline upload
 * to point to (data has only ever been incrementally upserted), so this
 * renders nothing rather than a misleading placeholder. Kept as a slim
 * single-line ribbon rather than a stacked alert box so it doesn't push
 * the KPI tiles below the fold. */
export default function ActiveBaselineBanner() {
  const [info, setInfo] = React.useState<ActiveBaselineInfo | null>(null);

  React.useEffect(() => {
    api.get<ActiveBaselineInfo>("/upload/active-baseline").then(setInfo).catch(() => {});
  }, []);

  if (!info?.active) return null;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 1,
        bgcolor: "#F0F9FF",
        border: "1px solid #BAE6FD",
        borderRadius: "8px",
        px: 2,
        py: 0.85,
        mb: 2,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.2 }}>
        <CheckCircleOutlineIcon sx={{ fontSize: 18, color: "#0284C7" }} />
        <Typography sx={{ color: "#0369A1", fontSize: "0.82rem", fontWeight: 500 }}>
          Market baseline populated from official GSMA IR.21 records uploaded on{" "}
          <strong>{formatUploadTimestamp(info.active.uploadTime)}</strong> covering{" "}
          <strong>{info.currentMnoCount.toLocaleString()} MNOs</strong>.
        </Typography>
      </Box>
      <Chip
        label="Live Verified Baseline"
        size="small"
        sx={{
          bgcolor: "#E0F2FE",
          color: "#0284C7",
          border: "1px solid #7DD3FC",
          fontSize: "0.7rem",
          fontWeight: 700,
          height: 20,
        }}
      />
    </Box>
  );
}
