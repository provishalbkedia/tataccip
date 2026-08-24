"use client";

import * as React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
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
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import { api, ApiError } from "@/lib/api";
import { AffectedMno, ProviderSummary, Role, UnmappedProviderVariantRow } from "@ccip/shared-types";

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

function ResolveRow({
  variant,
  providers,
  onResolved,
}: {
  variant: UnmappedProviderVariantRow;
  providers: ProviderSummary[];
  onResolved: () => void;
}) {
  const [selected, setSelected] = React.useState<ProviderSummary | null>(null);
  const [newName, setNewName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
          disabled={busy}
          renderInput={(params) => <TextField {...params} label="Map to existing provider" />}
        />
      </TableCell>
      <TableCell sx={{ ...cellSx, minWidth: 180 }}>
        <TextField
          size="small"
          fullWidth
          label="...or new provider name"
          value={newName}
          disabled={busy || !!selected}
          onChange={(e) => setNewName(e.target.value)}
        />
      </TableCell>
      <TableCell sx={cellSx}>
        <Button
          variant="contained"
          size="small"
          disabled={busy || (!selected && !newName.trim())}
          onClick={handleResolve}
        >
          Resolve &amp; Update All
        </Button>
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
    <RequireAuth roles={[Role.ADMIN]}>
      <AppShell>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
          Unmapped Providers
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Raw carrier-name strings encountered during IR.21 XML ingestion that didn&apos;t match any known
          provider alias. Map each to a canonical provider — future uploads will resolve it automatically,
          and every affected MNO shown here is backfilled immediately.
        </Typography>
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
                  <ResolveRow key={v.id} variant={v} providers={providers} onResolved={load} />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </AppShell>
    </RequireAuth>
  );
}
