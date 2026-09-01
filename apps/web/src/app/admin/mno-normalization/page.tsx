"use client";

import * as React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grid,
  IconButton,
  Paper,
  Slide,
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
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import BlockIcon from "@mui/icons-material/Block";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ClearIcon from "@mui/icons-material/Clear";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import ReadOnlyBanner from "@/components/ReadOnlyBanner";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import {
  BulkResolveAction,
  BulkResolveResult,
  CreateMnoFromAuditResult,
  MnoNormalizationAuditRow,
  MnoSuggestion,
  Role,
} from "@ccip/shared-types";

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
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [mapToMno, setMapToMno] = React.useState<MnoSuggestion | null>(null);
  const [mapToMnoQuery, setMapToMnoQuery] = React.useState("");
  const [mapToMnoOptions, setMapToMnoOptions] = React.useState<MnoSuggestion[]>([]);
  const mapToMnoDebounceRef = React.useRef<ReturnType<typeof setTimeout>>();

  React.useEffect(() => {
    if (mapToMnoDebounceRef.current) clearTimeout(mapToMnoDebounceRef.current);
    if (!mapToMnoQuery.trim()) {
      setMapToMnoOptions([]);
      return;
    }
    mapToMnoDebounceRef.current = setTimeout(() => {
      api
        .get<MnoSuggestion[]>(`/mno/suggestions?q=${encodeURIComponent(mapToMnoQuery)}`)
        .then(setMapToMnoOptions)
        .catch(() => setMapToMnoOptions([]));
    }, 250);
    return () => {
      if (mapToMnoDebounceRef.current) clearTimeout(mapToMnoDebounceRef.current);
    };
  }, [mapToMnoQuery]);

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

  // Rows that resolved/vanished after a reload (bulk action, single
  // resolve, another admin acting concurrently) shouldn't linger as
  // "selected" -- keeps the counter and the header checkbox's
  // all/indeterminate state honest against what's actually still on screen.
  React.useEffect(() => {
    setSelected((prev) => {
      const rowIds = new Set(rows.map((r) => r.id));
      const next = new Set([...prev].filter((id) => rowIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

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

  const selectedRows = React.useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && !allSelected;
  const suggestionCount = selectedRows.filter((r) => r.canonicalMnoName).length;

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  };

  const clearSelection = () => {
    setSelected(new Set());
    setMapToMno(null);
    setMapToMnoQuery("");
  };

  const ACTION_LABEL: Record<BulkResolveAction, string> = {
    ACCEPT_SUGGESTIONS: "accepted",
    MAP_TO_CANONICAL: "mapped",
    IGNORE: "marked reviewed",
    DELETE: "dismissed",
  };

  const runBulkAction = async (action: BulkResolveAction, targetMnoId?: number, targetLabel?: string) => {
    const auditIds = [...selected];
    setBulkBusy(true);
    setConfirmDelete(false);
    try {
      const result = await api.post<BulkResolveResult>("/mno-normalization/bulk-resolve", { action, auditIds, targetMnoId });
      const target = targetLabel ? ` to ${targetLabel}` : "";
      const skippedNote = result.skippedCount > 0 ? ` (${result.skippedCount} skipped -- not applicable to this action)` : "";
      setToast(`Successfully ${ACTION_LABEL[action]} ${result.updatedCount} alias(es)${target}${skippedNote}.`);
      clearSelection();
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Bulk action failed");
    } finally {
      setBulkBusy(false);
    }
  };

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

        {rows.length > 0 && isAdmin && (
          <Box sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1, minHeight: 28 }}>
            {selected.size > 0 ? (
              <Typography variant="body2" color="text.secondary">
                {selected.size} alias{selected.size === 1 ? "" : "es"} selected
                {allSelected && ` (all ${rows.length} pending aliases)`}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.disabled">
                Select rows below to act on several at once.
              </Typography>
            )}
          </Box>
        )}

        {rows.length > 0 && (
          <TableContainer component="div" sx={{ overflowX: "auto", pb: selected.size > 0 ? 10 : 0 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {isAdmin && (
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={someSelected}
                        onChange={toggleAll}
                        inputProps={{ "aria-label": "Select all pending aliases" }}
                      />
                    </TableCell>
                  )}
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
                  <TableRow
                    key={r.id}
                    hover
                    onClick={() => isAdmin && toggleRow(r.id)}
                    selected={selected.has(r.id)}
                    sx={{
                      cursor: isAdmin ? "pointer" : undefined,
                      "&.Mui-selected": { backgroundColor: "rgba(11, 111, 191, 0.08)" },
                      "&.Mui-selected:hover": { backgroundColor: "rgba(11, 111, 191, 0.12)" },
                    }}
                  >
                    {isAdmin && (
                      <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(r.id)}
                          onChange={() => toggleRow(r.id)}
                          inputProps={{ "aria-label": `Select ${r.rawOperatorName || r.rawTadigCode}` }}
                        />
                      </TableCell>
                    )}
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
                    <TableCell onClick={(e) => e.stopPropagation()}>
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

        <Slide direction="up" in={selected.size > 0} mountOnEnter unmountOnExit>
          <Paper
            elevation={6}
            sx={{
              position: "fixed",
              bottom: 16,
              left: "50%",
              transform: "translateX(-50%)",
              px: 2.5,
              py: 1.5,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 1.5,
              zIndex: 1200,
              borderRadius: 3,
              maxWidth: "94vw",
              bgcolor: "#0A2540",
              color: "#fff",
            }}
          >
            <Typography variant="body2" fontWeight={600} sx={{ mr: 0.5, whiteSpace: "nowrap" }}>
              {selected.size} selected
            </Typography>

            {bulkBusy ? (
              <CircularProgress size={20} sx={{ color: "#00D4B2", mx: 2 }} />
            ) : (
              <>
                <Tooltip title={suggestionCount === 0 ? "None of the selected rows have an existing suggestion to accept" : "Map every selected row to its own suggested MNO"}>
                  <span>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<CheckCircleOutlineIcon />}
                      disabled={suggestionCount === 0}
                      onClick={() => runBulkAction("ACCEPT_SUGGESTIONS")}
                      sx={{ bgcolor: "#00D4B2", color: "#0A2540", "&:hover": { bgcolor: "#00b89a" } }}
                    >
                      Accept Auto-Matches ({suggestionCount})
                    </Button>
                  </span>
                </Tooltip>

                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <Autocomplete
                    size="small"
                    value={mapToMno}
                    onChange={(_, v) => setMapToMno(v)}
                    options={mapToMnoOptions}
                    inputValue={mapToMnoQuery}
                    onInputChange={(_, v) => setMapToMnoQuery(v)}
                    getOptionLabel={(o) => `${o.operatorName} (${o.tadigCode}) — ${o.country}`}
                    noOptionsText={mapToMnoQuery.trim() ? "No matching MNO" : "Type to search"}
                    sx={{
                      minWidth: 260,
                      bgcolor: "#fff",
                      borderRadius: 1,
                      "& .MuiOutlinedInput-root": { color: "#0A2540" },
                    }}
                    renderInput={(params) => <TextField {...params} placeholder="Map to MNO..." />}
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!mapToMno}
                    onClick={() => mapToMno && runBulkAction("MAP_TO_CANONICAL", mapToMno.id, `${mapToMno.operatorName} (${mapToMno.tadigCode})`)}
                    sx={{ borderColor: "#fff", color: "#fff", whiteSpace: "nowrap" }}
                  >
                    Apply Mapping
                  </Button>
                </Box>

                <Button
                  size="small"
                  startIcon={<BlockIcon />}
                  onClick={() => runBulkAction("IGNORE")}
                  sx={{ color: "#fff" }}
                >
                  Ignore / Mark Reviewed
                </Button>

                <Button
                  size="small"
                  color="error"
                  variant="outlined"
                  startIcon={<DeleteOutlineIcon />}
                  onClick={() => setConfirmDelete(true)}
                  sx={{ borderColor: "#EF5350", color: "#EF5350" }}
                >
                  Dismiss Selected
                </Button>

                <Tooltip title="Deselect all">
                  <IconButton size="small" onClick={clearSelection} sx={{ color: "#fff" }}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Paper>
        </Slide>

        <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)} message={toast ?? ""} />

        <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)}>
          <DialogTitle>Dismiss {selected.size} selected alias{selected.size === 1 ? "" : "es"}?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              This permanently removes the selected row(s) from Unresolved Reach List Aliases. Nothing is mapped or
              created — if the same (provider, operator, TADIG) combination appears in a future Reach List upload, a
              fresh entry is queued again. This cannot be undone.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button color="error" variant="contained" onClick={() => runBulkAction("DELETE")}>
              Dismiss {selected.size}
            </Button>
          </DialogActions>
        </Dialog>

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
