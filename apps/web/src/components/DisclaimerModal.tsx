"use client";

import * as React from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import GavelIcon from "@mui/icons-material/Gavel";

const CLAUSES: { title: string; body: string }[] = [
  {
    title: "1. Nature of Data",
    body: "CCIP (Connectivity Coverage Intelligence Platform) is an analytical intelligence tool designed to cross-reference and visualize GSMA IR.21 XML declarations and wholesale carrier reach lists.",
  },
  {
    title: "2. No Operational Warranty",
    body: 'All data, interconnect mappings, and coverage matrices are provided strictly on an "as-is" and "as-available" basis for informational and market intelligence purposes. While the platform performs automated normalization and alias deduplication, it does not guarantee 100% real-time accuracy, completeness, or commercial validity of third-party submissions.',
  },
  {
    title: "3. Official Reference",
    body: "Information displayed within this tool does not replace or supersede binding bilateral Roaming Agreements, official GSMA IREG/TADIG end-to-end test sheets, or live network routing tables.",
  },
  {
    title: "4. Limitation of Liability",
    body: "Developers, contributors, and platform administrators accept no liability for commercial decisions, routing choices, financial commitments, or service disruptions resulting from the interpretation or use of data provided by this platform.",
  },
  {
    title: "5. Proprietary Notice",
    body: "GSMA IR.21 documents and TADIG codes remain the property and standard format of their respective operators and the GSMA.",
  },
];

export default function DisclaimerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <GavelIcon color="primary" fontSize="small" />
        Platform Data Disclaimer &amp; Terms of Reference
      </DialogTitle>
      <DialogContent dividers>
        {CLAUSES.map((c) => (
          <Box key={c.title} sx={{ mb: 2, "&:last-child": { mb: 0 } }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
              {c.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {c.body}
            </Typography>
          </Box>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained" sx={{ minHeight: 44 }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
