"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColDef, ColGroupDef } from "ag-grid-community";
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  Paper,
  Switch,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import DataGrid from "@/components/DataGrid";
import { api, ApiError } from "@/lib/api";
import { openMnoPdf } from "@/lib/openPdf";
import { OperatorCompareMatrixProviderRow, OperatorCompareMatrixResponse } from "@ccip/shared-types";

type ServiceTabKey = "sccp" | "dsx" | "ipx";
const SERVICE_TABS: { key: ServiceTabKey; label: string }[] = [
  { key: "sccp", label: "SCCP Signaling" },
  { key: "dsx", label: "DSX / LTE Diameter" },
  { key: "ipx", label: "IPX / Data Roaming" },
];

function statusRenderer(p: { value: boolean }) {
  return p.value ? "✓" : "-";
}

export default function OperatorComparePage() {
  return (
    <React.Suspense fallback={null}>
      <OperatorComparePageInner />
    </React.Suspense>
  );
}

function OperatorComparePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ids = React.useMemo(
    () =>
      Array.from(
        new Set(
          (searchParams.get("ids") ?? "")
            .split(",")
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => !isNaN(n)),
        ),
      ),
    [searchParams],
  );

  const [data, setData] = React.useState<OperatorCompareMatrixResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<ServiceTabKey>("sccp");
  const [sharedOnly, setSharedOnly] = React.useState(false);
  const [differencesOnly, setDifferencesOnly] = React.useState(false);

  React.useEffect(() => {
    if (ids.length < 2) {
      setError("Select at least 2 operators to compare.");
      return;
    }
    setError(null);
    api
      .get<OperatorCompareMatrixResponse>(`/mno/compare-matrix?mnoIds=${ids.join(",")}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load comparison matrix"));
  }, [ids]);

  const hasPresence = (row: OperatorCompareMatrixProviderRow, mnoId: number) => {
    const cell = row.operatorStatus[mnoId];
    return !!cell && (cell.ir21Declared || cell.reachListClaimed);
  };

  const rowsForTab = React.useMemo(() => {
    if (!data) return [];
    let rows = data.matrix[tab];
    if (sharedOnly) {
      rows = rows.filter((r) => ids.every((id) => hasPresence(r, id)));
    }
    if (differencesOnly) {
      rows = rows.filter((r) => {
        const cells = ids.map((id) => r.operatorStatus[id] ?? { ir21Declared: false, reachListClaimed: false });
        const first = cells[0];
        return cells.some((c) => c.ir21Declared !== first.ir21Declared || c.reachListClaimed !== first.reachListClaimed);
      });
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, tab, sharedOnly, differencesOnly, ids]);

  const columnDefs = React.useMemo<(ColDef<OperatorCompareMatrixProviderRow> | ColGroupDef<OperatorCompareMatrixProviderRow>)[]>(() => {
    if (!data) return [];
    const base: ColDef<OperatorCompareMatrixProviderRow>[] = [
      { field: "providerName", headerName: "Wholesale Carrier / Provider", pinned: "left", flex: 1.3, minWidth: 200 },
    ];

    const operatorGroups: ColGroupDef<OperatorCompareMatrixProviderRow>[] = data.operators.map((op) => ({
      headerName: `${op.operatorName} (${op.tadigCode}, ${op.country})`,
      children: [
        {
          headerName: "IR.21 Declared",
          minWidth: 110,
          cellRenderer: statusRenderer,
          cellStyle: (p) => {
            const cell = p.data?.operatorStatus[op.id];
            if (!cell?.ir21Declared) return null;
            return { background: cell.reachListClaimed ? "#e8f5e9" : "#e3f2fd", fontWeight: 600 };
          },
          valueGetter: (p) => p.data?.operatorStatus[op.id]?.ir21Declared ?? false,
          tooltipValueGetter: (p) => p.data?.operatorStatus[op.id]?.rawDeclaredString || undefined,
        },
        {
          headerName: "Reach List Claimed",
          minWidth: 130,
          cellRenderer: statusRenderer,
          cellStyle: (p) => {
            const cell = p.data?.operatorStatus[op.id];
            if (!cell?.reachListClaimed) return null;
            return { background: cell.ir21Declared ? "#e8f5e9" : "#fff3e0", fontWeight: 600 };
          },
          valueGetter: (p) => p.data?.operatorStatus[op.id]?.reachListClaimed ?? false,
        },
      ],
    }));

    return [...base, ...operatorGroups];
  }, [data]);

  const currentServiceLabel = SERVICE_TABS.find((t) => t.key === tab)?.label ?? tab;

  return (
    <RequireAuth>
      <AppShell>
        <Button startIcon={<ArrowBackIcon />} onClick={() => router.back()} sx={{ mb: 2 }}>
          Back to search
        </Button>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
          MNO / Cust Connectivity Comparison Matrix
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Side-by-side comparison of wholesale carrier interconnects declared in IR.21 vs claimed in Reach Lists.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {data && (
          <>
            <Paper sx={{ p: 2, mb: 2, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <Typography variant="body2" fontWeight={600} sx={{ mr: 1 }}>
                View IR.21 PDF:
              </Typography>
              {data.operators.map((op) =>
                op.hasPdfDocument ? (
                  <Chip
                    key={op.id}
                    size="small"
                    icon={<PictureAsPdfIcon fontSize="small" />}
                    label={op.operatorName}
                    color="error"
                    variant="outlined"
                    clickable
                    onClick={() => openMnoPdf(op.id)}
                  />
                ) : (
                  <Chip key={op.id} size="small" label={`${op.operatorName} (no PDF)`} variant="outlined" disabled />
                ),
              )}
            </Paper>

            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1, mb: 1 }}>
              <Tabs value={tab} onChange={(_, v) => setTab(v)}>
                {SERVICE_TABS.map((t) => (
                  <Tab key={t.key} value={t.key} label={t.label} />
                ))}
              </Tabs>
              <Box sx={{ display: "flex", gap: 2 }}>
                <FormControlLabel
                  control={<Switch size="small" checked={sharedOnly} onChange={(e) => setSharedOnly(e.target.checked)} />}
                  label="Show Shared Providers Only"
                />
                <FormControlLabel
                  control={<Switch size="small" checked={differencesOnly} onChange={(e) => setDifferencesOnly(e.target.checked)} />}
                  label="Show Differences Only"
                />
              </Box>
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {rowsForTab.length} carrier(s) connected to at least one selected operator for {currentServiceLabel}. Green
              = confirmed both sides, blue = IR.21-only, orange = Reach-List-only.
            </Typography>

            <DataGrid<OperatorCompareMatrixProviderRow>
              rowData={rowsForTab}
              columnDefs={columnDefs}
              exportFileName={`operator-comparison-${tab}-${data.operators.map((o) => o.tadigCode).join("-")}.csv`}
              showTopPagination
              height={560}
            />
          </>
        )}
      </AppShell>
    </RequireAuth>
  );
}
