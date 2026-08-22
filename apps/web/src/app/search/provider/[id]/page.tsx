"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Box, Button, Card, CardContent, Chip, Grid, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import FindInPageIcon from "@mui/icons-material/FindInPage";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import DataGrid from "@/components/DataGrid";
import ProviderInspectorDrawer, { ProviderInspectorData } from "@/components/ProviderInspectorDrawer";
import { api } from "@/lib/api";
import { OnNetMnoRow, ProviderDetail } from "@ccip/shared-types";

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
              ]}
            />
          </>
        )}
        <ProviderInspectorDrawer data={inspector} onClose={() => setInspector(null)} />
      </AppShell>
    </RequireAuth>
  );
}
