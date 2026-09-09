"use client";

import * as React from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

/** Cross-dataset recovery prompt -- shown when an MNO / Cust search comes
 * back empty under the default "IR.21 Verified" scope, but the same term
 * does match something once Reach List records are included. A real
 * operator can be declared only commercially (never filed an official IR.21
 * XML), so "0 results" here doesn't always mean "not on this platform" --
 * it can just mean "not in this particular scope", which the plain empty
 * grid gave no way to tell apart. */
export default function ReachListFallbackDialog({
  open,
  mnoQuery,
  matchCount,
  onClose,
  onSwitchToCombinedScope,
}: {
  open: boolean;
  mnoQuery: string;
  matchCount: number;
  onClose: () => void;
  onSwitchToCombinedScope: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: "12px", border: "1px solid #E2E8F0", p: 1 } }}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, fontWeight: 700, color: "#0A2540" }}>
        <InfoOutlinedIcon sx={{ color: "#0284C7", fontSize: 26 }} />
        MNO Not Declared in IR.21 Database
      </DialogTitle>

      <DialogContent>
        <Typography variant="body1" sx={{ color: "#334155", mb: 2 }}>
          The operator <strong>&quot;{mnoQuery}&quot;</strong> is not declared in the official <strong>GSMA IR.21</strong> database
          uploaded to this platform.
        </Typography>

        <Box sx={{ bgcolor: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: "8px", p: 2, mb: 1 }}>
          <Typography variant="body2" sx={{ color: "#0369A1", fontWeight: 500 }}>
            💡 <strong>Suggested action:</strong> {matchCount} matching record{matchCount === 1 ? "" : "s"} found under{" "}
            <strong>All MNOs (IR.21 + Reach List)</strong> — switch scope to see commercial wholesale reachability data for
            this operator.
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3, pt: 1, gap: 1 }}>
        <Button variant="outlined" onClick={onClose} sx={{ borderColor: "#CBD5E1", color: "#64748B" }}>
          Dismiss
        </Button>
        <Button
          variant="contained"
          onClick={onSwitchToCombinedScope}
          sx={{ bgcolor: "#0A2540", color: "#FFFFFF", fontWeight: 600, "&:hover": { bgcolor: "#0F375E" } }}
        >
          Switch to All MNOs (IR.21 + Reach List) →
        </Button>
      </DialogActions>
    </Dialog>
  );
}
