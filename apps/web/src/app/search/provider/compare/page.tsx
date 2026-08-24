"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColDef, ColGroupDef } from "ag-grid-community";
import { Alert, Box, Button, MenuItem, Paper, TextField, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import DataGrid from "@/components/DataGrid";
import { api, ApiError } from "@/lib/api";
import { ProviderCompareMatrixItem } from "@ccip/shared-types";

type FilterMode = "all" | "common" | "gaps";

function checkOrDash(p: { value: boolean }) {
  return p.value ? "✓" : "-";
}

export default function ProviderComparePage() {
  return (
    <React.Suspense fallback={null}>
      <ProviderComparePageInner />
    </React.Suspense>
  );
}

function ProviderComparePageInner() {
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

  const [rows, setRows] = React.useState<ProviderCompareMatrixItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [filterMode, setFilterMode] = React.useState<FilterMode>("all");
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    if (ids.length < 2) {
      setError("Select at least 2 providers to compare.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .get<ProviderCompareMatrixItem[]>(`/provider/compare-matrix?ids=${ids.join(",")}`)
      .then((res) => {
        setRows(res);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : "Failed to load comparison matrix");
        setLoading(false);
      });
  }, [ids]);

  // Column-group headers need every selected provider's name up front, even
  // one with zero MNOs of its own (which would never appear inside any
  // row's `providers` map) — derived from whichever row happens to carry
  // it, falling back to a generic label for the (rare) zero-footprint case.
  const providerList = React.useMemo(() => {
    return ids.map((id) => {
      const named = rows.find((r) => r.providers[id]?.providerName)?.providers[id];
      return { id, providerName: named?.providerName ?? `Provider ${id}` };
    });
  }, [ids, rows]);

  const hasPresence = (row: ProviderCompareMatrixItem, id: number) => {
    const p = row.providers[id];
    if (!p) return false;
    return p.ir21.sccp || p.ir21.dsx || p.ir21.ipx || p.reachList.sccp || p.reachList.dsx || p.reachList.ipx;
  };

  const filteredRows = React.useMemo(() => {
    let out = rows;
    if (filterMode === "common") {
      out = out.filter((r) => ids.every((id) => hasPresence(r, id)));
    } else if (filterMode === "gaps") {
      out = out.filter((r) => !ids.every((id) => hasPresence(r, id)));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((r) => r.operatorName.toLowerCase().includes(q) || r.country.toLowerCase().includes(q));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filterMode, search, ids]);

  const columnDefs = React.useMemo<(ColDef<ProviderCompareMatrixItem> | ColGroupDef<ProviderCompareMatrixItem>)[]>(() => {
    const base: ColDef<ProviderCompareMatrixItem>[] = [
      { field: "country", headerName: "Country", pinned: "left", maxWidth: 110 },
      { field: "operatorName", headerName: "MNO", pinned: "left", flex: 1.2, minWidth: 160 },
      { field: "tadigCode", headerName: "TADIG", pinned: "left", maxWidth: 100 },
    ];

    const providerGroups: ColGroupDef<ProviderCompareMatrixItem>[] = providerList.map(({ id, providerName }) => ({
      headerName: providerName,
      children: [
        {
          headerName: "IR.21",
          children: (["sccp", "dsx", "ipx"] as const).map((svc) => ({
            headerName: svc.toUpperCase(),
            minWidth: 80,
            maxWidth: 90,
            cellRenderer: checkOrDash,
            valueGetter: (p: { data?: ProviderCompareMatrixItem }) => p.data?.providers[id]?.ir21[svc] ?? false,
          })),
        },
        {
          headerName: "Reach List",
          children: (["sccp", "dsx", "ipx"] as const).map((svc) => ({
            headerName: svc.toUpperCase(),
            minWidth: 80,
            maxWidth: 90,
            cellRenderer: checkOrDash,
            valueGetter: (p: { data?: ProviderCompareMatrixItem }) => p.data?.providers[id]?.reachList[svc] ?? false,
          })),
        },
      ],
    }));

    return [...base, ...providerGroups];
  }, [providerList]);

  return (
    <RequireAuth>
      <AppShell>
        <Button startIcon={<ArrowBackIcon />} onClick={() => router.back()} sx={{ mb: 2 }}>
          Back to search
        </Button>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
          Multi-Provider Comparison Matrix
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {providerList.length > 0
            ? `Comparing ${providerList.map((p) => p.providerName).join(" vs. ")} — every MNO covered by at least one, split by IR.21 vs Reach List per service.`
            : "Select 2-5 providers from Provider Search to compare their footprints."}
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!error && (
          <>
            <Paper sx={{ p: 2, mb: 2, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
              <TextField
                select
                size="small"
                label="Quick Filter"
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value as FilterMode)}
                sx={{ minWidth: 220 }}
              >
                <MenuItem value="all">All MNOs</MenuItem>
                <MenuItem value="common">Show common MNOs only</MenuItem>
                <MenuItem value="gaps">Show exclusivity/gap MNOs</MenuItem>
              </TextField>
              <TextField
                size="small"
                label="Search by Country/MNO"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ minWidth: 260 }}
              />
              <Typography variant="body2" color="text.secondary">
                {loading ? "Loading…" : `${filteredRows.length} of ${rows.length} MNO(s)`}
              </Typography>
            </Paper>

            <DataGrid<ProviderCompareMatrixItem>
              rowData={filteredRows}
              columnDefs={columnDefs}
              exportFileName={`provider-comparison-${providerList.map((p) => p.providerName).join("-")}.csv`}
              showTopPagination
              height={620}
            />
          </>
        )}
      </AppShell>
    </RequireAuth>
  );
}
