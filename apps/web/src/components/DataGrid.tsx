"use client";

import * as React from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import { Box, Button } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

export default function DataGrid<T>({
  rowData,
  columnDefs,
  height = 480,
  onRowClicked,
  exportFileName,
}: {
  rowData: T[];
  columnDefs: ColDef<T>[];
  height?: number;
  onRowClicked?: (row: T) => void;
  exportFileName?: string;
}) {
  const gridRef = React.useRef<AgGridReact<T>>(null);
  const defaultColDef = React.useMemo<ColDef>(
    () => ({ sortable: true, filter: true, resizable: true, flex: 1, minWidth: 110 }),
    [],
  );

  return (
    <Box>
      {exportFileName && (
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
          <Button
            size="small"
            startIcon={<DownloadIcon />}
            onClick={() => gridRef.current?.api.exportDataAsCsv({ fileName: exportFileName })}
          >
            Export CSV
          </Button>
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
        />
      </div>
    </Box>
  );
}
