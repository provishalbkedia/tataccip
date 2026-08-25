"use client";

import * as React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { ProviderSummary, RemapProviderResult, Role } from "@ccip/shared-types";

function RemapForm({ rawString, onDone }: { rawString: string; onDone: (result: RemapProviderResult) => void }) {
  const [providers, setProviders] = React.useState<ProviderSummary[]>([]);
  const [selected, setSelected] = React.useState<ProviderSummary | null>(null);
  const [newName, setNewName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    api.get<ProviderSummary[]>("/provider/search").then(setProviders).catch(() => {});
  }, []);

  async function submit() {
    if (!selected && !newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<RemapProviderResult>("/provider-aliases/remap", {
        rawString,
        targetProviderId: selected?.id,
        newProviderName: selected ? undefined : newName.trim(),
      });
      onDone(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Remap failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ mt: 1, p: 1.5, bgcolor: "action.hover", borderRadius: 1 }}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        Remap &quot;{rawString}&quot; to:
      </Typography>
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
        renderInput={(params) => <TextField {...params} label="Existing provider" />}
        sx={{ mb: 1 }}
      />
      <TextField
        size="small"
        fullWidth
        label="...or new provider name"
        value={newName}
        disabled={busy || !!selected}
        onChange={(e) => setNewName(e.target.value)}
        sx={{ mb: 1 }}
      />
      <Button size="small" variant="contained" disabled={busy || (!selected && !newName.trim())} onClick={submit}>
        {busy ? "Remapping..." : "Confirm Remap"}
      </Button>
      {error && (
        <Typography variant="caption" color="error" display="block" sx={{ mt: 0.5 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}

export interface ProviderInspectorData {
  providerId: number;
  providerName: string;
  /** Raw string(s) that resolved to this provider in the current context —
   * one document's declared text (MNO view) or every observed variant
   * across all MNOs (provider view). */
  rawStrings: string[];
  resolvedViaAlias?: string | null;
  /** Every known alias pattern for this provider — only meaningful in the
   * provider-detail context. */
  allAliases?: string[];
}

export default function ProviderInspectorDrawer({
  data,
  onClose,
}: {
  data: ProviderInspectorData | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [remappingRaw, setRemappingRaw] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<RemapProviderResult | null>(null);

  React.useEffect(() => {
    setRemappingRaw(null);
    setResult(null);
  }, [data]);

  return (
    <Drawer anchor="right" open={!!data} onClose={onClose}>
      <Box sx={{ width: { xs: "100vw", sm: 480 }, maxWidth: "100vw", p: { xs: 2, sm: 3 } }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
          <Typography variant="h6" fontWeight={700}>
            Provider Resolution
          </Typography>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {data && (
          <Stack spacing={2}>
            <Box>
              <Typography variant="overline" color="text.secondary">
                Canonical Provider
              </Typography>
              <Typography variant="h6">{data.providerName}</Typography>
            </Box>

            <Divider />

            <Box>
              <Typography variant="overline" color="text.secondary">
                Raw Declared String(s)
              </Typography>
              <Stack spacing={1} sx={{ mt: 0.5 }}>
                {data.rawStrings.length === 0 && (
                  <Typography variant="body2">
                    <em>No raw XML-declared text observed (may be reach-list-only data, which isn&apos;t tracked).</em>
                  </Typography>
                )}
                {data.rawStrings.map((raw) => (
                  <Box key={raw}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
                      <Chip label={raw} size="small" variant="outlined" />
                      {user?.role === Role.ADMIN && (
                        <IconButton size="small" onClick={() => setRemappingRaw(remappingRaw === raw ? null : raw)}>
                          <EditIcon fontSize="inherit" />
                        </IconButton>
                      )}
                    </Box>
                    {remappingRaw === raw && (
                      <RemapForm
                        rawString={raw}
                        onDone={(r) => {
                          setResult(r);
                          setRemappingRaw(null);
                        }}
                      />
                    )}
                  </Box>
                ))}
              </Stack>
            </Box>

            {data.resolvedViaAlias && (
              <Box>
                <Typography variant="overline" color="text.secondary">
                  Resolved Via Alias
                </Typography>
                <Typography variant="body2">&quot;{data.resolvedViaAlias}&quot;</Typography>
              </Box>
            )}

            {data.allAliases && (
              <Box>
                <Typography variant="overline" color="text.secondary">
                  All Known Aliases Grouped Under This Provider
                </Typography>
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
                  {data.allAliases.length > 0 ? (
                    data.allAliases.map((a) => <Chip key={a} label={a} size="small" />)
                  ) : (
                    <Typography variant="body2">
                      <em>None recorded</em>
                    </Typography>
                  )}
                </Box>
              </Box>
            )}

            {result && (
              <Alert severity="success">
                Remapped to &quot;{result.targetProviderName}&quot; — {result.affectedTadigs.length} MNO(s) affected
                (Ir21Connectivity only; Reach List data isn&apos;t traceable to a specific raw string).
              </Alert>
            )}
          </Stack>
        )}
      </Box>
    </Drawer>
  );
}
