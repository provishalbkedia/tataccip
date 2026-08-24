"use client";

import * as React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Paper,
  Popover,
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
import CallSplitIcon from "@mui/icons-material/CallSplit";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import ReadOnlyBanner from "@/components/ReadOnlyBanner";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import {
  AffectedMno,
  MnoProviderOverrideEntry,
  ProviderSummary,
  Role,
  SaveOverridesBatchResult,
  UnmappedProviderVariantRow,
} from "@ccip/shared-types";

// Above this count, rendering every chip gets both visually unwieldy and
// (for the rare pathological variant) slow — show the first few plus a
// summary badge that opens the full list in a popover instead.
const SUMMARY_THRESHOLD = 50;
const VISIBLE_CHIP_COUNT = 5;

function AffectedMnosCell({ mnos }: { mnos: AffectedMno[] }) {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const truncate = mnos.length > SUMMARY_THRESHOLD;
  const visible = truncate ? mnos.slice(0, VISIBLE_CHIP_COUNT) : mnos;
  const remaining = mnos.length - visible.length;

  return (
    <Box
      sx={{
        maxHeight: 100,
        overflowY: "auto",
        display: "flex",
        flexWrap: "wrap",
        gap: 0.5,
        p: 0.5,
        bgcolor: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 1,
      }}
    >
      {visible.map((m) => (
        <Tooltip key={m.tadigCode} title={m.country ? `${m.operatorName} — ${m.country}` : m.operatorName}>
          <Chip label={`${m.operatorName} (${m.tadigCode})`} size="small" variant="outlined" />
        </Tooltip>
      ))}
      {remaining > 0 && (
        <>
          <Chip
            label={`+${remaining} more MNOs`}
            size="small"
            color="primary"
            onClick={(e) => setAnchorEl(e.currentTarget)}
            sx={{ cursor: "pointer" }}
          />
          <Popover
            open={Boolean(anchorEl)}
            anchorEl={anchorEl}
            onClose={() => setAnchorEl(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          >
            <Box sx={{ p: 1.5, maxWidth: 340, maxHeight: 320, overflowY: "auto" }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                All {mnos.length} Affected Operators
              </Typography>
              <List dense>
                {mnos.map((m) => (
                  <ListItem key={m.tadigCode} disableGutters>
                    <ListItemText primary={`${m.operatorName} (${m.tadigCode})`} secondary={m.country || undefined} />
                  </ListItem>
                ))}
              </List>
            </Box>
          </Popover>
        </>
      )}
    </Box>
  );
}

/** "Map Per Operator" drill-down — for a variant like "SCCP Carrier" that
 * hits many MNOs, lets an admin assign a specific canonical provider to
 * individual MNOs rather than mapping every one of them the same way via
 * ResolveRow's "Resolve & Update All". Rows left "(Unassigned)" are simply
 * skipped, staying in the Unmapped queue for later triage — this is
 * additive to, not a replacement for, the global resolve action. */
function OperatorOverrideModal({
  variant,
  providers,
  open,
  onClose,
  onSaved,
  isAdmin,
}: {
  variant: UnmappedProviderVariantRow;
  providers: ProviderSummary[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  isAdmin: boolean;
}) {
  const [assignments, setAssignments] = React.useState<Record<string, { providerId: number | null; note: string }>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<SaveOverridesBatchResult | null>(null);

  React.useEffect(() => {
    if (open) {
      setAssignments({});
      setResult(null);
      setError(null);
    }
  }, [open, variant.id]);

  function setAssignment(tadigCode: string, patch: Partial<{ providerId: number | null; note: string }>) {
    setAssignments((prev) => {
      const existing = prev[tadigCode] ?? { providerId: null, note: "" };
      return { ...prev, [tadigCode]: { ...existing, ...patch } };
    });
  }

  async function handleSave() {
    const entries: MnoProviderOverrideEntry[] = Object.entries(assignments)
      .filter(([, v]) => v.providerId != null)
      .map(([tadigCode, v]) => ({
        tadigCode,
        providerId: v.providerId!,
        reasonNote: v.note.trim() || undefined,
        originalRawString: variant.rawCarrierName,
      }));
    if (entries.length === 0) return;

    setBusy(true);
    setError(null);
    try {
      const res = await api.post<SaveOverridesBatchResult>("/provider-overrides/batch", {
        service: variant.detectedService,
        entries,
      });
      setResult(res);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const assignedCount = Object.values(assignments).filter((v) => v.providerId != null).length;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Map Per Operator — &quot;{variant.rawCarrierName}&quot;</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Assign a specific canonical provider to individual MNOs below, instead of mapping all{" "}
          {variant.affectedMnoCount} at once via &quot;Resolve &amp; Update All&quot;. Rows left &quot;(Unassigned)&quot;
          stay in the Unmapped queue.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {result && (
          <Alert severity={result.errors.length > 0 ? "warning" : "success"} sx={{ mb: 2 }}>
            Saved {result.savedCount} override(s).
            {result.errors.length > 0 && ` ${result.errors.length} error(s): ${result.errors.join("; ")}`}
          </Alert>
        )}
        <TableContainer sx={{ maxHeight: 440 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>TADIG</TableCell>
                <TableCell>Operator Name</TableCell>
                <TableCell>Country</TableCell>
                <TableCell sx={{ minWidth: 220 }}>Assigned Provider</TableCell>
                <TableCell sx={{ minWidth: 180 }}>Note</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {variant.affectedMnos.map((m) => (
                <TableRow key={m.tadigCode}>
                  <TableCell>{m.tadigCode}</TableCell>
                  <TableCell>{m.operatorName}</TableCell>
                  <TableCell>{m.country}</TableCell>
                  <TableCell>
                    <Autocomplete
                      size="small"
                      options={providers}
                      getOptionLabel={(p) => p.providerName}
                      value={providers.find((p) => p.id === assignments[m.tadigCode]?.providerId) ?? null}
                      onChange={(_, v) => setAssignment(m.tadigCode, { providerId: v?.id ?? null })}
                      disabled={busy || !isAdmin}
                      renderInput={(params) => <TextField {...params} placeholder="(Unassigned / Inherit Global)" />}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="Optional note"
                      value={assignments[m.tadigCode]?.note ?? ""}
                      disabled={busy || !isAdmin}
                      onChange={(e) => setAssignment(m.tadigCode, { note: e.target.value })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Tooltip title={!isAdmin ? "Administrator privileges required to save overrides." : ""}>
          <span>
            <Button variant="contained" disabled={busy || assignedCount === 0 || !isAdmin} onClick={handleSave}>
              Save Operator Overrides {assignedCount > 0 && `(${assignedCount})`}
            </Button>
          </span>
        </Tooltip>
      </DialogActions>
    </Dialog>
  );
}

function ResolveRow({
  variant,
  providers,
  onResolved,
  isAdmin,
}: {
  variant: UnmappedProviderVariantRow;
  providers: ProviderSummary[];
  onResolved: () => void;
  isAdmin: boolean;
}) {
  const [selected, setSelected] = React.useState<ProviderSummary | null>(null);
  const [newName, setNewName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [overrideModalOpen, setOverrideModalOpen] = React.useState(false);

  async function handleResolve() {
    if (!selected && !newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/provider-aliases/resolve", {
        variantId: variant.id,
        providerId: selected?.id,
        newProviderName: selected ? undefined : newName.trim(),
      });
      onResolved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Resolve failed");
    } finally {
      setBusy(false);
    }
  }

  const cellSx = { verticalAlign: "middle" };

  return (
    <TableRow>
      <TableCell sx={cellSx}>
        <Typography variant="body2" fontWeight={600}>
          {variant.rawCarrierName}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          normalized: {variant.normalizedPattern}
        </Typography>
      </TableCell>
      <TableCell sx={cellSx}>
        <Chip label={variant.occurrenceCount} size="small" />
      </TableCell>
      <TableCell sx={{ ...cellSx, minWidth: 260, maxWidth: 320 }}>
        <AffectedMnosCell mnos={variant.affectedMnos} />
        <Button
          size="small"
          startIcon={<CallSplitIcon fontSize="small" />}
          onClick={() => setOverrideModalOpen(true)}
          sx={{ mt: 0.5 }}
        >
          Map Per Operator
        </Button>
        <OperatorOverrideModal
          variant={variant}
          providers={providers}
          open={overrideModalOpen}
          onClose={() => setOverrideModalOpen(false)}
          onSaved={onResolved}
          isAdmin={isAdmin}
        />
      </TableCell>
      <TableCell sx={cellSx}>
        <Chip label={variant.detectedService} size="small" variant="outlined" />
      </TableCell>
      <TableCell sx={{ ...cellSx, minWidth: 220 }}>
        <Autocomplete
          size="small"
          options={providers}
          getOptionLabel={(p) => p.providerName}
          value={selected}
          onChange={(_, v) => {
            setSelected(v);
            if (v) setNewName("");
          }}
          disabled={busy || !isAdmin}
          renderInput={(params) => <TextField {...params} label="Map to existing provider" />}
        />
      </TableCell>
      <TableCell sx={{ ...cellSx, minWidth: 180 }}>
        <TextField
          size="small"
          fullWidth
          label="...or new provider name"
          value={newName}
          disabled={busy || !!selected || !isAdmin}
          onChange={(e) => setNewName(e.target.value)}
        />
      </TableCell>
      <TableCell sx={cellSx}>
        <Tooltip title={!isAdmin ? "Administrator privileges required to map provider variants." : ""}>
          <span>
            <Button
              variant="contained"
              size="small"
              disabled={busy || (!selected && !newName.trim()) || !isAdmin}
              onClick={handleResolve}
            >
              Resolve &amp; Update All
            </Button>
          </span>
        </Tooltip>
        {error && (
          <Typography variant="caption" color="error" display="block" sx={{ mt: 0.5 }}>
            {error}
          </Typography>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function ProviderAliasesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === Role.ADMIN;
  const [variants, setVariants] = React.useState<UnmappedProviderVariantRow[]>([]);
  const [providers, setProviders] = React.useState<ProviderSummary[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    api
      .get<UnmappedProviderVariantRow[]>("/provider-aliases/unmapped")
      .then(setVariants)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load unmapped variants"));
    api.get<ProviderSummary[]>("/provider/search").then(setProviders).catch(() => {});
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <RequireAuth>
      <AppShell>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
          Unmapped Providers
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Raw carrier-name strings encountered during IR.21 XML ingestion that didn&apos;t match any known
          provider alias. Map each to a canonical provider — future uploads will resolve it automatically,
          and every affected MNO shown here is backfilled immediately.
        </Typography>
        <ReadOnlyBanner />
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {variants.length === 0 && !error && (
          <Alert severity="success">No pending unmapped provider variants.</Alert>
        )}

        {variants.length > 0 && (
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Raw Carrier Name</TableCell>
                  <TableCell>Occurrences</TableCell>
                  <TableCell>Affected Operators / MNOs</TableCell>
                  <TableCell>Service</TableCell>
                  <TableCell>Map to Canonical Provider</TableCell>
                  <TableCell>Or Create New</TableCell>
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {variants.map((v) => (
                  <ResolveRow key={v.id} variant={v} providers={providers} onResolved={load} isAdmin={isAdmin} />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </AppShell>
    </RequireAuth>
  );
}
