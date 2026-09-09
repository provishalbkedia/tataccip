"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Box, ButtonBase, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

/** Standardized back-navigation bar for sub-pages, profile views, and
 * deep-dive routes -- pairs a "go back" affordance with a citation of the
 * dataset backing the page, so a reader who lands mid-drill-down (e.g. from
 * a Pivot table link opened in a new tab) can see at a glance where the
 * numbers on screen come from without hunting for it elsewhere. */
export default function BackNavBar({
  label = "BACK TO PREVIOUS VIEW",
  citation = "Authoritative Dataset: GSMA RAEX IR.21 Standard Registry",
  onBack,
  right,
}: {
  label?: string;
  citation?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: "column", sm: "row" },
        alignItems: { xs: "stretch", sm: "center" },
        justifyContent: "space-between",
        gap: 1,
        mb: 2,
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "flex-start", sm: "center" },
          gap: { xs: 0.25, sm: 1.5 },
        }}
      >
        <ButtonBase
          onClick={onBack ?? (() => router.back())}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.75,
            fontWeight: 600,
            fontSize: "0.85rem",
            color: "#0A2540",
            px: 0.5,
            py: 0.25,
            borderRadius: 1,
            "&:hover": { color: "#00838F", bgcolor: "rgba(0,131,143,0.06)" },
          }}
        >
          <ArrowBackIcon sx={{ fontSize: 16 }} />
          {label}
        </ButtonBase>
        <Typography variant="caption" sx={{ color: "#64748B", fontStyle: "italic", fontSize: "0.75rem" }}>
          {citation}
        </Typography>
      </Box>
      {right}
    </Box>
  );
}
