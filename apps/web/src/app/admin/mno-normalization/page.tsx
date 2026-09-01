"use client";

import * as React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grid,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import ReadOnlyBanner from "@/components/ReadOnlyBanner";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { CreateMnoFromAuditResult, MnoNormalizationAuditRow, MnoSuggestion, Role } from "@ccip/shared-types";

/** Rows land here one per (provider, operator) pair -- the same
 * unresolved operator declared by 3 different wholesale providers is 3
 * separate audit rows (see UploadService.recordNormalizationAudit).
 * "Create New MNO" must resolve all of them onto one single new MnoMaster,
 * not spawn a duplicate per provider -- this groups by the same identity
 * key the audit table itself is unique on. */
const groupKey = (r: MnoNormalizationAuditRow) => `${r.rawOperatorName}|${r.rawTadigCode}|${r.country}`;

const STATUS_COLOR: Record<string, "warning" | "info"> = {
  PENDING_REVIEW: "warning",
  ALIAS_MATCHED: "info",
};

function MnoPicker({ onPick }: { onPick: (mno: MnoSuggestion) => void }) {
  const [q, setQ] = React.useState("");
  const [options, setOptions] = React.useState<MnoSuggestion[]>([]);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout>>();

  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setOptions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      api.get<MnoSuggestion[]>(`/mno/suggestions?q=${encodeURIComponent(q)}`).then(setOptions).catch(() => setOptions([]));
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  return (
    <Autocomplete
      size="small"
      options={options}
      inputValue={q}
      onInputChange={(_, v) => setQ(v)}
      getOptionLabel={(o) => `${o.operatorName} (${o.tadigCode}) — ${o.country}`}
      onChange={(_, value) => value && onPick(value)}
      sx={{ minWidth: 320 }}
      renderInput={(params) => <TextField {...params} label="Search existing IR.21 MNO to map to..." placeholder="MNO / Cust, TADIG, or country" />}
      noOptionsText={q.trim() ? "No matching MNO" : "Type to search"}
    />
  );
}

export default function MnoNormalizationPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === Role.ADMIN;
  const [rows, setRows] = React.useState<MnoNormalizationAuditRow[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [confirmCreate, setConfirmCreate] = React.useState<{ groupRows: MnoNormalizationAuditRow[] } | null>(null);

  const groups = React.useMemo(() => {
    const byKey = new Map<string, MnoNormalizationAuditRow[]>();
    for (const r of rows) {
      const key = groupKey(r);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(r);
    }
    return byKey;
  }, [rows]);

  const load = React.useCallback(() => {
    api
      .get<MnoNormalizationAuditRow[]>("/mno-normalization/pending")
      .then(setRows)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load"));
  }, []);

  React.useEffect(load, [load]);

  const resolve = async (row: MnoNormalizationAuditRow, mno: MnoSuggestion) => {
    setBusyId(row.id);
    try {
      const result = await api.post<{ recordsCreated: number }>(`/mno-normalization/${row.id}/resolve`, { mnoId: mno.id });
      setToast(`Mapped "${row.rawOperatorName || row.rawTadigCode}" to ${mno.operatorName} (${mno.tadigCode}) — ${result.recordsCreated} record(s) created.`);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to resolve");
    } finally {
      setBusyId(null);
    }
  };

  const createMno = async (groupRows: MnoNormalizationAuditRow[]) => {
    const primary = groupRows[0];
    setConfirmCreate(null);
    setBusyId(primary.id);
    try {
      const result = await api.post<CreateMnoFromAuditResult>("/mno-normalization/create-mno", {
        auditIds: groupRows.map((r) => r.id),
      });
      setToast(
        `Created "${result.operatorName}" (${result.tadigCode}, Reach List Only) — ${result.recordsCreated} record(s) created.`,
      );
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create MNO");
    } finally {
      setBusyId(null);
    }
  };

  const pendingCount = rows.filter((r) => r.matchStatus === "PENDING_REVIEW").length;
  const aliasCount = rows.filter((r) => r.matchStatus === "ALIAS_MATCHED").length;

  return (
    <RequireAuth>
      <AppShell>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
          Unresolved Reach List Aliases
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          GSMA IR.21 is the platform&apos;s sole authoritative source for new MNO records. A Reach List row whose
          operator/TADIG didn&apos;t match an existing IR.21 MNO no longer auto-creates a new one — it lands here
          instead, for an admin to map to the correct existing operator (or leave alone if it&apos;s genuinely new
          and needs its own IR.21 upload).
        </Typography>
        <ReadOnlyBanner />

        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={3}>
            <Card variant="outlined" sx={{ borderTop: 4, borderColor: "#EF6C00" }}>
              <CardContent>
                <Typography variant="overline" color="text.secondary">
                  Pending Review
                </Typography>
                <Typography variant="h5" fontWeight={700}>
                  {pendingCount}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Card variant="outlined" sx={{ borderTop: 4, borderColor: "#0B6FBF" }}>
              <CardContent>
                <Typography variant="overline" color="text.secondary">
                  Auto Alias-Matched
                </Typography>
                <Typography variant="h5" fontWeight={700}>
                  {aliasCount}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {rows.length === 0 && !error && (
          <Alert severity="success">Nothing pending — every Reach List row has resolved to a known IR.21 operator.</Alert>
        )}

        {rows.length > 0 && (
          <TableContainer component="div" sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Status</TableCell>
                  <TableCell>Raw MNO / Cust Name</TableCell>
                  <TableCell>Raw TADIG</TableCell>
                  <TableCell>Country</TableCell>
                  <TableCell>Provider</TableCell>
                  <TableCell>Services</TableCell>
                  <TableCell align="right">Occurrences</TableCell>
                  <TableCell>Auto-Matched To</TableCell>
                  <TableCell>{isAdmin ? "Resolve" : ""}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>
                      <Chip size="small" color={STATUS_COLOR[r.matchStatus] ?? "default"} label={r.matchStatus.replace("_", " ")} />
                    </TableCell>
                    <TableCell>{r.rawOperatorName || <em>—</em>}</TableCell>
                    <TableCell>{r.rawTadigCode || <em>—</em>}</TableCell>
                    <TableCell>{r.country || <em>—</em>}</TableCell>
                    <TableCell>{r.providerName}</TableCell>
                    <TableCell>{r.affectedServices.join(", ")}</TableCell>
                    <TableCell align="right">{r.occurrenceCount}</TableCell>
                    <TableCell>
                      {r.canonicalMnoName ? (
                        <Tooltip title="Auto-matched by country+name — verify this is correct, or pick a different MNO below.">
                          <span>
                            {r.canonicalMnoName} ({r.canonicalMnoTadig})
                          </span>
                        </Tooltip>
                      ) : (
                        <em>—</em>
                      )}
                    </TableCell>
                    <TableCell>
                      {isAdmin ? (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                          <MnoPicker onPick={(mno) => resolve(r, mno)} />
                          <Tooltip title="This operator never had a GSMA IR.21 filing (e.g. an SMS aggregator, SS7 signaling hub, or MVNO) -- creates it as a new MNO visible only under the 'Reach List Only' dataset scope, not mixed into IR.21-verified coverage.">
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<AddCircleOutlineIcon />}
                              disabled={busyId === r.id}
                              onClick={() => setConfirmCreate({ groupRows: groups.get(groupKey(r)) ?? [r] })}
                            >
                              Create New MNO
                            </Button>
                          </Tooltip>
                          {busyId === r.id && <Typography variant="caption">Saving...</Typography>}
                        </Box>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          Admin only
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)} message={toast ?? ""} />

        <Dialog open={!!confirmCreate} onClose={() => setConfirmCreate(null)}>
          <DialogTitle>Create new MNO?</DialogTitle>
          <DialogContent>
            {confirmCreate && (
              <DialogContentText component="div">
                Creates <strong>{confirmCreate.groupRows[0].rawOperatorName || confirmCreate.groupRows[0].rawTadigCode}</strong> (
                {confirmCreate.groupRows[0].country || "unknown country"}) as a new MNO, and attaches its declared
                service(s) from {confirmCreate.groupRows.length} provider record{confirmCreate.groupRows.length === 1 ? "" : "s"}:{" "}
                {confirmCreate.groupRows.map((r) => `${r.providerName} (${r.affectedServices.join(", ")})`).join("; ")}.
                <br />
                <br />
                It will appear under the <strong>Reach List Only</strong> dataset scope on MNO / Cust Search — never
                mixed into IR.21-verified coverage. Use this only when you&apos;ve confirmed this operator genuinely
                has no GSMA IR.21 filing to map to instead.
              </DialogContentText>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmCreate(null)}>Cancel</Button>
            <Button variant="contained" onClick={() => confirmCreate && createMno(confirmCreate.groupRows)}>
              Create MNO
            </Button>
          </DialogActions>
        </Dialog>
      </AppShell>
    </RequireAuth>
  );
}
