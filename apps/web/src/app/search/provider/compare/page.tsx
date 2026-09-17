"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColDef, ColGroupDef, ICellRendererParams } from "ag-grid-community";
import { Alert, Box, Button, Chip, IconButton, MenuItem, Paper, Popover, TextField, Tooltip, Typography } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import BackNavBar from "@/components/BackNavBar";
import DataGrid from "@/components/DataGrid";
import { api, ApiError } from "@/lib/api";
import { getCountryName } from "@/lib/countries";
import { ProviderCompareMatrixItem, ProviderCompareMatrixProviderMeta, ProviderCompareMatrixResponse } from "@ccip/shared-types";

const EMPTY_COMPARE_RESPONSE: ProviderCompareMatrixResponse = { providers: [], rows: [] };

type FilterMode = "all" | "common" | "gaps";

function checkOrDash(p: { value: boolean }) {
  return p.value ? "✓" : "-";
}

/** AG Grid `headerComponent` for the pinned "MNO" column -- explains that
 * row names are clickable links to the operator's own detail page. */
function OperatorLinkHeader(props: { displayName: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      <span>{props.displayName}</span>
      <Tooltip title="Click any MNO name to open its complete technical routing profile, DPC point codes, and IP ranges.">
        <InfoOutlinedIcon fontSize="small" sx={{ color: "text.disabled", fontSize: 15 }} />
      </Tooltip>
    </Box>
  );
}

/** AG Grid `headerGroupComponent` for each provider's column group --
 * appends the provider's own observed ASN(s) as a chip beside its name, so
 * a network engineer can tell peering identity apart at a glance without
 * opening each provider's own detail page. */
function ProviderGroupHeader(props: { displayName: string; asns: string[] }) {
  const { asns } = props;
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.75, width: "100%" }}>
      <Typography sx={{ fontWeight: 700, fontSize: "0.875rem" }}>{props.displayName}</Typography>
      {asns.length > 0 && (
        <Tooltip title={asns.length > 1 ? `Observed ASNs: ${asns.join(", ")}` : ""}>
          <Chip
            label={`ASN ${asns[0]}${asns.length > 1 ? ` +${asns.length - 1}` : ""}`}
            size="small"
            sx={{ bgcolor: "#0A2540", color: "#E2E8F0", fontSize: "0.72rem", height: 20, fontWeight: 600 }}
          />
        </Tooltip>
      )}
    </Box>
  );
}

/** AG Grid `cellRenderer` for the pinned "ASN" column -- an MNO can declare
 * more than one Autonomous System Number (primary plus secondary/peering
 * ASNs per GSMA IR.21 Section 17), and silently truncating to the first one
 * hides real routing intelligence from a peering engineer. Shows the
 * primary ASN plus a "+N" chip when there are more; clicking it opens a
 * popover listing every declared ASN with a one-click copy. */
function MnoAsnCell(params: ICellRendererParams<ProviderCompareMatrixItem, string[]>) {
  const asns = params.value ?? [];
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);

  if (asns.length === 0) {
    return <span style={{ color: "#94A3B8" }}>—</span>;
  }
  if (asns.length === 1) {
    return <span>{asns[0]}</span>;
  }

  const extraCount = asns.length - 1;

  const handleCopyAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(asns.join(", "));
  };

  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
      <span>{asns[0]}</span>
      <Chip
        label={`+${extraCount}`}
        size="small"
        // AG Grid's row click (open detail page) only stops if propagation
        // is cut during the CAPTURE phase -- React funnels every
        // onClickCapture through one listener at its root, so calling
        // stopPropagation() there halts the real event before it ever
        // reaches this node, meaning a separate bubble-phase onClick here
        // would never fire afterward. Doing the popover's own state update
        // inside this same capture handler avoids relying on that second,
        // now-unreachable bubble dispatch.
        onClickCapture={(e) => {
          e.stopPropagation();
          setAnchorEl(e.currentTarget);
        }}
        sx={{ height: 18, fontSize: "0.68rem", fontWeight: 700, cursor: "pointer", bgcolor: "#0A2540", color: "#E2E8F0" }}
      />
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Box sx={{ p: 1.5, minWidth: 200, maxWidth: 260 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
            <Typography sx={{ fontSize: "0.78rem", fontWeight: 700, color: "#0A2540" }}>Declared ASNs ({asns.length})</Typography>
            <Tooltip title="Copy all ASNs">
              <IconButton size="small" onClick={handleCopyAll}>
                <ContentCopyIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {asns.map((asn, idx) => (
              <Box
                key={asn}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  bgcolor: "#F8FAFC",
                  border: "1px solid #E2E8F0",
                  borderRadius: "4px",
                  px: 1,
                  py: 0.4,
                  fontFamily: "monospace",
                  fontSize: "0.78rem",
                }}
              >
                <span>{asn}</span>
                <span style={{ color: "#94A3B8" }}>{idx === 0 ? "Primary" : `Sec #${idx}`}</span>
              </Box>
            ))}
          </Box>
        </Box>
      </Popover>
    </Box>
  );
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
  const [providerMeta, setProviderMeta] = React.useState<ProviderCompareMatrixProviderMeta[]>([]);
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
      .get<ProviderCompareMatrixResponse>(`/provider/compare-matrix?ids=${ids.join(",")}`)
      .then((res) => {
        // Defensive fallback at this API boundary specifically: `res.rows`/
        // `res.providers` are typed as always-arrays, but that only holds
        // once the deployed backend actually returns this {providers, rows}
        // shape -- a backend still running pre-ASN-feature code would
        // return a bare array instead (no .rows/.providers at all), and
        // trusting the type blindly would set state to undefined and crash
        // providerList's own .find() below the moment it renders.
        setRows(res.rows ?? []);
        setProviderMeta(res.providers ?? []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : "Failed to load comparison matrix");
        setRows(EMPTY_COMPARE_RESPONSE.rows);
        setProviderMeta(EMPTY_COMPARE_RESPONSE.providers);
        setLoading(false);
      });
  }, [ids]);

  // Column-group headers need every selected provider's name (and ASNs) up
  // front, even one with zero MNOs of its own -- now sourced directly from
  // the backend's own providers metadata (authoritative, unlike the prior
  // approach of scanning rows for whichever one happened to carry a given
  // provider's name), ordered to match the URL's own id order.
  const providerList = React.useMemo(() => {
    return ids.map((id) => {
      const meta = providerMeta.find((p) => p.id === id);
      return { id, providerName: meta?.providerName ?? `Provider ${id}`, asns: meta?.asns ?? [] };
    });
  }, [ids, providerMeta]);

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
      {
        field: "country",
        headerName: "Country",
        pinned: "left",
        maxWidth: 160,
        valueFormatter: (p) => getCountryName(p.value),
        tooltipValueGetter: (p) => getCountryName(p.value),
      },
      { field: "operatorName", headerName: "MNO / Cust", pinned: "left", flex: 1.2, minWidth: 160, headerComponent: OperatorLinkHeader },
      { field: "tadigCode", headerName: "TADIG", pinned: "left", maxWidth: 100 },
      {
        field: "mnoAsNumbers",
        headerName: "ASN",
        pinned: "left",
        minWidth: 110,
        maxWidth: 150,
        cellStyle: { fontFamily: "monospace", fontSize: "0.8rem" },
        // Primary (first-declared) ASN plus a "+N" chip when the MNO has
        // declared more than one (e.g. a secondary/peering ASN per GSMA
        // IR.21 Section 17) -- clicking it lists every ASN with a copy
        // action, so multi-ASN operators no longer get silently truncated.
        cellRenderer: MnoAsnCell,
        // valueFormatter drives CSV/clipboard export, which has no click
        // interaction to reveal the rest -- export every declared ASN, not
        // just the primary one shown on screen.
        valueFormatter: (p) => (p.value?.length ? p.value.join("; ") : "—"),
        tooltipValueGetter: (p) => (p.value?.length > 1 ? `Click +${p.value.length - 1} to view all declared ASNs` : ""),
      },
    ];

    const providerGroups: ColGroupDef<ProviderCompareMatrixItem>[] = providerList.map(({ id, providerName, asns }) => ({
      // headerGroupComponent renders the richer name+chip on screen; this
      // string headerName is what CSV export and screen readers fall back
      // to, so it carries the ASN too (e.g. "Arelion (ASN 1299)").
      headerName: asns.length > 0 ? `${providerName} (ASN ${asns[0]})` : providerName,
      headerGroupComponent: ProviderGroupHeader,
      headerGroupComponentParams: { displayName: providerName, asns },
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
        <BackNavBar label="BACK TO SEARCH" />
        <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
          Multi-Provider Comparison Matrix
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 3 }}>
          <Typography variant="body2" color="text.secondary">
            {providerList.length > 0
              ? `Comparing ${providerList.map((p) => p.providerName).join(" vs. ")} — every MNO covered by at least one, split by IR.21 vs Reach List per service.`
              : "Select 2-5 providers from Provider Search to compare their footprints."}
          </Typography>
          <Tooltip title="Checkmarks denote active declared or claimed connectivity across SCCP (Signaling), DSX (LTE Diameter), and IPX (Data Roaming).">
            <InfoOutlinedIcon fontSize="small" sx={{ color: "text.disabled", flexShrink: 0 }} />
          </Tooltip>
        </Box>

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
              onRowClicked={(row) => router.push(`/search/mno/${row.mnoId}`)}
            />
          </>
        )}
      </AppShell>
    </RequireAuth>
  );
}
