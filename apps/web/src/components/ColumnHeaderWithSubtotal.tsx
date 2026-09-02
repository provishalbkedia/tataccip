"use client";

import * as React from "react";
import { Box, Chip } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import type { IHeaderParams } from "ag-grid-community";
import InfoTooltip from "./InfoTooltip";

interface ColumnHeaderWithSubtotalProps extends IHeaderParams {
  // Distinct-entity count for whatever this column represents, computed
  // by the page from its own currently-filtered rows (not fetched here) --
  // passed in fresh on every render via headerComponentParams, so it stays
  // live with zero extra AG Grid wiring: a filter change re-renders the
  // page, which passes a new columnDefs array (and therefore new
  // headerComponentParams) down to the grid.
  subtotal: number;
  // Used in the chip's own tooltip -- "Unique [entityLabel] count across
  // current filtered results".
  entityLabel: string;
  // Optional info-icon tooltip alongside the title, same as the existing
  // plain TooltipColumnHeader pattern elsewhere in this codebase.
  infoTooltip?: string;
}

/** AG Grid headerComponent: title + subtotal count chip, with sort
 * indicator/click-to-sort re-implemented manually. A custom headerComponent
 * replaces AG Grid's entire default header renderer, which would otherwise
 * silently drop the sort arrow and click-to-sort behavior on every column
 * this is attached to -- re-subscribing to the column's own "sortChanged"
 * event (AG Grid's documented pattern for this exact case) keeps that
 * working instead of quietly regressing columns that already sort today.
 * Layout gives the title `flex: 1` so it's the first thing to give up space
 * (ellipsizing) at a narrow column width; the chip, sort arrow, and info
 * icon all stay `flexShrink: 0` so they're never squeezed out -- and none
 * of this touches AG Grid's own resize-handle strip, which is a separate
 * sibling element outside whatever a headerComponent renders. */
export default function ColumnHeaderWithSubtotal(props: ColumnHeaderWithSubtotalProps) {
  const [sortDirection, setSortDirection] = React.useState(props.column.getSort());

  React.useEffect(() => {
    const listener = () => setSortDirection(props.column.getSort());
    props.column.addEventListener("sortChanged", listener);
    return () => props.column.removeEventListener("sortChanged", listener);
  }, [props.column]);

  const sortable = props.column.getColDef().sortable !== false;

  return (
    <Box
      sx={{ display: "flex", alignItems: "center", gap: 0.5, width: "100%", minWidth: 0, cursor: sortable ? "pointer" : "default" }}
      onClick={sortable ? (e: React.MouseEvent) => props.progressSort(e.shiftKey) : undefined}
    >
      <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {props.displayName}
      </Box>
      {sortDirection === "asc" && <ArrowUpwardIcon sx={{ fontSize: 14, flexShrink: 0, color: "text.secondary" }} />}
      {sortDirection === "desc" && <ArrowDownwardIcon sx={{ fontSize: 14, flexShrink: 0, color: "text.secondary" }} />}
      <InfoTooltip title={`Unique ${props.entityLabel} count across current filtered results`}>
        <Chip
          label={props.subtotal}
          size="small"
          sx={{
            backgroundColor: "#0A2540",
            color: "#E0E6ED",
            fontSize: "0.72rem",
            fontWeight: 600,
            height: 18,
            borderRadius: "4px",
            flexShrink: 0,
            "& .MuiChip-label": { px: 0.75 },
          }}
        />
      </InfoTooltip>
      {props.infoTooltip && (
        <InfoTooltip title={props.infoTooltip} onClick={(e) => e.stopPropagation()}>
          <InfoOutlinedIcon fontSize="small" sx={{ color: "text.disabled", fontSize: 15, flexShrink: 0 }} />
        </InfoTooltip>
      )}
    </Box>
  );
}
