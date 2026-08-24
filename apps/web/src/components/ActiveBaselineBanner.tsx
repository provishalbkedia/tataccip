"use client";

import * as React from "react";
import { Alert, AlertTitle } from "@mui/material";
import { api } from "@/lib/api";
import { ActiveBaselineInfo } from "@ccip/shared-types";

/** "Active IR.21 Baseline" status badge — shown on the Admin Menu and
 * Dashboard. Only meaningful once someone has used "Replace Active
 * Dataset" at least once; before that there's no single baseline upload
 * to point to (data has only ever been incrementally upserted), so this
 * renders nothing rather than a misleading placeholder. */
export default function ActiveBaselineBanner() {
  const [info, setInfo] = React.useState<ActiveBaselineInfo | null>(null);

  React.useEffect(() => {
    api.get<ActiveBaselineInfo>("/upload/active-baseline").then(setInfo).catch(() => {});
  }, []);

  if (!info?.active) return null;

  return (
    <Alert severity="info" sx={{ mb: 3 }}>
      <AlertTitle>Active IR.21 Baseline</AlertTitle>
      <strong>{info.active.filename}</strong> — Uploaded:{" "}
      {new Date(info.active.uploadTime).toLocaleString()} — {info.currentMnoCount} MNOs
    </Alert>
  );
}
