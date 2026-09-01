"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import FindInPageIcon from "@mui/icons-material/FindInPage";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import StarIcon from "@mui/icons-material/Star";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import DataGrid from "@/components/DataGrid";
import ProviderInspectorDrawer, { ProviderInspectorData } from "@/components/ProviderInspectorDrawer";
import { api } from "@/lib/api";
import { openMnoPdf } from "@/lib/openPdf";
import { OnNetMnoRow, ProviderDetail, ProviderStatsSource } from "@ccip/shared-types";

const VALID_SOURCES: string[] = Object.values(ProviderStatsSource);

const SOURCE_CONTEXT: Record<
  ProviderStatsSource,
  { heading: string; chipLabel: string; chipColor: "primary" | "secondary" | "default"; subtitle: string }
> = {
  [ProviderStatsSource.IR21]: {
    heading: "On-Net MNO Footprint (As per GSMA IR.21 Database)",
    chipLabel: "GSMA IR.21 Declared",
    chipColor: "primary",
    subtitle:
      "Showing MNOs that officially declared this carrier in their GSMA IR.21 XML documents. Click any operator row to view full MNO connectivity details.",
  },
  [ProviderStatsSource.REACH_LIST]: {
    heading: "Claimed MNO Footprint (As per Published Reach Lists)",
    chipLabel: "Reach List Claimed",
    chipColor: "secondary",
    subtitle:
      "Showing MNOs claimed by this carrier in their published commercial reach lists. Click any operator row to view full MNO connectivity details.",
  },
  [ProviderStatsSource.BOTH]: {
    heading: "Consolidated Footprint (IR.21 vs Reach List Combined)",
    chipLabel: "IR.21 + Reach List",
    chipColor: "default",
    subtitle: "Combining both sources — the IR.21/Reach List columns below show which source(s) actually declared each service.",
  },
};

/** stopPropagation so clicking the PDF icon opens the PDF without also
 * triggering the row's own onRowClicked navigation to the MNO detail page. */
function PdfCell(params: ICellRendererParams<OnNetMnoRow>) {
  if (!params.data?.hasPdfDocument) {
    return <span style={{ color: "rgba(0,0,0,0.4)" }}>-</span>;
  }
  return (
    <IconButton
      size="small"
      color="error"
      title="View IR.21 PDF"
      onClick={(e) => {
        e.stopPropagation();
        if (params.data) openMnoPdf(params.data.mnoId);
      }}
    >
      <PictureAsPdfIcon fontSize="small" />
    </IconButton>
  );
}

/** Bold MNO name — the row-hover CSS below shifts it to the link color so
 * it reads as clickable, matching the row's own onRowClicked navigation. */
function MnoNameCell(params: ICellRendererParams<OnNetMnoRow>) {
  return <span className="mno-cell-link">{params.value}</span>;
}

function checkOrDash(p: { value: boolean }) {
  return p.value ? "✓" : "-";
}

const EXCLUSIVE_FIELD: Record<"sccp" | "dsx" | "ipx", keyof OnNetMnoRow> = {
  sccp: "isExclusiveSccp",
  dsx: "isExclusiveDsx",
  ipx: "isExclusiveIpx",
};

/** Renders a service column's checkmark as an "Exclusive" pill when this
 * provider is the sole provider declaring that service for the MNO — a
 * plain "✓" (unchanged) when the service is present but shared with at
 * least one other provider, and "-" when absent. Only meaningful for the
 * single-source (IR.21-only or Reach List-only) column set — BOTH mode's
 * split IR.21/Reach List columns don't get this treatment since exclusivity
 * here is computed against the union of both sources, which wouldn't match
 * either split column's own single-source value. */
function serviceCellRenderer(service: "sccp" | "dsx" | "ipx") {
  return function ServiceCell(params: ICellRendererParams<OnNetMnoRow>) {
    if (!params.data?.[service]) return <span style={{ color: "rgba(0,0,0,0.4)" }}>-</span>;
    if (params.data[EXCLUSIVE_FIELD[service]]) {
      return <Chip size="small" label="Exclusive" color="success" sx={{ height: 20, fontSize: 11, fontWeight: 700, "& .MuiChip-label": { px: 0.75 } }} />;
    }
    return <span>✓</span>;
  };
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <Grid item xs={6} sm={4} md={2}>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="overline" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="h5" fontWeight={700}>
            {value}
          </Typography>
        </CardContent>
      </Card>
    </Grid>
  );
}

export default function ProviderDetailPage() {
  return (
    <React.Suspense fallback={null}>
      <ProviderDetailPageInner />
    </React.Suspense>
  );
}

function ProviderDetailPageInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [provider, setProvider] = React.useState<ProviderDetail | null>(null);
  const [inspector, setInspector] = React.useState<ProviderInspectorData | null>(null);
  const [mnoQuery, setMnoQuery] = React.useState("");
  const [exclusiveOnly, setExclusiveOnly] = React.useState(false);

  const urlSource = searchParams.get("source");
  const source: ProviderStatsSource =
    urlSource && VALID_SOURCES.includes(urlSource) ? (urlSource as ProviderStatsSource) : ProviderStatsSource.BOTH;

  React.useEffect(() => {
    setProvider(null);
    setMnoQuery("");
    api.get<ProviderDetail>(`/provider/${params.id}?source=${source}`).then(setProvider);
  }, [params.id, source]);

  const context = SOURCE_CONTEXT[provider?.source ?? source];

  // Client-side — the full footprint (even BICS's 247 MNOs) is already
  // fetched in one shot, so there's no round-trip win to filtering
  // server-side, and this keeps the grid's own "Showing X-Y of Z"
  // pagination footer accurate for free (it counts whatever rowData it's
  // handed).
  const filteredMnos = React.useMemo(() => {
    if (!provider) return [];
    const q = mnoQuery.trim().toLowerCase();
    return provider.onNetMnos.filter((m) => {
      if (exclusiveOnly && !m.isExclusiveAny) return false;
      if (!q) return true;
      return m.operatorName.toLowerCase().includes(q) || m.country.toLowerCase().includes(q) || m.tadigCode.toLowerCase().includes(q);
    });
  }, [provider, mnoQuery, exclusiveOnly]);

  const columnDefs = React.useMemo<ColDef<OnNetMnoRow>[]>(() => {
    const cols: ColDef<OnNetMnoRow>[] = [
      { field: "country", headerName: "Country" },
      { field: "operatorName", headerName: "MNO", flex: 1.5, cellRenderer: MnoNameCell },
      { field: "tadigCode", headerName: "TADIG" },
    ];
    if (source === ProviderStatsSource.BOTH) {
      cols.push(
        { field: "ir21.sccp", headerName: "IR.21 SCCP", cellRenderer: checkOrDash },
        { field: "ir21.dsx", headerName: "IR.21 DSX", cellRenderer: checkOrDash },
        { field: "ir21.ipx", headerName: "IR.21 IPX", cellRenderer: checkOrDash },
        { field: "reachList.sccp", headerName: "Reach List SCCP", cellRenderer: checkOrDash },
        { field: "reachList.dsx", headerName: "Reach List DSX", cellRenderer: checkOrDash },
        { field: "reachList.ipx", headerName: "Reach List IPX", cellRenderer: checkOrDash },
      );
    } else {
      cols.push(
        { field: "sccp", headerName: "SCCP", cellRenderer: serviceCellRenderer("sccp") },
        { field: "dsx", headerName: "DSX", cellRenderer: serviceCellRenderer("dsx") },
        { field: "ipx", headerName: "IPX", cellRenderer: serviceCellRenderer("ipx") },
      );
    }
    cols.push({
      field: "hasPdfDocument",
      headerName: "IR.21 PDF",
      cellRenderer: PdfCell,
      sortable: false,
      filter: false,
      minWidth: 100,
      flex: 0.6,
    });
    cols.push({
      headerName: "Exclusivity",
      colId: "exclusivity",
      minWidth: 130,
      flex: 0.8,
      valueGetter: (p) => {
        const d = p.data;
        if (!d) return "-";
        const exclusive = [d.isExclusiveSccp && "SCCP", d.isExclusiveDsx && "DSX", d.isExclusiveIpx && "IPX"].filter(Boolean);
        return exclusive.length ? exclusive.join(", ") : "-";
      },
    });
    return cols;
  }, [source]);

  return (
    <RequireAuth>
      <AppShell>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.back()}
          sx={{ mb: 2, width: { xs: "100%", sm: "auto" } }}
        >
          Back to search
        </Button>
        {provider && (
          <>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
              <Typography variant="h5" fontWeight={700}>
                {provider.providerName}
              </Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={<FindInPageIcon />}
                onClick={() =>
                  setInspector({
                    providerId: provider.id,
                    providerName: provider.providerName,
                    rawStrings: provider.observedRawStrings,
                    allAliases: provider.aliases,
                  })
                }
                sx={{ minHeight: 44 }}
              >
                Alias &amp; Raw String Details
              </Button>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {provider.providerType} · {provider.headquarters}
            </Typography>

            <Grid container spacing={2} sx={{ mb: 4 }}>
              <StatBox label="Countries" value={provider.stats.totalCountries} />
              <StatBox label="MNOs" value={provider.stats.totalMnos} />
              <StatBox label="SCCP" value={provider.stats.sccpCount} />
              <StatBox label="DSX" value={provider.stats.dsxCount} />
              <StatBox label="IPX" value={provider.stats.ipxCount} />
              <StatBox label="Exclusive MNOs" value={provider.exclusiveMnoCount} />
            </Grid>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5, flexWrap: "wrap" }}>
              <Typography variant="h6" fontWeight={700}>
                {context.heading}
              </Typography>
              <Chip size="small" color={context.chipColor === "default" ? undefined : context.chipColor} label={context.chipLabel} variant={context.chipColor === "default" ? "outlined" : "filled"} />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {context.subtitle}
            </Typography>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", mb: 1.5 }}>
              <TextField
                size="small"
                placeholder="Search served MNO, Country, or TADIG..."
                value={mnoQuery}
                onChange={(e) => setMnoQuery(e.target.value)}
                sx={{ minWidth: 280 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                  endAdornment: mnoQuery && (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setMnoQuery("")} title="Clear search">
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={exclusiveOnly}
                    onChange={(e) => setExclusiveOnly(e.target.checked)}
                    icon={<StarIcon fontSize="small" sx={{ color: "text.disabled" }} />}
                    checkedIcon={<StarIcon fontSize="small" color="success" />}
                  />
                }
                label="Show Exclusive Only"
              />
              {(mnoQuery || exclusiveOnly) && (
                <Typography variant="body2" color="text.secondary">
                  Showing {filteredMnos.length} filtered MNO{filteredMnos.length === 1 ? "" : "s"} (out of{" "}
                  {provider.onNetMnos.length} total)
                </Typography>
              )}
            </Box>

            <Box
              sx={{
                "& .mno-cell-link": { fontWeight: 600 },
                "& .ag-row-hover": { backgroundColor: "#f1f5f9 !important", transition: "background-color 0.15s ease-in-out" },
                "& .ag-row-hover .mno-cell-link": { color: "secondary.main" },
              }}
            >
              <DataGrid<OnNetMnoRow>
                rowData={filteredMnos}
                exportFileName={`${provider.providerName}-on-net-mnos.csv`}
                showTopPagination
                columnDefs={columnDefs}
                onRowClicked={(row) => router.push(`/search/mno/${row.mnoId}`)}
              />
            </Box>
          </>
        )}
        <ProviderInspectorDrawer data={inspector} onClose={() => setInspector(null)} />
      </AppShell>
    </RequireAuth>
  );
}
