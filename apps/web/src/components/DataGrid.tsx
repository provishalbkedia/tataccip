"use client";

import * as React from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ColGroupDef, RowSelectionOptions } from "ag-grid-community";
import { Box, Button, IconButton, MenuItem, Select, Typography, useMediaQuery } from "@mui/material";
import type { Theme } from "@mui/material/styles";
import DownloadIcon from "@mui/icons-material/Download";
import FirstPageIcon from "@mui/icons-material/FirstPage";
import LastPageIcon from "@mui/icons-material/LastPage";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

// Not a real page size — "All" is implemented by setting the grid's actual
// page size to the current row count, since AG Grid has no native
// "unlimited" pagination mode.
const ALL_SENTINEL = -1;

interface PageInfo {
  page: number;
  totalPages: number;
  pageSize: number;
  rowCount: number;
}

/** Our own pagination bar, rendered above AND below the grid (mirroring
 * both bars against the same grid API keeps them in sync automatically).
 * AG Grid's own built-in bottom panel is suppressed via CSS in favor of
 * this — its native panel isn't responsive and wraps/overflows badly
 * below ~400px viewports (empty-looking page-size <select>, "of NNN"
 * text wrapping mid-number). */
function PaginationBar({
  pageInfo,
  onFirst,
  onPrev,
  onNext,
  onLast,
  onPageSizeChange,
  isAllSelected,
  renderRowCount,
}: {
  pageInfo: PageInfo;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
  onPageSizeChange: (value: number) => void;
  isAllSelected: boolean;
  renderRowCount?: (rowCount: number) => React.ReactNode;
}) {
  const from = pageInfo.rowCount === 0 ? 0 : pageInfo.page * pageInfo.pageSize + 1;
  const to = Math.min((pageInfo.page + 1) * pageInfo.pageSize, pageInfo.rowCount);

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
      <Typography variant="body2" color="text.secondary">
        Showing {from}–{to} of {renderRowCount ? renderRowCount(pageInfo.rowCount) : pageInfo.rowCount}
      </Typography>
      <Select
        size="small"
        value={isAllSelected ? ALL_SENTINEL : pageInfo.pageSize}
        onChange={(e) => onPageSizeChange(Number(e.target.value))}
        sx={{ minHeight: 44 }}
      >
        <MenuItem value={20}>20</MenuItem>
        <MenuItem value={50}>50</MenuItem>
        <MenuItem value={100}>100</MenuItem>
        <MenuItem value={ALL_SENTINEL}>All</MenuItem>
      </Select>
      <IconButton title="First page" onClick={onFirst} disabled={pageInfo.page === 0} sx={{ minWidth: 44, minHeight: 44 }}>
        <FirstPageIcon fontSize="small" />
      </IconButton>
      <IconButton title="Previous page" onClick={onPrev} disabled={pageInfo.page === 0} sx={{ minWidth: 44, minHeight: 44 }}>
        <NavigateBeforeIcon fontSize="small" />
      </IconButton>
      <Typography variant="body2" sx={{ minWidth: 90, textAlign: "center" }}>
        Page {pageInfo.totalPages === 0 ? 0 : pageInfo.page + 1} of {pageInfo.totalPages}
      </Typography>
      <IconButton
        title="Next page"
        onClick={onNext}
        disabled={pageInfo.page >= pageInfo.totalPages - 1}
        sx={{ minWidth: 44, minHeight: 44 }}
      >
        <NavigateNextIcon fontSize="small" />
      </IconButton>
      <IconButton
        title="Last page"
        onClick={onLast}
        disabled={pageInfo.page >= pageInfo.totalPages - 1}
        sx={{ minWidth: 44, minHeight: 44 }}
      >
        <LastPageIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}

export default function DataGrid<T>({
  rowData,
  columnDefs,
  height = 480,
  onRowClicked,
  exportFileName,
  rowSelection,
  onSelectionChanged,
  showTopPagination = false,
  suppressRowClickSelection,
  clearSelectionSignal,
  renderRowCount,
}: {
  rowData: T[];
  // Column groups (ColGroupDef, with nested `children`) are accepted too —
  // needed by the multi-provider comparison matrix's "[ Provider ] -> IR.21
  // (SCCP|DSX|IPX) | Reach List (SCCP|DSX|IPX)" grouped headers.
  columnDefs: (ColDef<T> | ColGroupDef<T>)[];
  height?: number;
  onRowClicked?: (row: T) => void;
  exportFileName?: string;
  // Opt-in checkbox multi-select — pass "multiRow" and AG Grid renders its
  // own selection checkbox column automatically (rowSelection.checkboxes
  // defaults to true). Don't also set checkboxSelection on a columnDef —
  // that's the legacy pre-v32 API and stacks a second checkbox column.
  rowSelection?: RowSelectionOptions<T>["mode"];
  onSelectionChanged?: (rows: T[]) => void;
  // Set true when the grid also has onRowClicked (e.g. navigate-to-detail)
  // alongside checkbox rowSelection — otherwise clicking anywhere on the
  // row toggles its checkbox too, fighting with the click-to-navigate
  // handler. Only the checkbox cell itself should select in that case.
  suppressRowClickSelection?: boolean;
  // Bump this (e.g. a counter incremented on each click) to imperatively
  // clear the grid's actual checkbox selection from outside — needed
  // because onSelectionChanged only flows grid-state -> React state, not
  // the reverse; resetting the caller's own `selected` array to [] alone
  // leaves AG Grid's checkboxes still visually checked.
  clearSelectionSignal?: number;
  // Also renders the pagination bar above the grid, not just below — for
  // long lists (300+ rows, e.g. a Tier-1 provider's full MNO footprint)
  // that would otherwise need scrolling all the way down just to change
  // page. Both bars drive the same grid API, so acting on either stays in
  // sync with the other automatically. The bottom bar (our own, replacing
  // AG Grid's native one) always renders regardless of this flag.
  showTopPagination?: boolean;
  // Replaces the bare row count in "Showing X–Y of {N}" with custom
  // content -- e.g. "178 change(s) across 72 unique operators" on the
  // Market Intelligence page. Omit for the default plain number (every
  // other page using this grid is unaffected).
  renderRowCount?: (rowCount: number) => React.ReactNode;
}) {
  const gridRef = React.useRef<AgGridReact<T>>(null);
  const [pageInfo, setPageInfo] = React.useState<PageInfo>({ page: 0, totalPages: 1, pageSize: 20, rowCount: 0 });
  const isMobile = useMediaQuery((t: Theme) => t.breakpoints.down("sm"));

  const defaultColDef = React.useMemo<ColDef>(
    // suppressMovable: dragging a header cell to reorder columns is a
    // separate AG Grid gesture from resizing, sharing the same header cell
    // -- easy to trigger by accident when a resize attempt starts a few
    // pixels short of the actual (8px, easy to miss) resize handle at the
    // column boundary. Column order isn't persisted or meaningful here, so
    // disabling it outright removes that accidental-reorder trap rather
    // than leaving users to land on it while trying to resize (see the
    // widened .ag-header-cell-resize hit target below for the other half
    // of that fix).
    () => ({ sortable: true, filter: true, resizable: true, suppressMovable: true, flex: 1, minWidth: 110 }),
    [],
  );

  // Pins the first (identifying) column — Operator Name, Provider Name,
  // etc., always listed first by every caller — on mobile, so it stays in
  // view while the rest of a wide grid scrolls horizontally underneath it.
  // AG Grid doesn't support flex on pinned columns, so it's swapped for a
  // fixed width here — wide enough for the header text plus its sort/
  // filter icons to avoid clipping/overlap.
  const effectiveColumnDefs = React.useMemo(() => {
    if (!isMobile || columnDefs.length === 0) return columnDefs;
    const [first, ...rest] = columnDefs;
    if ("children" in first || first.pinned) return columnDefs;
    const { flex: _flex, ...pinnedFirst } = first;
    // suppressSizeToFit is required here — without it, sizeColumnsToFit()
    // (called on every layout pass, see the effect below) redistributes
    // width across ALL columns including pinned ones, shrinking this back
    // down to defaultColDef's 110px minWidth floor regardless of the
    // explicit width set here.
    return [{ ...pinnedFirst, pinned: "left" as const, width: 170, suppressSizeToFit: true }, ...rest];
  }, [columnDefs, isMobile]);

  const syncPageInfo = React.useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    setPageInfo({
      page: api.paginationGetCurrentPage(),
      totalPages: api.paginationGetTotalPages(),
      pageSize: api.paginationGetPageSize(),
      rowCount: api.paginationGetRowCount(),
    });
  }, []);

  const forceLayout = React.useCallback(() => {
    gridRef.current?.api?.sizeColumnsToFit();
  }, []);

  const onGridReady = React.useCallback(() => {
    forceLayout();
    syncPageInfo();
  }, [forceLayout, syncPageInfo]);

  // AG Grid occasionally finishes its very first flex-width layout pass one
  // column short on a production (non-Strict-Mode) mount — observed on
  // wide grids (7+ columns needing horizontal scroll), where the last
  // column's header cell never mounts even though the grid's own column
  // model and total layout width both account for it. Calling
  // sizeColumnsToFit() from onGridReady/onFirstDataRendered wasn't enough —
  // the pagination bar's own onGridReady-triggered setPageInfo() re-renders
  // DataGrid with a fresh columnDefs array reference, and ag-grid-react
  // reapplies it (re-triggering the same drop) shortly after. A delayed
  // effect, run once React/AG Grid have both settled, reliably outlasts
  // that churn. Costs each column's flex ratio (all end up equal-width) in
  // favor of the column actually being there — acceptable, since columns
  // stay user-resizable.
  React.useEffect(() => {
    const timer = setTimeout(forceLayout, 400);
    return () => clearTimeout(timer);
  }, [rowData, effectiveColumnDefs, forceLayout]);

  React.useEffect(() => {
    if (clearSelectionSignal !== undefined) gridRef.current?.api?.deselectAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSelectionSignal]);

  function handlePageSizeChange(value: number) {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setGridOption("paginationPageSize", value === ALL_SENTINEL ? Math.max(rowData.length, 1) : value);
  }

  const isAllSelected = rowData.length > 0 && pageInfo.pageSize >= rowData.length;

  const handleExport = React.useCallback(() => {
    const api = gridRef.current?.api;
    if (!api || !exportFileName) return;
    // allColumns: true pulls in columns marked hide: true (e.g. MNO Search's
    // "Has IR.21 PDF") so a value merged into another column's cell renderer
    // for display purposes still reaches CSV exports for offline reporting.
    const csv = api.getDataAsCsv({ allColumns: true });
    if (csv === undefined) return;
    const footer =
      "\nNotice: Exported from CCIP for intelligence analysis. Sourced from declared IR.21 & Reach List archives without operational warranty.\n";
    const blob = new Blob([csv + footer], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = exportFileName.endsWith(".csv") ? exportFileName : `${exportFileName}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [exportFileName]);

  const paginationBarProps = {
    pageInfo,
    isAllSelected,
    onFirst: () => gridRef.current?.api.paginationGoToFirstPage(),
    onPrev: () => gridRef.current?.api.paginationGoToPreviousPage(),
    onNext: () => gridRef.current?.api.paginationGoToNextPage(),
    onLast: () => gridRef.current?.api.paginationGoToLastPage(),
    onPageSizeChange: handlePageSizeChange,
    renderRowCount,
  };

  return (
    <Box>
      {(exportFileName || showTopPagination) && (
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            justifyContent: "space-between",
            alignItems: { xs: "stretch", sm: "center" },
            mb: 1,
            flexWrap: "wrap",
            gap: 1,
          }}
        >
          {showTopPagination ? <PaginationBar {...paginationBarProps} /> : <Box />}
          {exportFileName && (
            <Button
              size="small"
              startIcon={<DownloadIcon />}
              onClick={handleExport}
              sx={{ minHeight: 44 }}
            >
              Export CSV
            </Button>
          )}
        </Box>
      )}
      <Box
        sx={{
          "& .ag-paging-panel": { display: "none !important" },
          // Selection cue for rowSelection-enabled grids (Provider/Operator
          // Search): an accent left border plus a light tint, not just AG
          // Grid's own faint default highlight -- immediate and unambiguous
          // at a glance across a dense table, with a quick transition so it
          // doesn't feel like a hard flash.
          "& .ag-row-selected": {
            backgroundColor: "rgba(11, 111, 191, 0.08) !important",
            boxShadow: "inset 3px 0 0 0 #0B6FBF",
            transition: "background-color 180ms ease-in-out, box-shadow 180ms ease-in-out",
          },
          "& .ag-row": { transition: "background-color 180ms ease-in-out" },
          // AG Grid's own resize handle is a bare 8px strip exactly on the
          // column boundary -- an easy miss, especially at a glance. Widens
          // just the invisible grab target (not the visible column
          // separator line) so a slightly-off drag still starts a resize
          // instead of falling through to a header click/reorder attempt.
          // AG Grid's default resize handle already sits flush against the
          // column's own right edge (position: absolute; right: 0) --
          // widening it just extends further left, staying entirely inside
          // this column rather than reaching into the next one, where it'd
          // lose the pointer-event fight to that sibling's own stacking
          // context no matter how high a z-index it's given here.
          "& .ag-header-cell-resize": { width: "16px !important" },
          "& .ag-header-cell-resize:hover": { backgroundColor: "rgba(11, 111, 191, 0.25)" },
        }}
      >
        <div
          className="ag-theme-quartz"
          style={{
            height: `clamp(400px, calc(100vh - 280px), ${height}px)`,
            width: "100%",
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
            // Quartz theme's own default (14px) reads small on a large
            // desktop monitor for what's usually the densest, most-read
            // content on the page -- bumped a point, with matching row/
            // header height bumps so the extra text height doesn't feel
            // cramped against AG Grid's own default vertical padding.
            ["--ag-font-size" as string]: "15px",
            ["--ag-row-height" as string]: "44px",
            ["--ag-header-height" as string]: "48px",
          }}
        >
          <AgGridReact
            ref={gridRef}
            rowData={rowData}
            columnDefs={effectiveColumnDefs}
            defaultColDef={defaultColDef}
            pagination
            paginationPageSize={20}
            paginationPageSizeSelector={[20, 50, 100]}
            animateRows
            rowStyle={onRowClicked ? { cursor: "pointer" } : undefined}
            onRowClicked={onRowClicked ? (e) => e.data && onRowClicked(e.data) : undefined}
            rowSelection={rowSelection ? { mode: rowSelection, enableClickSelection: !suppressRowClickSelection } : undefined}
            onSelectionChanged={
              onSelectionChanged ? (e) => onSelectionChanged(e.api.getSelectedRows()) : undefined
            }
            onPaginationChanged={syncPageInfo}
            onGridReady={onGridReady}
            onFirstDataRendered={forceLayout}
          />
        </div>
      </Box>
      <Box sx={{ display: "flex", justifyContent: "center", mt: 1 }}>
        <PaginationBar {...paginationBarProps} />
      </Box>
    </Box>
  );
}
