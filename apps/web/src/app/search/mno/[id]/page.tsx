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
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import { MnoDetail } from "@ccip/shared-types";

export default function MnoDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [mno, setMno] = React.useState<MnoDetail | null>(null);

  React.useEffect(() => {
    api.get<MnoDetail>(`/mno/${params.id}`).then(setMno);
  }, [params.id]);

  return (
    <RequireAuth>
      <AppShell>
        <Button startIcon={<ArrowBackIcon />} onClick={() => router.back()} sx={{ mb: 2 }}>
          Back to search
        </Button>
        {mno && (
          <>
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
                      MCC / MNC
                    </Typography>
                    <Typography variant="body1">
                      {mno.mcc} / {mno.mnc}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <Typography variant="overline" color="text.secondary">
                      Status
                    </Typography>
                    <Chip label={mno.status} size="small" color="success" />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
              Connectivity Matrix
            </Typography>
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Service</TableCell>
                    <TableCell>IR.21 Provider</TableCell>
                    <TableCell>Reach List Provider(s)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mno.connectivityMatrix.map((row) => (
                    <TableRow key={row.service}>
                      <TableCell>
                        <Chip label={row.service} size="small" />
                      </TableCell>
                      <TableCell>{row.ir21Provider ?? <em>Not declared</em>}</TableCell>
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

            {mno.connectivitySnapshot && (
              <>
                <Typography variant="h6" fontWeight={700} sx={{ mt: 4, mb: 2 }}>
                  IR.21 XML Connectivity Detail
                </Typography>
                <Card>
                  <CardContent>
                    <Grid container spacing={3}>
                      <Grid item xs={12} sm={6} md={4}>
                        <Typography variant="overline" color="text.secondary">
                          Network Type
                        </Typography>
                        <Typography variant="body2">
                          {mno.connectivitySnapshot.networkType ?? <em>Not declared</em>}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={6} md={4}>
                        <Typography variant="overline" color="text.secondary">
                          MCC / MNC
                        </Typography>
                        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
                          {mno.connectivitySnapshot.mccMncList.length > 0 ? (
                            mno.connectivitySnapshot.mccMncList.map((m) => <Chip key={m} label={m} size="small" />)
                          ) : (
                            <Typography variant="body2">
                              <em>None parsed</em>
                            </Typography>
                          )}
                        </Box>
                      </Grid>
                      <Grid item xs={12} sm={6} md={4}>
                        <Typography variant="overline" color="text.secondary">
                          Primary SCCP Carrier
                        </Typography>
                        <Typography variant="body2">
                          {mno.connectivitySnapshot.primarySccpCarrier ?? <em>Not declared</em>}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={6} md={4}>
                        <Typography variant="overline" color="text.secondary">
                          Backup SCCP Carriers
                        </Typography>
                        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
                          {mno.connectivitySnapshot.backupSccpCarriers.length > 0 ? (
                            mno.connectivitySnapshot.backupSccpCarriers.map((c) => (
                              <Chip key={c} label={c} size="small" variant="outlined" />
                            ))
                          ) : (
                            <Typography variant="body2">
                              <em>None</em>
                            </Typography>
                          )}
                        </Box>
                      </Grid>
                      <Grid item xs={12} sm={6} md={4}>
                        <Typography variant="overline" color="text.secondary">
                          SCCP Point Codes (DPCs)
                        </Typography>
                        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
                          {mno.connectivitySnapshot.sccpPointCodes.length > 0 ? (
                            mno.connectivitySnapshot.sccpPointCodes.map((c) => <Chip key={c} label={c} size="small" />)
                          ) : (
                            <Typography variant="body2">
                              <em>None</em>
                            </Typography>
                          )}
                        </Box>
                      </Grid>
                      <Grid item xs={12} sm={6} md={4}>
                        <Typography variant="overline" color="text.secondary">
                          GRX/IPX Providers
                        </Typography>
                        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
                          {mno.connectivitySnapshot.grxIpxProviders.length > 0 ? (
                            mno.connectivitySnapshot.grxIpxProviders.map((p) => <Chip key={p} label={p} size="small" />)
                          ) : (
                            <Typography variant="body2">
                              <em>None</em>
                            </Typography>
                          )}
                        </Box>
                      </Grid>
                      <Grid item xs={12} sm={6} md={4}>
                        <Typography variant="overline" color="text.secondary">
                          LTE IPX Providers
                        </Typography>
                        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
                          {mno.connectivitySnapshot.lteIpxProviders.length > 0 ? (
                            mno.connectivitySnapshot.lteIpxProviders.map((p) => <Chip key={p} label={p} size="small" />)
                          ) : (
                            <Typography variant="body2">
                              <em>None</em>
                            </Typography>
                          )}
                        </Box>
                      </Grid>
                      <Grid item xs={12} sm={6} md={4}>
                        <Typography variant="overline" color="text.secondary">
                          Inter-PMN Backbone IP Ranges
                        </Typography>
                        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
                          {mno.connectivitySnapshot.interPmnIpRanges.length > 0 ? (
                            mno.connectivitySnapshot.interPmnIpRanges.map((ip) => <Chip key={ip} label={ip} size="small" />)
                          ) : (
                            <Typography variant="body2">
                              <em>None</em>
                            </Typography>
                          )}
                        </Box>
                      </Grid>
                      <Grid item xs={12} sm={6} md={4}>
                        <Typography variant="overline" color="text.secondary">
                          Diameter Edge Agent FQDN
                        </Typography>
                        <Typography variant="body2">
                          {mno.connectivitySnapshot.diameterEdgeAgentFqdn ?? <em>Not declared</em>}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={6} md={4}>
                        <Typography variant="overline" color="text.secondary">
                          Authoritative DNS IPs
                        </Typography>
                        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
                          {mno.connectivitySnapshot.authoritativeDnsIps.length > 0 ? (
                            mno.connectivitySnapshot.authoritativeDnsIps.map((ip) => <Chip key={ip} label={ip} size="small" />)
                          ) : (
                            <Typography variant="body2">
                              <em>None</em>
                            </Typography>
                          )}
                        </Box>
                      </Grid>
                      <Grid item xs={12} sm={6} md={4}>
                        <Typography variant="overline" color="text.secondary">
                          EPC Realms
                        </Typography>
                        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
                          {mno.connectivitySnapshot.epcRealms.length > 0 ? (
                            mno.connectivitySnapshot.epcRealms.map((r) => <Chip key={r} label={r} size="small" />)
                          ) : (
                            <Typography variant="body2">
                              <em>None</em>
                            </Typography>
                          )}
                        </Box>
                      </Grid>
                      <Grid item xs={12} sm={6} md={4}>
                        <Typography variant="overline" color="text.secondary">
                          Roaming Contact Email
                        </Typography>
                        <Typography variant="body2">
                          {mno.connectivitySnapshot.roamingContactEmail ?? <em>Not declared</em>}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={6} md={4}>
                        <Typography variant="overline" color="text.secondary">
                          Source File Version / Parsed
                        </Typography>
                        <Typography variant="body2">
                          {mno.connectivitySnapshot.xmlFileVersion ?? "—"} · last parsed{" "}
                          {new Date(mno.connectivitySnapshot.lastParsedAt).toLocaleString()}
                        </Typography>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}
      </AppShell>
    </RequireAuth>
  );
}
