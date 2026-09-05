"use client";

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import RuleIcon from "@mui/icons-material/Rule";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import { api, ApiError } from "@/lib/api";
import { CARRIER_CHURN_TYPES, Ir21RoutingChangeRow, RoutingChangeType, SERVICE_SECTION_ID } from "@ccip/shared-types";

const CHANGE_TYPE_OPTIONS: RoutingChangeType[] = [
  "ADDED",
  "REMOVED",
  "REPLACED",
  "IP_SUBNET_UPDATE",
  "DIAMETER_REALM_UPDATE",
  "POINT_CODE_GT_UPDATE",
  "ADMIN_NAME_UPDATE",
];
const CHANGE_TYPE_LABEL: Record<RoutingChangeType, string> = {
  ADDED: "+ ADDED",
  REMOVED: "− REMOVED",
  REPLACED: "⇄ REPLACED",
  IP_SUBNET_UPDATE: "🌐 IP / Subnet Update",
  DIAMETER_REALM_UPDATE: "🔄 Diameter / DEA Config",
  POINT_CODE_GT_UPDATE: "📟 SS7 / GT Update",
  ADMIN_NAME_UPDATE: "ℹ Admin / Name Update",
};
const CHANGE_TYPE_COLOR: Record<RoutingChangeType, "success" | "error" | "warning" | "info" | "default"> = {
  ADDED: "success",
  REMOVED: "error",
  REPLACED: "warning",
  IP_SUBNET_UPDATE: "info",
  DIAMETER_REALM_UPDATE: "info",
  POINT_CODE_GT_UPDATE: "info",
  ADMIN_NAME_UPDATE: "default",
};

const NON_CARRIER_TYPES = new Set<RoutingChangeType>(["IP_SUBNET_UPDATE", "DIAMETER_REALM_UPDATE", "POINT_CODE_GT_UPDATE", "ADMIN_NAME_UPDATE"]);
const CHURN_TYPES = new Set<RoutingChangeType>(CARRIER_CHURN_TYPES);

// A row "needs review" when it's exactly the kind of thing this screen
// exists to surface: an automatic non-carrier classification, or a
// bulk-onboarding ADDED that was suppressed from the churn KPIs -- both are
// judgment calls the classifier made from keyword/shape heuristics, not a
// certainty.
function needsReview(row: Ir21RoutingChangeRow): boolean {
  return NON_CARRIER_TYPES.has(row.changeType) || row.isInitialOnboarding;
}

/** "Commercial Churn" for a genuine carrier-routing switch (whether or not
 * this particular row happens to be onboarding-flagged -- flip that flag
 * off and it immediately IS churn again, so the scope label reflects the
 * type, not the flag); "Technical Config / Non-Churn" for the 4 non-carrier
 * types. Shown in its own column so an admin can see at a glance which side
 * of the Market Intelligence feed's default filter a row falls on. */
function marketChurnScope(changeType: RoutingChangeType): string {
  return CHURN_TYPES.has(changeType) ? "Commercial Churn" : "Technical Config / Non-Churn";
}

function ReclassifyDialog({
  row,
  onClose,
  onSaved,
}: {
  row: Ir21RoutingChangeRow;
  onClose: () => void;
  onSaved: (updated: Ir21RoutingChangeRow) => void;
}) {
  const [changeType, setChangeType] = React.useState<RoutingChangeType>(row.changeType);
  const [isInitialOnboarding, setIsInitialOnboarding] = React.useState(row.isInitialOnboarding);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/analytics/ir21-changes/${row.id}/reclassify`, { changeType, isInitialOnboarding });
      onSaved({ ...row, changeType, isInitialOnboarding, isManuallyReviewed: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save reclassification");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <RuleIcon color="primary" fontSize="small" />
        Reclassify Change
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {row.mnoName} ({row.tadigCode}) — {row.serviceName}, {new Date(row.effectiveDate).toLocaleDateString()}
        </Typography>
        {row.description && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Raw IR.21 &lt;ChangeHistory&gt; text: &quot;{row.description}&quot;
          </Alert>
        )}
        {(row.oldProviderName || row.newProviderName) && (
          <Typography variant="body2" sx={{ mb: 2 }}>
            {row.oldProviderName ?? "—"} &rarr; {row.newProviderName ?? "—"}
          </Typography>
        )}
        <TextField select fullWidth label="Change Type" value={changeType} onChange={(e) => setChangeType(e.target.value as RoutingChangeType)} sx={{ mb: 2 }}>
          {CHANGE_TYPE_OPTIONS.map((t) => (
            <MenuItem key={t} value={t}>
              {CHANGE_TYPE_LABEL[t]}
            </MenuItem>
          ))}
        </TextField>
        <FormControlLabel
          control={<Checkbox checked={isInitialOnboarding} onChange={(e) => setIsInitialOnboarding(e.target.checked)} disabled={changeType !== "ADDED"} />}
          label="Onboarding only (excluded from Total Churn Events and Gainer/Loser KPIs)"
        />
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} disabled={saving}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Admin review surface for the automatic ADDED/REMOVED/REPLACED/
 * CONFIG_UPDATE/ADMIN_UPDATE classification the ingestion pipeline assigns
 * to every <ChangeHistory> entry and live-diff transition (see
 * UploadService.backfillChangeHistory / applyServiceConnectivity) -- lets an
 * admin see the raw evidence behind a classification and correct it when the
 * automatic keyword/shape heuristics got it wrong. Fetches the full,
 * unrestricted history (changeType=ALL&timeframe=all) since this screen's
 * whole purpose is auditing what the Market Intelligence feed's default view
 * deliberately hides. */
export default function Ir21ChangeLogReviewTab() {
  const [rows, setRows] = React.useState<Ir21RoutingChangeRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [scope, setScope] = React.useState<"review" | "all">("review");
  const [editing, setEditing] = React.useState<Ir21RoutingChangeRow | null>(null);
  const [savedMsg, setSavedMsg] = React.useState(false);
  const [confirmReprocess, setConfirmReprocess] = React.useState(false);
  const [reprocessing, setReprocessing] = React.useState(false);
  const [reprocessResult, setReprocessResult] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    return api
      .get<Ir21RoutingChangeRow[]>("/analytics/ir21-changes/feed?changeType=ALL&timeframe=all")
      .then(setRows)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load change log"))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const visibleRows = React.useMemo(() => (scope === "review" ? rows.filter(needsReview) : rows), [rows, scope]);
  const reviewCount = React.useMemo(() => rows.filter(needsReview).length, [rows]);

  const runReprocess = async () => {
    setReprocessing(true);
    setConfirmReprocess(false);
    try {
      const { updatedCount } = await api.post<{ updatedCount: number }>("/analytics/ir21-changes/reprocess-onboarding");
      setReprocessResult(
        updatedCount > 0
          ? `Reclassified ${updatedCount} row(s) as onboarding (excluded from churn KPIs).`
          : "Nothing to reclassify — every eligible row is already correctly flagged.",
      );
      await load();
    } catch (e) {
      setReprocessResult(e instanceof ApiError ? e.message : "Failed to reprocess onboarding classification");
    } finally {
      setReprocessing(false);
    }
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Every routing-change classification the ingestion pipeline assigned automatically to Sections 5 (SCCP), 17
        (IPX), and 20 (DSX), with the raw GSMA IR.21 <code>&lt;ChangeHistory&gt;</code> text behind it where one
        exists. IP/Subnet, Diameter/SS7, and Admin/Name updates, and onboarding-flagged additions, are hidden from
        the Market Intelligence feed&apos;s default view by design (they aren&apos;t market churn) — review them
        here and correct a classification when the automatic heuristics got it wrong.
      </Typography>

      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1.5, mb: 2 }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={scope}
          onChange={(_, v) => v && setScope(v)}
          sx={{ "& .MuiToggleButton-root": { textTransform: "none", px: 2 } }}
        >
          <ToggleButton value="review">Needs Review ({reviewCount})</ToggleButton>
          <ToggleButton value="all">All Events ({rows.length})</ToggleButton>
        </ToggleButtonGroup>

        <Button
          size="small"
          variant="outlined"
          startIcon={<AutorenewIcon />}
          onClick={() => setConfirmReprocess(true)}
          disabled={reprocessing}
          sx={{ ml: "auto" }}
        >
          Reprocess Existing Baseline
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>MNO / Cust</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Section ID &amp; Service</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Raw Change Description</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Normalized Bucket / Tag</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Matched Rule / Pattern</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Market Churn Scope</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Source</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">
                Action
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!loading && visibleRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                    {scope === "review" ? "Nothing flagged for review." : "No routing changes recorded."}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {visibleRows.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell>{new Date(r.effectiveDate).toLocaleDateString()}</TableCell>
                <TableCell>
                  {r.mnoName} <Typography component="span" variant="caption" color="text.secondary">({r.tadigCode})</Typography>
                </TableCell>
                <TableCell>
                  ID {SERVICE_SECTION_ID[r.serviceName]} ({r.serviceName})
                </TableCell>
                <TableCell sx={{ maxWidth: 280 }}>
                  {r.description ?? (
                    <Typography variant="body2" color="text.secondary">
                      {r.oldProviderName ?? "—"} &rarr; {r.newProviderName ?? "—"}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
                    <Chip size="small" color={CHANGE_TYPE_COLOR[r.changeType]} label={CHANGE_TYPE_LABEL[r.changeType]} sx={{ fontWeight: 600 }} />
                    {r.isInitialOnboarding && <Chip label="Onboarding" size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />}
                    {r.isManuallyReviewed && <Chip label="Reviewed" size="small" color="primary" variant="outlined" sx={{ height: 18, fontSize: 10 }} />}
                  </Box>
                </TableCell>
                <TableCell>
                  {r.matchedRule ? (
                    <Chip size="small" variant="outlined" label={r.matchedRule} sx={{ fontFamily: "monospace", fontSize: 11 }} />
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      —
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Typography
                    variant="body2"
                    sx={{ color: CHURN_TYPES.has(r.changeType) ? "success.main" : "text.secondary", fontWeight: CHURN_TYPES.has(r.changeType) ? 600 : 400 }}
                  >
                    {marketChurnScope(r.changeType)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip size="small" variant="outlined" label={r.changeSource === "CHANGE_HISTORY" ? "ChangeHistory" : "Live Diff"} />
                </TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => setEditing(r)}>
                    Review
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {editing && (
        <ReclassifyDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
            setEditing(null);
            setSavedMsg(true);
          }}
        />
      )}

      <Snackbar open={savedMsg} autoHideDuration={3000} onClose={() => setSavedMsg(false)} message="Classification updated" />

      <Dialog open={confirmReprocess} onClose={() => setConfirmReprocess(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <AutorenewIcon color="primary" fontSize="small" />
          Reprocess Existing Baseline
        </DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            Retroactively flags every MNO&apos;s earliest recorded &quot;+ ADDED&quot; event as onboarding, not
            market churn — this is what fixes an old baseline load (e.g. hundreds of MNOs uploaded together) showing
            up as a flood of fake carrier wins in Total Churn Events and the Gainer/Loser KPIs.
            <br />
            <br />
            Safe to run any time: only rows still on the old classification are touched, and a row already correct
            is left alone. This does <strong>not</strong> recover IP/Subnet, Diameter/SS7, or Admin/Name updates
            from a <code>&lt;ChangeHistory&gt;</code> entry an older ingestion silently dropped — that raw text was
            never stored, so recovering those specifically requires re-uploading the original IR.21 archive(s)
            through Admin Upload (also safe: it won&apos;t create duplicate churn events for data that hasn&apos;t
            changed).
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmReprocess(false)}>Cancel</Button>
          <Button variant="contained" onClick={runReprocess} disabled={reprocessing}>
            {reprocessing ? "Reprocessing…" : "Reprocess Now"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!reprocessResult} autoHideDuration={6000} onClose={() => setReprocessResult(null)} message={reprocessResult ?? ""} />
    </Box>
  );
}
