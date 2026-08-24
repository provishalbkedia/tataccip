"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import type { ICellRendererParams } from "ag-grid-community";
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
import { OnNetMnoRow, ProviderDetail } from "@ccip/shared-types";

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
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [provider, setProvider] = React.useState<ProviderDetail | null>(null);
  const [inspector, setInspector] = React.useState<ProviderInspectorData | null>(null);

  React.useEffect(() => {
    api.get<ProviderDetail>(`/provider/${params.id}`).then(setProvider);
  }, [params.id]);

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

            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
              On-Net MNO List
            </Typography>
            <DataGrid<OnNetMnoRow>
              rowData={provider.onNetMnos}
              exportFileName={`${provider.providerName}-on-net-mnos.csv`}
              showTopPagination
              columnDefs={[
                { field: "country", headerName: "Country" },
                { field: "operatorName", headerName: "MNO", flex: 1.5 },
                { field: "tadigCode", headerName: "TADIG" },
                {
                  field: "sccp",
                  headerName: "SCCP",
                  cellRenderer: (p: { value: boolean }) => (p.value ? "✓" : ""),
                },
                {
                  field: "dsx",
                  headerName: "DSX",
                  cellRenderer: (p: { value: boolean }) => (p.value ? "✓" : ""),
                },
                {
                  field: "ipx",
                  headerName: "IPX",
                  cellRenderer: (p: { value: boolean }) => (p.value ? "✓" : ""),
                },
                {
                  field: "hasPdfDocument",
                  headerName: "IR.21 PDF",
                  cellRenderer: PdfCell,
                  sortable: false,
                  filter: false,
                  minWidth: 100,
                  flex: 0.6,
                },
              ]}
            />
          </>
        )}
        <ProviderInspectorDrawer data={inspector} onClose={() => setInspector(null)} />
      </AppShell>
    </RequireAuth>
  );
}
