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
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
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
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            justifyContent: "space-between",
            alignItems: { xs: "stretch", sm: "center" },
            gap: 1,
            mb: 2,
          }}
        >
          <Button startIcon={<ArrowBackIcon />} onClick={() => router.back()} sx={{ width: { xs: "100%", sm: "auto" } }}>
            Back to search
          </Button>
          {mno?.hasPdfDocument && (
            <Button
              variant="contained"
              color="error"
              startIcon={<PictureAsPdfIcon />}
              onClick={togglePdf}
              disabled={pdfLoading}
              sx={{ width: { xs: "100%", sm: "auto" } }}
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
                      MNO / Cust
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
                    {mno.secondaryTadigs.length > 0 && (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Also: {mno.secondaryTadigs.join(", ")}
                        </Typography>
                        <Tooltip title="Indicates alternate or legacy TADIG codes mapped to this canonical operator.">
                          <InfoOutlinedIcon fontSize="small" sx={{ color: "text.disabled", fontSize: 14 }} />
                        </Tooltip>
                      </Box>
                    )}
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

            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
              Interconnect Comparison (IR.21 Declared vs Reach List Claimed)
            </Typography>
            <TableContainer component={Paper} sx={{ mb: 3 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Service</TableCell>
                    <TableCell>As per IR.21 Database</TableCell>
                    <TableCell>Reach List Claimed Provider(s)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mno.connectivityMatrix.map((row) => {
                    const reachNames = new Set(row.reachlistProviders);
                    const ir21Names = new Set(row.ir21Providers.map((p) => p.name));
                    const matchedCount = row.ir21Providers.filter((p) => reachNames.has(p.name)).length;
                    const totalDistinct = new Set([...ir21Names, ...reachNames]).size;
                    const discrepancyCount = totalDistinct - matchedCount;

                    return (
                      <TableRow key={row.service}>
                        <TableCell sx={{ verticalAlign: "top" }}>
                          <Chip label={row.service} size="small" />
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                            {row.ir21Providers.length} IR.21 Declared vs {row.reachlistProviders.length} Reach List
                            Claimed ({matchedCount} Matched
                            {discrepancyCount > 0 ? `, ${discrepancyCount} Discrepancy` : ""})
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {row.ir21Providers.length > 0 ? (
                            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                              {row.ir21Providers.map((p) => (
                                <Chip
                                  key={p.id}
                                  label={p.name}
                                  size="small"
                                  variant="outlined"
                                  color={reachNames.has(p.name) ? "success" : "info"}
                                  clickable
                                  onClick={() =>
                                    setInspector({
                                      providerId: p.id,
                                      providerName: p.name,
                                      rawStrings: p.rawDeclaredString ? [p.rawDeclaredString] : [],
                                      resolvedViaAlias: p.isPrimary
                                        ? row.ir21ProviderResolution?.resolvedViaAlias
                                        : undefined,
                                    })
                                  }
                                />
                              ))}
                            </Box>
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
                                  color={ir21Names.has(p) ? "success" : "warning"}
                                  variant="outlined"
                                />
                              ))}
                            </Box>
                          ) : (
                            <em>Not found</em>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

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
                      <ChipListField label="MNO's ASNs for GRX/IPX" values={snap.mnoAsNumbers} />
                      <ChipListField label="Provider ASNs" values={snap.providerAsNumbers} />
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
          </>
        )}
        <ProviderInspectorDrawer data={inspector} onClose={() => setInspector(null)} />
      </AppShell>
    </RequireAuth>
  );
}
