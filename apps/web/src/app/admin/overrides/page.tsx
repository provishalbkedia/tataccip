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
  DialogTitle,
  Grid,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import { api, ApiError } from "@/lib/api";
import { MnoProviderOverrideRow, ProviderNormalizationCard, ProviderSummary, Role } from "@ccip/shared-types";

function EditOverrideDialog({
  override,
  providers,
  onClose,
  onSaved,
}: {
  override: MnoProviderOverrideRow | null;
  providers: ProviderSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [providerId, setProviderId] = React.useState<number | null>(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (override) {
      setProviderId(override.overrideProviderId);
      setNote(override.reasonNote ?? "");
      setError(null);
    }
  }, [override]);

  async function handleSave() {
    if (!override || !providerId) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/provider-overrides/batch", {
        service: override.serviceName,
        entries: [
          {
            tadigCode: override.tadigCode,
            providerId,
            reasonNote: note.trim() || undefined,
            originalRawString: override.originalRawString,
          },
        ],
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!override} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        Edit Override — {override?.operatorName} ({override?.tadigCode})
      </DialogTitle>
      <DialogContent>
        <Autocomplete
          sx={{ mt: 1, mb: 2 }}
          options={providers}
          getOptionLabel={(p) => p.providerName}
          value={providers.find((p) => p.id === providerId) ?? null}
          onChange={(_, v) => setProviderId(v?.id ?? null)}
          disabled={busy}
          renderInput={(params) => <TextField {...params} label="Override Provider" />}
        />
        <TextField
          fullWidth
          multiline
          minRows={2}
          label="Reason / Audit Note"
          value={note}
          disabled={busy}
          onChange={(e) => setNote(e.target.value)}
        />
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={busy || !providerId} onClick={handleSave}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function OverridesLogTab() {
  const [overrides, setOverrides] = React.useState<MnoProviderOverrideRow[]>([]);
  const [providers, setProviders] = React.useState<ProviderSummary[]>([]);
  const [editing, setEditing] = React.useState<MnoProviderOverrideRow | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    api
      .get<MnoProviderOverrideRow[]>("/provider-overrides")
      .then(setOverrides)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load overrides"));
    api.get<ProviderSummary[]>("/provider/search").then(setProviders).catch(() => {});
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function handleRevert(id: string) {
    if (!confirm("Revert this override? The (MNO, service) will be re-resolved from its raw XML-declared text.")) return;
    setBusyId(id);
    try {
      await api.delete(`/provider-overrides/${id}`);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Revert failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Every active per-(MNO, service) override — re-applied automatically on every future IR.21 XML
        re-ingestion of that TADIG, taking priority over normal alias resolution.
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {overrides.length === 0 && !error && <Alert severity="info">No active operator-level overrides.</Alert>}
      {overrides.length > 0 && (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Operator (TADIG)</TableCell>
                <TableCell>Country</TableCell>
                <TableCell>Service</TableCell>
                <TableCell>Original Raw String</TableCell>
                <TableCell>Active Override Provider</TableCell>
                <TableCell>Reason / Note</TableCell>
                <TableCell>Last Updated</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {overrides.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    {o.operatorName} ({o.tadigCode})
                  </TableCell>
                  <TableCell>{o.country}</TableCell>
                  <TableCell>
                    <Chip size="small" label={o.serviceName} variant="outlined" />
                  </TableCell>
                  <TableCell>{o.originalRawString || "—"}</TableCell>
                  <TableCell>
                    <Chip size="small" color="primary" label={o.overrideProviderName} />
                  </TableCell>
                  <TableCell sx={{ maxWidth: 220 }}>{o.reasonNote || "—"}</TableCell>
                  <TableCell>
                    <Typography variant="caption" display="block">
                      {o.updatedBy}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(o.updatedAt).toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Edit Mapping">
                      <IconButton size="small" onClick={() => setEditing(o)} disabled={busyId === o.id}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Revert / Delete Rule (restores raw XML baseline)">
                      <IconButton size="small" color="error" disabled={busyId === o.id} onClick={() => handleRevert(o.id)}>
                        <RestartAltIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <EditOverrideDialog override={editing} providers={providers} onClose={() => setEditing(null)} onSaved={load} />
    </Box>
  );
}

function ReassignAliasDialog({
  alias,
  providers,
  onClose,
  onSaved,
}: {
  alias: { id: string; aliasPattern: string } | null;
  providers: ProviderSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [providerId, setProviderId] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setProviderId(null);
    setError(null);
  }, [alias]);

  async function handleSave() {
    if (!alias || !providerId) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/provider-aliases/alias/${alias.id}/reassign`, { targetProviderId: providerId });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Reassign failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!alias} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Reassign Alias &quot;{alias?.aliasPattern}&quot;</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Moves this alias to a different canonical provider and retroactively repoints every matching
          MNO&apos;s connectivity, not just future uploads.
        </Typography>
        <Autocomplete
          options={providers}
          getOptionLabel={(p) => p.providerName}
          value={providers.find((p) => p.id === providerId) ?? null}
          onChange={(_, v) => setProviderId(v?.id ?? null)}
          disabled={busy}
          renderInput={(params) => <TextField {...params} label="Target Provider" />}
        />
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={busy || !providerId} onClick={handleSave}>
          Reassign
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AddAliasDialog({
  providerId,
  providerName,
  onClose,
  onSaved,
}: {
  providerId: number | null;
  providerName: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pattern, setPattern] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setPattern("");
    setError(null);
  }, [providerId]);

  async function handleSave() {
    if (!providerId || !pattern.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/provider-aliases/alias", { providerId, aliasPattern: pattern.trim() });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Add alias failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!providerId} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add Alias / Variant to &quot;{providerName}&quot;</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          sx={{ mt: 1 }}
          label="Raw spelling variant (e.g. FT, France Telecom)"
          value={pattern}
          disabled={busy}
          onChange={(e) => setPattern(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
          }}
        />
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={busy || !pattern.trim()} onClick={handleSave}>
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AliasDictionaryTab() {
  const [cards, setCards] = React.useState<ProviderNormalizationCard[]>([]);
  const [providers, setProviders] = React.useState<ProviderSummary[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [reassigning, setReassigning] = React.useState<{ id: string; aliasPattern: string } | null>(null);
  const [addingTo, setAddingTo] = React.useState<{ id: number; name: string } | null>(null);

  const load = React.useCallback(() => {
    api
      .get<ProviderNormalizationCard[]>("/provider-aliases/dictionary")
      .then(setCards)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load alias dictionary"));
    api.get<ProviderSummary[]>("/provider/search").then(setProviders).catch(() => {});
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(aliasId: string) {
    if (!confirm("Detach this alias? Future occurrences of this raw string will go back to the Unmapped queue.")) return;
    try {
      await api.delete(`/provider-aliases/alias/${aliasId}`);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed");
    }
  }

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(
      (c) => c.providerName.toLowerCase().includes(q) || c.aliases.some((a) => a.aliasPattern.includes(q)),
    );
  }, [cards, search]);

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        How raw/duplicate declared provider strings consolidate into each canonical provider — e.g.
        &quot;FT&quot;, &quot;France Telecom&quot;, &quot;Orange IC&quot; all normalize under Orange.
        Occurrence counts are computed live from the active IR.21 dataset.
      </Typography>
      <TextField
        fullWidth
        size="small"
        placeholder="Search provider or alias..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 2, maxWidth: 400 }}
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Grid container spacing={2}>
        {filtered.map((card) => (
          <Grid item xs={12} md={6} lg={4} key={card.providerId}>
            <Card variant="outlined" sx={{ height: "100%" }}>
              <CardContent>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                  <Typography variant="subtitle1" fontWeight={700}>
                    {card.providerName}
                  </Typography>
                  <Tooltip title="Add Alias / Variant">
                    <IconButton size="small" onClick={() => setAddingTo({ id: card.providerId, name: card.providerName })}>
                      <AddIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {card.aliases.map((a) => (
                    <Chip
                      key={a.id}
                      size="small"
                      label={`${a.aliasPattern} (${a.occurrenceCount})`}
                      onDelete={() => handleDelete(a.id)}
                      deleteIcon={
                        <Tooltip title="Delete alias">
                          <DeleteIcon fontSize="small" />
                        </Tooltip>
                      }
                      onClick={() => setReassigning({ id: a.id, aliasPattern: a.aliasPattern })}
                      icon={<SwapHorizIcon fontSize="small" />}
                      variant="outlined"
                    />
                  ))}
                  {card.aliases.length === 0 && (
                    <Typography variant="caption" color="text.secondary">
                      No aliases yet.
                    </Typography>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
      <ReassignAliasDialog
        alias={reassigning}
        providers={providers}
        onClose={() => setReassigning(null)}
        onSaved={load}
      />
      <AddAliasDialog
        providerId={addingTo?.id ?? null}
        providerName={addingTo?.name ?? null}
        onClose={() => setAddingTo(null)}
        onSaved={load}
      />
    </Box>
  );
}

export default function OverridesPage() {
  const [tab, setTab] = React.useState(0);

  return (
    <RequireAuth roles={[Role.ADMIN]}>
      <AppShell>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
          Provider Overrides &amp; Normalization Audit
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Granular per-operator provider assignments and a full audit of how raw carrier-name variants
          consolidate into canonical providers.
        </Typography>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
          <Tab label="Operator-Level Overrides Log" />
          <Tab label="Provider Normalization &amp; Alias Dictionary" />
        </Tabs>
        {tab === 0 && <OverridesLogTab />}
        {tab === 1 && <AliasDictionaryTab />}
      </AppShell>
    </RequireAuth>
  );
}
