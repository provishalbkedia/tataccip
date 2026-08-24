"use client";

import * as React from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ColGroupDef, RowSelectionOptions } from "ag-grid-community";
import { Box, Button, IconButton, MenuItem, Select, Typography } from "@mui/material";
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
}: {
  rowData: T[];
  // Column groups (ColGroupDef, with nested `children`) are accepted too —
  // needed by the multi-provider comparison matrix's "[ Provider ] -> IR.21
  // (SCCP|DSX|IPX) | Reach List (SCCP|DSX|IPX)" grouped headers.
  columnDefs: (ColDef<T> | ColGroupDef<T>)[];
  height?: number;
  onRowClicked?: (row: T) => void;
  exportFileName?: string;
  // Opt-in checkbox multi-select — pass "multiRow" and give the first
  // columnDef `checkboxSelection: true` to render checkboxes.
  rowSelection?: RowSelectionOptions<T>["mode"];
  onSelectionChanged?: (rows: T[]) => void;
  // Set true when the grid also has onRowClicked (e.g. navigate-to-detail)
  // alongside checkbox rowSelection — otherwise clicking anywhere on the
  // row toggles its checkbox too, fighting with the click-to-navigate
  // handler. Only the checkbox cell itself should select in that case.
  suppressRowClickSelection?: boolean;
  // Mirrors AG Grid's own bottom pagination bar above the table too — for
  // long lists (300+ rows, e.g. a Tier-1 provider's full MNO footprint)
  // that would otherwise need scrolling all the way down just to change
  // page. Both bars drive the same grid API, so acting on either stays in
  // sync with the other automatically.
  showTopPagination?: boolean;
}) {
  const gridRef = React.useRef<AgGridReact<T>>(null);
  const [pageInfo, setPageInfo] = React.useState({ page: 0, totalPages: 1, pageSize: 20, rowCount: 0 });

  const defaultColDef = React.useMemo<ColDef>(
    () => ({ sortable: true, filter: true, resizable: true, flex: 1, minWidth: 110 }),
    [],
  );

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
    if (showTopPagination) syncPageInfo();
  }, [forceLayout, showTopPagination, syncPageInfo]);

  // AG Grid occasionally finishes its very first flex-width layout pass one
  // column short on a production (non-Strict-Mode) mount — observed on
  // wide grids (7+ columns needing horizontal scroll), where the last
  // column's header cell never mounts even though the grid's own column
  // model and total layout width both account for it. Calling
  // sizeColumnsToFit() from onGridReady/onFirstDataRendered wasn't enough —
  // showTopPagination's own onGridReady-triggered setPageInfo() re-renders
  // DataGrid with a fresh columnDefs array reference, and ag-grid-react
  // reapplies it (re-triggering the same drop) shortly after. A delayed
  // effect, run once React/AG Grid have both settled, reliably outlasts
  // that churn. Costs each column's flex ratio (all end up equal-width) in
  // favor of the column actually being there — acceptable, since columns
  // stay user-resizable.
  React.useEffect(() => {
    const timer = setTimeout(forceLayout, 400);
    return () => clearTimeout(timer);
  }, [rowData, columnDefs, forceLayout]);

  function handlePageSizeChange(value: number) {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setGridOption("paginationPageSize", value === ALL_SENTINEL ? Math.max(rowData.length, 1) : value);
  }

  const from = pageInfo.rowCount === 0 ? 0 : pageInfo.page * pageInfo.pageSize + 1;
  const to = Math.min((pageInfo.page + 1) * pageInfo.pageSize, pageInfo.rowCount);
  const isAllSelected = rowData.length > 0 && pageInfo.pageSize >= rowData.length;

  return (
    <Box>
      {(exportFileName || showTopPagination) && (
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1, flexWrap: "wrap", gap: 1 }}>
          {showTopPagination ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Showing {from}–{to} of {pageInfo.rowCount}
              </Typography>
              <Select
                size="small"
                value={isAllSelected ? ALL_SENTINEL : pageInfo.pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              >
                <MenuItem value={20}>20</MenuItem>
                <MenuItem value={50}>50</MenuItem>
                <MenuItem value={100}>100</MenuItem>
                <MenuItem value={ALL_SENTINEL}>All</MenuItem>
              </Select>
              <IconButton
                size="small"
                title="First page"
                onClick={() => gridRef.current?.api.paginationGoToFirstPage()}
                disabled={pageInfo.page === 0}
              >
                <FirstPageIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                title="Previous page"
                onClick={() => gridRef.current?.api.paginationGoToPreviousPage()}
                disabled={pageInfo.page === 0}
              >
                <NavigateBeforeIcon fontSize="small" />
              </IconButton>
              <Typography variant="body2" sx={{ minWidth: 90, textAlign: "center" }}>
                Page {pageInfo.totalPages === 0 ? 0 : pageInfo.page + 1} of {pageInfo.totalPages}
              </Typography>
              <IconButton
                size="small"
                title="Next page"
                onClick={() => gridRef.current?.api.paginationGoToNextPage()}
                disabled={pageInfo.page >= pageInfo.totalPages - 1}
              >
                <NavigateNextIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                title="Last page"
                onClick={() => gridRef.current?.api.paginationGoToLastPage()}
                disabled={pageInfo.page >= pageInfo.totalPages - 1}
              >
                <LastPageIcon fontSize="small" />
              </IconButton>
            </Box>
          ) : (
            <Box />
          )}
          {exportFileName && (
            <Button
              size="small"
              startIcon={<DownloadIcon />}
              onClick={() => gridRef.current?.api.exportDataAsCsv({ fileName: exportFileName })}
            >
              Export CSV
            </Button>
          )}
        </Box>
      )}
      <div className="ag-theme-quartz" style={{ height, width: "100%" }}>
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
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
          onPaginationChanged={showTopPagination ? syncPageInfo : undefined}
          onGridReady={onGridReady}
          onFirstDataRendered={forceLayout}
        />
      </div>
    </Box>
  );
}
