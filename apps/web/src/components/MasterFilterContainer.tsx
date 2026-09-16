"use client";

import * as React from "react";
import { Box, Button, Typography } from "@mui/material";
import TuneIcon from "@mui/icons-material/Tune";
import RestartAltIcon from "@mui/icons-material/RestartAlt";

/** Standardized "master scope" frame for the handful of page-wide filters
 * (Dataset Scope/Timeframe, Region, Service) shared across MNO Search,
 * Provider Search, and Market Intelligence -- visually separates these
 * global scoping controls from each page's own secondary/ad-hoc filters
 * (free-text search, Wholesale Provider, TADIG, Country), and surfaces a
 * plain-language summary of the active scope plus a reset limited to just
 * these dimensions. Deliberately distinct from each page's own existing
 * "Reset Filters"/"Reset All Filters" button, which clears everything
 * (search term, provider drill-down, change-type, etc.) -- resetting the
 * master scope alone shouldn't also throw away an in-progress search. */
export default function MasterFilterContainer({
  children,
  activeScopeSummary,
  isFiltered,
  onResetMasterFilters,
}: {
  children: React.ReactNode;
  activeScopeSummary: string;
  isFiltered: boolean;
  onResetMasterFilters: () => void;
}) {
  return (
    <Box
      sx={{
        position: "relative",
        mt: 2,
        pt: 2.5,
        pb: 1.5,
        px: 2,
        border: "1.5px solid",
        borderColor: isFiltered ? "#0284C7" : "#CBD5E1",
        borderRadius: "10px",
        bgcolor: isFiltered ? "#F0F9FF" : "#FFFFFF",
        boxShadow: isFiltered ? "0 2px 8px rgba(2,132,199,0.08)" : "none",
        transition: "border-color 0.2s ease-in-out, background-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          top: -12,
          left: 16,
          display: "inline-flex",
          alignItems: "center",
          gap: 0.75,
          px: 1.25,
          py: 0.25,
          borderRadius: "999px",
          bgcolor: isFiltered ? "#0A2540" : "#FFFFFF",
          border: "1px solid",
          borderColor: isFiltered ? "#0A2540" : "#E2E8F0",
          color: isFiltered ? "#FFFFFF" : "#475569",
          fontSize: "0.72rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
        }}
      >
        <TuneIcon sx={{ fontSize: 14 }} />
        <span>Master Filters</span>
        {isFiltered && <Box component="span" sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "#00D4B2" }} />}
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>{children}</Box>

      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          mt: 1.5,
          pt: 1,
          borderTop: "1px solid",
          borderColor: isFiltered ? "#E0F2FE" : "#F1F5F9",
        }}
      >
        <Typography variant="caption" sx={{ color: isFiltered ? "#0369A1" : "#64748B", fontWeight: isFiltered ? 600 : 500 }}>
          <strong>{isFiltered ? "Active Master Scope" : "Master Scope"}:</strong> {activeScopeSummary}
        </Typography>
        {isFiltered && (
          <Button
            size="small"
            startIcon={<RestartAltIcon sx={{ fontSize: 15 }} />}
            onClick={onResetMasterFilters}
            sx={{
              height: 24,
              fontSize: "0.72rem",
              fontWeight: 700,
              color: "#DC2626",
              textTransform: "none",
              "&:hover": { bgcolor: "#FEF2F2" },
            }}
          >
            Reset Master Filters
          </Button>
        )}
      </Box>
    </Box>
  );
}
