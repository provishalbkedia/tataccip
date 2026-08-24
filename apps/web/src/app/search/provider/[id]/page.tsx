"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { Box, Button, Card, CardContent, Chip, Grid, IconButton, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import FindInPageIcon from "@mui/icons-material/FindInPage";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
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
    subtitle: "Showing MNOs that officially declared this carrier in their GSMA IR.21 XML documents.",
  },
  [ProviderStatsSource.REACH_LIST]: {
    heading: "Claimed MNO Footprint (As per Published Reach Lists)",
    chipLabel: "Reach List Claimed",
    chipColor: "secondary",
    subtitle: "Showing MNOs claimed by this carrier in their published commercial reach lists.",
  },
  [ProviderStatsSource.BOTH]: {
    heading: "Consolidated Footprint (IR.21 vs Reach List Combined)",
    chipLabel: "IR.21 + Reach List",
    chipColor: "default",
    subtitle: "Combining both sources — the IR.21/Reach List columns below show which source(s) actually declared each service.",
  },
};

/** stopPropagation so clicking the PDF icon doesn't also trigger any
 * row-click handler on the grid (none is wired here today, but this
 * matches the same pattern used in Operator Search's PDF column). */
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

function checkOrDash(p: { value: boolean }) {
  return p.value ? "✓" : "-";
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <Grid item xs={6} sm={2.4}>
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

  const urlSource = searchParams.get("source");
  const source: ProviderStatsSource =
    urlSource && VALID_SOURCES.includes(urlSource) ? (urlSource as ProviderStatsSource) : ProviderStatsSource.BOTH;

  React.useEffect(() => {
    setProvider(null);
    api.get<ProviderDetail>(`/provider/${params.id}?source=${source}`).then(setProvider);
  }, [params.id, source]);

  const context = SOURCE_CONTEXT[provider?.source ?? source];

  const columnDefs = React.useMemo<ColDef<OnNetMnoRow>[]>(() => {
    const cols: ColDef<OnNetMnoRow>[] = [
      { field: "country", headerName: "Country" },
      { field: "operatorName", headerName: "MNO", flex: 1.5 },
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
        { field: "sccp", headerName: "SCCP", cellRenderer: checkOrDash },
        { field: "dsx", headerName: "DSX", cellRenderer: checkOrDash },
        { field: "ipx", headerName: "IPX", cellRenderer: checkOrDash },
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
    return cols;
  }, [source]);

  return (
    <RequireAuth>
      <AppShell>
        <Button startIcon={<ArrowBackIcon />} onClick={() => router.back()} sx={{ mb: 2 }}>
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
            <DataGrid<OnNetMnoRow>
              rowData={provider.onNetMnos}
              exportFileName={`${provider.providerName}-on-net-mnos.csv`}
              showTopPagination
              columnDefs={columnDefs}
            />
          </>
        )}
        <ProviderInspectorDrawer data={inspector} onClose={() => setInspector(null)} />
      </AppShell>
    </RequireAuth>
  );
}
