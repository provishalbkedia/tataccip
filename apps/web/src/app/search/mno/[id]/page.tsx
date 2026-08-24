"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import ProviderInspectorDrawer, { ProviderInspectorData } from "@/components/ProviderInspectorDrawer";
import { api, ApiError } from "@/lib/api";
import { MnoDetail } from "@ccip/shared-types";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Grid item xs={12} sm={6} md={4}>
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2">{value ?? <em>Not declared</em>}</Typography>
    </Grid>
  );
}

function ChipListField({ label, values }: { label: string; values: string[] }) {
  return (
    <Grid item xs={12} sm={6} md={4}>
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
        {values.length > 0 ? (
          values.map((v) => <Chip key={v} label={v} size="small" />)
        ) : (
          <Typography variant="body2">
            <em>None</em>
          </Typography>
        )}
      </Box>
    </Grid>
  );
}

export default function MnoDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [mno, setMno] = React.useState<MnoDetail | null>(null);
  const [inspector, setInspector] = React.useState<ProviderInspectorData | null>(null);
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null);
  const [pdfOpen, setPdfOpen] = React.useState(false);
  const [pdfLoading, setPdfLoading] = React.useState(false);

  React.useEffect(() => {
    api.get<MnoDetail>(`/mno/${params.id}`).then(setMno);
  }, [params.id]);

  // Blob URLs are only valid for this page's lifetime — revoke on unmount
  // (and before fetching a new one) to avoid leaking memory.
  React.useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  async function togglePdf() {
    if (pdfOpen) {
      setPdfOpen(false);
      return;
    }
    if (pdfUrl) {
      setPdfOpen(true);
      return;
    }
    setPdfLoading(true);
    try {
      const blob = await api.getBlob(`/mno/${params.id}/pdf`);
      setPdfUrl(URL.createObjectURL(blob));
      setPdfOpen(true);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to load PDF");
    } finally {
      setPdfLoading(false);
    }
  }

  const snap = mno?.connectivitySnapshot ?? null;

  return (
    <RequireAuth>
      <AppShell>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => router.back()}>
            Back to search
          </Button>
          {mno?.hasPdfDocument && (
            <Button
              variant="contained"
              color="error"
              startIcon={<PictureAsPdfIcon />}
              onClick={togglePdf}
              disabled={pdfLoading}
            >
              {pdfLoading ? "Loading…" : pdfOpen ? "Hide Original IR.21 PDF" : "View Original IR.21 PDF"}
            </Button>
          )}
        </Box>
        {mno && (
          <>
            {pdfOpen && pdfUrl && (
              <Card sx={{ mb: 3 }}>
                <Box sx={{ height: 800 }}>
                  <iframe src={pdfUrl} title="IR.21 PDF" style={{ width: "100%", height: "100%", border: "none" }} />
                </Box>
              </Card>
            )}
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}>
                    <Typography variant="overline" color="text.secondary">
                      Operator
                    </Typography>
                    <Typography variant="h6">{mno.operatorName}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <Typography variant="overline" color="text.secondary">
                      Country
                    </Typography>
                    <Typography variant="body1">{mno.country}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <Typography variant="overline" color="text.secondary">
                      TADIG
                    </Typography>
                    <Typography variant="body1">{mno.tadigCode}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <Typography variant="overline" color="text.secondary">
                      Network Type
                    </Typography>
                    <Typography variant="body1">{mno.networkType ?? <em>Not declared</em>}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <Typography variant="overline" color="text.secondary">
                      Status
                    </Typography>
                    <Chip label={mno.status} size="small" color="success" />
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="overline" color="text.secondary">
                      MCC / MNC
                    </Typography>
                    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
                      {snap && snap.mccMncList.length > 0 ? (
                        snap.mccMncList.map((m) => <Chip key={m} label={m} size="small" />)
                      ) : (
                        <Typography variant="body2">
                          {mno.mcc} / {mno.mnc}
                        </Typography>
                      )}
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            {snap && (
              <>
                <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                  Roaming Signaling
                </Typography>
                <Card sx={{ mb: 3 }}>
                  <CardContent>
                    <Grid container spacing={3}>
                      <Field label="Primary SCCP Carrier" value={snap.primarySccpCarrier} />
                      <ChipListField label="Backup SCCP Carriers" values={snap.backupSccpCarriers} />
                      <ChipListField label="Point Codes (DPC)" values={snap.sccpPointCodes} />
                    </Grid>
                  </CardContent>
                </Card>

                <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                  Data &amp; LTE Roaming
                </Typography>
                <Card sx={{ mb: 3 }}>
                  <CardContent>
                    <Grid container spacing={3}>
                      <ChipListField label="GRX/IPX Providers" values={snap.grxIpxProviders} />
                      <ChipListField label="LTE IPX / Diameter Providers" values={snap.lteIpxProviders} />
                      <Field label="Diameter Edge Agent FQDN" value={snap.diameterEdgeAgentFqdn} />
                      <ChipListField label="Authoritative DNS IPs" values={snap.authoritativeDnsIps} />
                      <ChipListField label="Inter-PMN Backbone IP Ranges" values={snap.interPmnIpRanges} />
                      <ChipListField label="EPC Realms" values={snap.epcRealms} />
                    </Grid>
                  </CardContent>
                </Card>

                <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                  Operational Contacts
                </Typography>
                <Card sx={{ mb: 3 }}>
                  <CardContent>
                    <Grid container spacing={3}>
                      <Field label="Roaming Coordinator" value={snap.roamingCoordinatorEmail} />
                      <Field label="24x7 Team Email" value={snap.ts24x7Email} />
                      <Field label="Distribution Email" value={snap.distributionEmail} />
                      <Field
                        label="Source File Version / Parsed"
                        value={`${snap.xmlFileVersion ?? "—"} · last parsed ${new Date(snap.lastParsedAt).toLocaleString()}`}
                      />
                    </Grid>
                  </CardContent>
                </Card>
              </>
            )}

            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
              Comparison Grid
            </Typography>
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Service</TableCell>
                    <TableCell>As per IR.21 Database</TableCell>
                    <TableCell>Reach List Claimed Provider(s)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mno.connectivityMatrix.map((row) => (
                    <TableRow key={row.service}>
                      <TableCell>
                        <Chip label={row.service} size="small" />
                      </TableCell>
                      <TableCell>
                        {row.ir21Provider ? (
                          <Chip
                            label={row.ir21Provider}
                            size="small"
                            variant="outlined"
                            clickable={!!row.ir21ProviderResolution}
                            onClick={
                              row.ir21ProviderResolution
                                ? () =>
                                    setInspector({
                                      providerId: row.ir21ProviderResolution!.canonicalProviderId,
                                      providerName: row.ir21ProviderResolution!.canonicalProviderName,
                                      rawStrings: row.ir21ProviderResolution!.rawDeclaredStrings,
                                      resolvedViaAlias: row.ir21ProviderResolution!.resolvedViaAlias,
                                    })
                                : undefined
                            }
                          />
                        ) : (
                          <em>Not declared</em>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.reachlistProviders.length > 0 ? (
                          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                            {row.reachlistProviders.map((p) => (
                              <Chip
                                key={p}
                                label={p}
                                size="small"
                                color={p === row.ir21Provider ? "success" : "warning"}
                                variant="outlined"
                              />
                            ))}
                          </Box>
                        ) : (
                          <em>Not found</em>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
        <ProviderInspectorDrawer data={inspector} onClose={() => setInspector(null)} />
      </AppShell>
    </RequireAuth>
  );
}
