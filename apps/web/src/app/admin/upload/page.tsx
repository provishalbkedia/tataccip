"use client";

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Grid,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
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
import UploadFileIcon from "@mui/icons-material/UploadFile";
import FolderZipIcon from "@mui/icons-material/FolderZip";
import LanIcon from "@mui/icons-material/Lan";
import DownloadIcon from "@mui/icons-material/Download";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import DataGrid from "@/components/DataGrid";
import ReadOnlyBanner from "@/components/ReadOnlyBanner";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { splitZipForUpload } from "@/lib/splitZipForUpload";
import {
  BulkXmlUploadResult,
  DsxBackfillResult,
  PurgeReachlistResult,
  ReachlistZipBatchResult,
  ResetIr21DatabaseResult,
  Role,
  UploadHistoryRow,
  UploadResult,
} from "@ccip/shared-types";

const ADMIN_ONLY_TOOLTIP = "Administrator privileges required to upload datasets.";

// Cloud Run's HTTP/1.1 request cap is 32 MiB — a ZIP above this needs to be
// split into several smaller uploads client-side (see splitZipForUpload).
const MAX_SINGLE_UPLOAD_BYTES = 30 * 1024 * 1024;

function mergeBulkResults(results: BulkXmlUploadResult[]): BulkXmlUploadResult {
  return results.reduce((acc, r) => ({
    uploadHistory: r.uploadHistory,
    filesProcessed: acc.filesProcessed + r.filesProcessed,
    filesFailed: acc.filesFailed + r.filesFailed,
    mnosUpdated: acc.mnosUpdated + r.mnosUpdated,
    unmappedVariantsFound: acc.unmappedVariantsFound + r.unmappedVariantsFound,
    errors: [...acc.errors, ...r.errors],
  }));
}

function UploadCard({
  title,
  description,
  endpoint,
  columnsHint,
  onUploaded,
  isAdmin,
  replaceOption,
  formatGuide,
}: {
  title: string;
  description: string;
  endpoint: string;
  columnsHint: string;
  onUploaded: () => void;
  isAdmin: boolean;
  // Lets a re-upload delete prior records sourced from the same filename
  // before ingesting — see Reach List Upload below. Omit for an upload
  // type that has no such notion of "replace."
  replaceOption?: { label: React.ReactNode; confirmTitle: string; confirmText: React.ReactNode };
  // Expanded per-format documentation + downloadable sample templates —
  // shown so an admin knows the expected headers/structure before their
  // first upload, instead of discovering it from a parse error.
  formatGuide?: { formats: { title: string; columns: string; sampleHref: string; sampleLabel: string }[] };
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<UploadResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [replace, setReplace] = React.useState(false);
  const [confirmReplaceOpen, setConfirmReplaceOpen] = React.useState(false);
  const pendingFileRef = React.useRef<File | null>(null);

  async function doUpload(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (replaceOption) formData.append("replace", String(replace));
      const res = await api.postForm<UploadResult>(endpoint, formData);
      setResult(res);
      onUploaded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleFile(file: File) {
    if (replaceOption && replace) {
      pendingFileRef.current = file;
      setConfirmReplaceOpen(true);
      return;
    }
    doUpload(file);
  }

  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="h6" fontWeight={700}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {description}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: formatGuide ? 1 : 2 }}>
          Expected columns: {columnsHint}
        </Typography>
        {formatGuide && (
          <Box sx={{ mb: 2, p: 1.5, bgcolor: "action.hover", borderRadius: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary">
                Accepted formats
              </Typography>
              <Tooltip title="Format 1 accepts standard 5-column sheets; Format 2 accepts wide competitor matrices with dynamic wholesale carrier columns.">
                <InfoOutlinedIcon fontSize="small" sx={{ color: "text.disabled", fontSize: 15 }} />
              </Tooltip>
            </Box>
            {formatGuide.formats.map((f) => (
              <Box key={f.title} sx={{ mb: f === formatGuide.formats[formatGuide.formats.length - 1] ? 0 : 1.5 }}>
                <Typography variant="caption" fontWeight={700} display="block">
                  {f.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                  {f.columns}
                </Typography>
                <Button
                  size="small"
                  variant="text"
                  startIcon={<DownloadIcon fontSize="small" />}
                  href={f.sampleHref}
                  download
                  sx={{ minHeight: "auto", py: 0.25, textTransform: "none" }}
                >
                  {f.sampleLabel}
                </Button>
              </Box>
            ))}
          </Box>
        )}
        {replaceOption && (
          <FormControlLabel
            sx={{ display: "block", mb: 1 }}
            control={
              <Checkbox
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
                disabled={busy || !isAdmin}
                color="warning"
              />
            }
            label={<Typography variant="body2">{replaceOption.label}</Typography>}
          />
        )}
        <Tooltip title={!isAdmin ? ADMIN_ONLY_TOOLTIP : ""}>
          <span>
            <Button
              variant="contained"
              component="label"
              color={replaceOption && replace ? "warning" : "primary"}
              startIcon={<UploadFileIcon />}
              disabled={busy || !isAdmin}
            >
              {busy ? "Uploading..." : "Choose Excel file"}
              <input
                ref={inputRef}
                type="file"
                hidden
                accept=".xlsx,.xls"
                disabled={!isAdmin}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </Button>
          </span>
        </Tooltip>

        {replaceOption && (
          <Dialog open={confirmReplaceOpen} onClose={() => setConfirmReplaceOpen(false)}>
            <DialogTitle>{replaceOption.confirmTitle}</DialogTitle>
            <DialogContent>
              <DialogContentText component="div">{replaceOption.confirmText}</DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmReplaceOpen(false)}>Cancel</Button>
              <Button
                color="warning"
                variant="contained"
                onClick={() => {
                  setConfirmReplaceOpen(false);
                  if (pendingFileRef.current) doUpload(pendingFileRef.current);
                }}
              >
                Replace &amp; Upload
              </Button>
            </DialogActions>
          </Dialog>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        {result && (
          <Box sx={{ mt: 2 }}>
            {result.formatDetected === "COMPETITOR_MATRIX" && (
              <Chip
                size="small"
                color="info"
                label={`Wide competitor matrix detected — auto-transposed into ${result.totalRowsTransposed ?? 0} row(s)`}
                sx={{ mb: 1 }}
              />
            )}
            {typeof result.recordsReplaced === "number" && (
              <Chip
                size="small"
                color="warning"
                label={`Replaced ${result.recordsReplaced} prior record(s) from this file`}
                sx={{ mb: 1, ml: result.formatDetected === "COMPETITOR_MATRIX" ? 1 : 0 }}
              />
            )}
            <Alert severity={result.uploadHistory.status === "SUCCESS" ? "success" : "warning"}>
              {result.uploadHistory.recordsLoaded} record(s) loaded — status: {result.uploadHistory.status}
            </Alert>
            {result.unresolvedMnos && result.unresolvedMnos.length > 0 && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                {result.unresolvedMnos.length} MNO(s) not found in the platform (no TADIG to attach to) — add them via
                IR.21 upload first, or confirm the operator name/country match.
                <List dense sx={{ maxHeight: 160, overflow: "auto", mt: 0.5 }}>
                  {result.unresolvedMnos.map((u, i) => (
                    <ListItem key={i} disableGutters>
                      <ListItemText primary={`${u.mnoName} — ${u.country}`} primaryTypographyProps={{ variant: "caption" }} />
                    </ListItem>
                  ))}
                </List>
              </Alert>
            )}
            {result.errors.length > 0 && (
              <List dense sx={{ maxHeight: 200, overflow: "auto", bgcolor: "background.default", mt: 1, borderRadius: 1 }}>
                {result.errors.map((e, i) => (
                  <ListItem key={i}>
                    <ListItemText primary={e} primaryTypographyProps={{ variant: "caption" }} />
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

function XmlBatchUploadCard({ onUploaded, isAdmin }: { onUploaded: () => void; isAdmin: boolean }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [batchLabel, setBatchLabel] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<BulkXmlUploadResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [replaceActiveDataset, setReplaceActiveDataset] = React.useState(false);
  const [confirmReplaceOpen, setConfirmReplaceOpen] = React.useState(false);
  const pendingFilesRef = React.useRef<FileList | null>(null);

  async function uploadOne(blob: Blob, filename: string, replace: boolean, onProgress: (ratio: number) => void) {
    const formData = new FormData();
    formData.append("files", blob, filename);
    formData.append("replaceActiveDataset", String(replace));
    return api.postFormWithProgress<BulkXmlUploadResult>("/upload/ir21-xml", formData, onProgress);
  }

  async function doUpload(files: FileList) {
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(0);
    setBatchLabel(null);
    try {
      // A single oversized .zip has to be split into several requests —
      // Cloud Run rejects any one request over 32MB outright. Bare XML
      // file selections and already-small ZIPs go through unchanged.
      const single = files.length === 1 ? files[0] : null;
      const needsSplit = single && single.name.toLowerCase().endsWith(".zip") && single.size > MAX_SINGLE_UPLOAD_BYTES;

      if (needsSplit) {
        setBatchLabel("Splitting archive…");
        const batches = await splitZipForUpload(single);
        if (batches.length === 0) {
          throw new ApiError('No .xml or .pdf files found inside "' + single.name + '"', 400);
        }
        const results: BulkXmlUploadResult[] = [];
        for (let i = 0; i < batches.length; i++) {
          setBatchLabel(`Uploading batch ${i + 1} of ${batches.length}`);
          setProgress(0);
          // Only the first sub-batch purges the prior dataset — passing
          // this on every sub-batch would wipe out the ones ingested just
          // before it (see UploadService.uploadIr21XmlBatch).
          const res = await uploadOne(
            batches[i],
            `batch-${i + 1}-of-${batches.length}.zip`,
            i === 0 && replaceActiveDataset,
            setProgress,
          );
          results.push(res);
        }
        setResult(mergeBulkResults(results));
      } else {
        const formData = new FormData();
        Array.from(files).forEach((f) => formData.append("files", f));
        formData.append("replaceActiveDataset", String(replaceActiveDataset));
        const res = await api.postFormWithProgress<BulkXmlUploadResult>(
          "/upload/ir21-xml",
          formData,
          setProgress,
        );
        setResult(res);
      }
      onUploaded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      setBatchLabel(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleFiles(files: FileList) {
    if (replaceActiveDataset) {
      pendingFilesRef.current = files;
      setConfirmReplaceOpen(true);
      return;
    }
    doUpload(files);
  }

  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="h6" fontWeight={700}>
          IR.21 XML / ZIP Upload (Bulk)
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Native GSMA RAEX IR.21 XML ingestion — select up to ~1,000 .xml files, or a single .zip
          archive containing them and their paired PDFs.
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
          Extracts SCCP/GRX-IPX/LTE connectivity, DNS, and contact info per MNO. Unrecognized
          provider names are queued under Unmapped Providers instead of guessed. Large archives
          (over 30MB, e.g. a 150MB zip of 1,000 XML + 1,000 paired PDFs) are automatically split
          into several smaller uploads in your browser — each PDF stays grouped with its own XML.
        </Typography>
        <FormControlLabel
          sx={{ display: "block", mb: 1 }}
          control={
            <Checkbox
              checked={replaceActiveDataset}
              onChange={(e) => setReplaceActiveDataset(e.target.checked)}
              disabled={busy || !isAdmin}
              color="warning"
            />
          }
          label={
            <Typography variant="body2">
              <strong>Replace Active IR.21 Dataset</strong> — purges all existing IR.21 connectivity
              before ingesting this upload as the sole active baseline (asks for confirmation)
            </Typography>
          }
        />
        <Tooltip title={!isAdmin ? ADMIN_ONLY_TOOLTIP : ""}>
          <span>
            <Button
              variant="contained"
              component="label"
              color={replaceActiveDataset ? "warning" : "primary"}
              startIcon={<FolderZipIcon />}
              disabled={busy || !isAdmin}
            >
              {busy ? "Uploading..." : "Choose .xml files or .zip"}
              <input
                ref={inputRef}
                type="file"
                hidden
                multiple
                accept=".xml,.zip"
                disabled={!isAdmin}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
                }}
              />
            </Button>
          </span>
        </Tooltip>

        <Dialog open={confirmReplaceOpen} onClose={() => setConfirmReplaceOpen(false)}>
          <DialogTitle>Replace Active IR.21 Dataset?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              This will permanently delete <strong>all</strong> existing IR.21-sourced connectivity
              data (every MNO&apos;s SCCP/GRX-IPX/LTE declarations) before ingesting this upload. Any
              MNO not present in this archive will lose its IR.21 connectivity entirely — Reach List
              data is not affected. This cannot be undone. Continue?
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmReplaceOpen(false)}>Cancel</Button>
            <Button
              color="warning"
              variant="contained"
              onClick={() => {
                setConfirmReplaceOpen(false);
                if (pendingFilesRef.current) doUpload(pendingFilesRef.current);
              }}
            >
              Replace Dataset &amp; Upload
            </Button>
          </DialogActions>
        </Dialog>

        {busy && (
          <Box sx={{ mt: 2 }}>
            <LinearProgress variant={progress > 0 ? "determinate" : "indeterminate"} value={progress * 100} />
            <Typography variant="caption" color="text.secondary">
              {batchLabel ?? (progress > 0 ? `Uploading — ${Math.round(progress * 100)}%` : "Uploading...")}
              {batchLabel && progress > 0 && ` — ${Math.round(progress * 100)}%`}
            </Typography>
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        {result && (
          <Box sx={{ mt: 2 }}>
            <Alert severity={result.filesFailed === 0 ? "success" : "warning"}>
              {result.uploadHistory.status} — files processed: {result.filesProcessed}, MNOs updated:{" "}
              {result.mnosUpdated}, unmapped variants found: {result.unmappedVariantsFound}
              {result.filesFailed > 0 && `, files failed: ${result.filesFailed}`}
            </Alert>
            {result.errors.length > 0 && (
              <List dense sx={{ maxHeight: 200, overflow: "auto", bgcolor: "background.default", mt: 1, borderRadius: 1 }}>
                {result.errors.map((e, i) => (
                  <ListItem key={i}>
                    <ListItemText primary={e} primaryTypographyProps={{ variant: "caption" }} />
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

const FILE_STATUS_LABEL: Record<string, string> = {
  PROCESSED: "Processed",
  SKIPPED_UNSUPPORTED_FORMAT: "Skipped — unsupported format",
  SKIPPED_UNRESOLVED_PROVIDER: "Skipped — provider not resolved",
  SKIPPED_UNPARSEABLE: "Skipped — could not parse",
  SKIPPED_NO_DATA: "Skipped — no data found",
};

function downloadUnresolvedCsv(rows: { mnoName: string; country: string }[]) {
  const csv = ["MNO Name,Country", ...rows.map((r) => `"${r.mnoName.replace(/"/g, '""')}","${r.country.replace(/"/g, '""')}"`)].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "unresolved-operators.csv";
  link.click();
  URL.revokeObjectURL(url);
}

// Multi-Carrier Reach List ZIP Batch Ingestion — a distinct upload path
// from the single-file Reach List Upload card above: one archive of many
// carriers' own single-provider reach-list exports (Excel/xls, a
// Comfone-style PDF customer list, or an Outlook .msg), auto-identified
// per file rather than read from a shared Provider column. See
// apps/api/src/upload/reachlist-zip-batch.service.ts for the full design
// rationale — kept entirely separate from UploadCard/uploadReachlist
// above so neither upload path can regress the other.
function ReachlistZipBatchCard({ onUploaded, isAdmin }: { onUploaded: () => void; isAdmin: boolean }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [replace, setReplace] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const pendingFileRef = React.useRef<File | null>(null);
  const [result, setResult] = React.useState<ReachlistZipBatchResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function doUpload(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("replace", String(replace));
      const res = await api.postForm<ReachlistZipBatchResult>("/upload/reachlist-zip", formData);
      setResult(res);
      onUploaded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleFile(file: File) {
    if (replace) {
      pendingFileRef.current = file;
      setConfirmOpen(true);
      return;
    }
    doUpload(file);
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography variant="h6" fontWeight={700}>
            Multi-Carrier Reach List ZIP Upload (Batch Ingestion)
          </Typography>
          <Tooltip title="Upload a single .zip archive containing heterogeneous carrier files (.xlsx, .xls, .pdf, .msg). The engine automatically classifies formats, identifies providers, and normalizes routes.">
            <InfoOutlinedIcon fontSize="small" sx={{ color: "text.disabled" }} />
          </Tooltip>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Upload a single .zip archive containing several carriers&apos; own reach-list exports at once —
          each file is identified by its own filename (e.g. &quot;BICS SS7.xlsx&quot;, &quot;Comfone
          Customer List.pdf&quot;), not a shared Provider column.
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
          Supports .xlsx, .xls, .pdf (Comfone-style customer list export), and .msg (an Outlook email with
          a pasted partner table or list). A file whose provider or table structure can&apos;t be
          confidently recognized is skipped and reported rather than guessed at — see the breakdown below
          after uploading.
        </Typography>
        <FormControlLabel
          sx={{ display: "block", mb: 1 }}
          control={
            <Checkbox
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
              disabled={busy || !isAdmin}
              color="warning"
            />
          }
          label={
            <Typography variant="body2">
              <strong>Replace records from these files</strong> — for each file in the archive, deletes
              existing Reach List records previously loaded from a file with that same name before
              ingesting (asks for confirmation). Records from files not in this archive are not affected.
            </Typography>
          }
        />
        <Tooltip title={!isAdmin ? ADMIN_ONLY_TOOLTIP : ""}>
          <span>
            <Button
              variant="contained"
              component="label"
              color={replace ? "warning" : "primary"}
              startIcon={<FolderZipIcon />}
              disabled={busy || !isAdmin}
            >
              {busy ? "Uploading..." : "Choose .zip archive"}
              <input
                ref={inputRef}
                type="file"
                hidden
                accept=".zip"
                disabled={!isAdmin}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </Button>
          </span>
        </Tooltip>

        <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
          <DialogTitle>Replace records from these files?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              For every file inside this archive, this will permanently delete existing Reach List records
              whose source file matches that file&apos;s name, before ingesting the new data. Reach List
              data loaded from any file <em>not</em> in this archive is not touched. This cannot be undone.
              Continue?
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              color="warning"
              variant="contained"
              onClick={() => {
                setConfirmOpen(false);
                if (pendingFileRef.current) doUpload(pendingFileRef.current);
              }}
            >
              Replace &amp; Upload
            </Button>
          </DialogActions>
        </Dialog>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        {result && (
          <Box sx={{ mt: 2 }}>
            <Alert severity={result.uploadHistory.status === "SUCCESS" ? "success" : "warning"} sx={{ mb: 2 }}>
              {result.totalFilesInArchive} file(s) in archive — {result.filesProcessed} processed,{" "}
              {result.filesSkipped} skipped — {result.totalRecordsLoaded} record(s) loaded.
            </Alert>

            <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, mb: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>File</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Carrier / Provider</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Records Loaded</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Unresolved MNOs</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Note</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.files.map((f, i) => (
                    <TableRow key={i}>
                      <TableCell sx={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.filename}>
                        {f.filename}
                      </TableCell>
                      <TableCell>{f.inferredProvider ?? "—"}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={FILE_STATUS_LABEL[f.status] ?? f.status}
                          color={f.status === "PROCESSED" ? "success" : "default"}
                          variant={f.status === "PROCESSED" ? "filled" : "outlined"}
                        />
                      </TableCell>
                      <TableCell align="right">{f.recordsLoaded}</TableCell>
                      <TableCell align="right">{f.unresolvedMnoCount || "—"}</TableCell>
                      <TableCell sx={{ maxWidth: 280 }}>
                        <Typography variant="caption" color="text.secondary">
                          {f.note ?? ""}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {result.unresolvedMnos.length > 0 && (
              <Alert
                severity="warning"
                action={
                  <Button
                    size="small"
                    startIcon={<DownloadIcon />}
                    onClick={() => downloadUnresolvedCsv(result.unresolvedMnos)}
                  >
                    Download CSV
                  </Button>
                }
              >
                {result.unresolvedMnos.length} operator(s) across this archive weren&apos;t found in the
                platform (no TADIG to attach to) — add them via IR.21 upload first, or confirm the
                operator name/country match.
              </Alert>
            )}

            {result.errors.length > 0 && (
              <List dense sx={{ maxHeight: 200, overflow: "auto", bgcolor: "background.default", mt: 1, borderRadius: 1 }}>
                {result.errors.map((e, i) => (
                  <ListItem key={i}>
                    <ListItemText primary={e} primaryTypographyProps={{ variant: "caption" }} />
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

// Full, unscoped purge — deliberately its own explicit action rather than
// a mode on either Reach List upload card above (both of those are
// scoped to a single sourceFile precisely so an admin re-uploading one
// updated file can never accidentally wipe data loaded from any other
// file). This one has no such scoping: every Reach List record, from
// every source, gone.
function DeleteAllReachlistCard({ onDeleted, isAdmin }: { onDeleted: () => void; isAdmin: boolean }) {
  const [busy, setBusy] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  async function handleDelete() {
    setConfirmOpen(false);
    setBusy(true);
    try {
      const res = await api.delete<PurgeReachlistResult>("/upload/reachlist/all");
      setToast(`Deleted ${res.deletedCount} Reach List record(s).`);
      onDeleted();
    } catch (err) {
      setToast(err instanceof ApiError ? `Delete failed: ${err.message}` : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card sx={{ borderColor: "error.main", borderWidth: 1, borderStyle: "solid" }}>
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography variant="h6" fontWeight={700} color="error.main">
            Delete All Reach List Data
          </Typography>
          <Tooltip title="Caution: Permanently purges commercial reach list records to allow a clean baseline re-upload. IR.21 technical declarations remain unaffected.">
            <InfoOutlinedIcon fontSize="small" sx={{ color: "error.main" }} />
          </Tooltip>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Permanently removes every Reach List record platform-wide, regardless of which file or upload it
          came from — an unscoped purge, not the per-file &quot;Replace&quot; option on the upload cards
          above. IR.21-sourced connectivity data is not affected. Use this to clear out legacy data before a
          clean re-import, not as a routine step.
        </Typography>
        <Tooltip title={!isAdmin ? ADMIN_ONLY_TOOLTIP : ""}>
          <span>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteForeverIcon />}
              onClick={() => setConfirmOpen(true)}
              disabled={busy || !isAdmin}
            >
              {busy ? "Deleting..." : "Delete All Reach List Data"}
            </Button>
          </span>
        </Tooltip>

        <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
          <DialogTitle>Delete all Reach List data?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Are you sure you want to delete <strong>all</strong> existing Reach List data? Every record
              from every upload — single-file, wide-matrix, and ZIP batch alike — will be permanently
              removed, and every operator&apos;s Comparison Grid will show no Reach List side until new data
              is ingested. This action cannot be undone.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button color="error" variant="contained" onClick={handleDelete}>
              Delete All
            </Button>
          </DialogActions>
        </Dialog>

        <Snackbar
          open={!!toast}
          autoHideDuration={4500}
          onClose={() => setToast(null)}
          message={toast}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        />
      </CardContent>
    </Card>
  );
}

const RESET_CONFIRMATION_PIN = "12345";

function ResetIr21DatabaseCard({ onReset, isAdmin }: { onReset: () => void; isAdmin: boolean }) {
  const [busy, setBusy] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pin, setPin] = React.useState("");
  const [toast, setToast] = React.useState<string | null>(null);

  async function handleReset() {
    setBusy(true);
    try {
      const res = await api.delete<ResetIr21DatabaseResult>(`/upload/reset-ir21-database?pin=${encodeURIComponent(pin)}`);
      setToast(`Reset complete — ${res.mnosDeleted} MNO record(s) and every dependent IR.21/Reach List row permanently deleted.`);
      setConfirmOpen(false);
      setPin("");
      onReset();
    } catch (err) {
      setToast(err instanceof ApiError ? `Reset failed: ${err.message}` : "Reset failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card sx={{ borderColor: "error.main", borderWidth: 2, borderStyle: "solid" }}>
      <CardContent>
        <Typography variant="h6" fontWeight={700} color="error.main">
          Reset IR.21 &amp; MNO Master Database
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Permanently deletes <strong>every</strong> MNO record platform-wide, and every row a foreign key
          requires be gone with it: all IR.21 declarations, all Reach List connectivity, discrepancies,
          overrides, and pending normalization entries. Effectively a full reset back to a day-zero empty
          operator universe, ready for a fresh IR.21 upload. Registered providers and their aliases are
          <em> not</em> affected. This is far broader than &quot;Delete All Reach List Data&quot; above —
          use it only when you mean to start over completely.
        </Typography>
        <Tooltip title={!isAdmin ? ADMIN_ONLY_TOOLTIP : ""}>
          <span>
            <Button
              variant="outlined"
              color="error"
              startIcon={<ReportProblemIcon />}
              onClick={() => setConfirmOpen(true)}
              disabled={busy || !isAdmin}
            >
              {busy ? "Resetting..." : "Reset IR.21 & MNO Database"}
            </Button>
          </span>
        </Tooltip>

        <Dialog open={confirmOpen} onClose={() => { setConfirmOpen(false); setPin(""); }}>
          <DialogTitle>Reset the entire IR.21 &amp; MNO Master database?</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ mb: 2 }}>
              This deletes every MNO, every IR.21 declaration, and every Reach List connectivity record
              platform-wide — nothing is scoped, nothing is recoverable. MNO / Cust Search, Provider Search,
              and every comparison view will show an empty MNO / Cust universe until new IR.21/Reach List data
              is uploaded. Registered providers themselves are kept.
            </DialogContentText>
            <DialogContentText sx={{ mb: 1 }}>
              Type the confirmation PIN to proceed:
            </DialogContentText>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="Confirmation PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && pin === RESET_CONFIRMATION_PIN && handleReset()}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => { setConfirmOpen(false); setPin(""); }}>Cancel</Button>
            <Button color="error" variant="contained" disabled={pin !== RESET_CONFIRMATION_PIN || busy} onClick={handleReset}>
              Reset Everything
            </Button>
          </DialogActions>
        </Dialog>

        <Snackbar
          open={!!toast}
          autoHideDuration={6000}
          onClose={() => setToast(null)}
          message={toast}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        />
      </CardContent>
    </Card>
  );
}

function DsxBackfillCard({ isAdmin }: { isAdmin: boolean }) {
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<DsxBackfillResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.post<DsxBackfillResult>("/upload/backfill-dsx"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Backfill failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="h6" fontWeight={700}>
          DSX (LTE/Diameter) Backfill
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Links MNOs to a DSX provider using LTE/Diameter data already captured on their last IR.21
          upload, for MNOs ingested before DSX got its own dedicated extraction.
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
          This reads from already-stored connectivity data — it does not re-parse the original XML
          (not retained after ingestion). To pick up carriers only the newer LTE/Diameter extraction
          paths would find, re-upload the active IR.21 batch instead (with &quot;Replace Active
          Dataset&quot;).
        </Typography>
        <Tooltip title={!isAdmin ? "Administrator privileges required to run this action." : ""}>
          <span>
            <Button variant="outlined" startIcon={<LanIcon />} onClick={run} disabled={busy || !isAdmin}>
              {busy ? "Running…" : "Run DSX Backfill"}
            </Button>
          </span>
        </Tooltip>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
        {result && (
          <Alert severity="success" sx={{ mt: 2 }}>
            Scanned {result.scanned} MNO(s) with LTE data — created {result.created} new DSX link(s),{" "}
            {result.alreadyLinked} already linked, {result.unmapped} unmapped.
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export default function UploadPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === Role.ADMIN;
  const [history, setHistory] = React.useState<UploadHistoryRow[]>([]);

  const loadHistory = React.useCallback(() => {
    api.get<UploadHistoryRow[]>("/upload/history").then(setHistory).catch(() => {});
  }, []);

  React.useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <RequireAuth>
      <AppShell>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
          IR.21 &amp; Reach List Uploads
        </Typography>
        <ReadOnlyBanner />
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <Grid item xs={12} md={6}>
            <XmlBatchUploadCard onUploaded={loadHistory} isAdmin={isAdmin} />
          </Grid>
          <Grid item xs={12} md={6}>
            <UploadCard
              title="Reach List Upload"
              description="Upload a connectivity provider's reach list. Supports both standard transposed files (Provider, Country, MNO, TADIG, Services) and wide Competitor Coverage matrix sheets."
              endpoint="/upload/reachlist"
              columnsHint="Provider, Country, MNO, TADIG, Services — or a wide matrix with MNO, Country, and one column per wholesale provider"
              onUploaded={loadHistory}
              isAdmin={isAdmin}
              formatGuide={{
                formats: [
                  {
                    title: "Format 1 — Standard Transposed",
                    columns: "Provider, Country, MNO, TADIG, Services, Connection Type (optional — e.g. Direct, On-Net, Peering)",
                    sampleHref: "/samples/reachlist-standard-transposed-template.xlsx",
                    sampleLabel: "Download sample (standard)",
                  },
                  {
                    title: "Format 2 — Wide Matrix",
                    columns: "MNO, Country, then one column per wholesale provider — each cell lists the services (e.g. \"SCCP, DSX\") that provider claims for that row's MNO, blank if none",
                    sampleHref: "/samples/reachlist-wide-matrix-template.xlsx",
                    sampleLabel: "Download sample (wide matrix)",
                  },
                ],
              }}
              replaceOption={{
                label: (
                  <>
                    <strong>Replace records from this file</strong> — deletes existing Reach List records
                    previously loaded from a file with this same name before ingesting this upload (asks for
                    confirmation). Records from other Reach List files are not affected.
                  </>
                ),
                confirmTitle: "Replace records from this file?",
                confirmText: (
                  <>
                    This will permanently delete every existing Reach List record whose source file matches the
                    one you&apos;re about to upload, before ingesting the new data — so an operator, provider, or
                    service removed from this newer version won&apos;t linger as a stale record. Reach List data
                    loaded from any <em>other</em> file is not touched. This cannot be undone. Continue?
                  </>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <DsxBackfillCard isAdmin={isAdmin} />
          </Grid>
          <Grid item xs={12}>
            <ReachlistZipBatchCard onUploaded={loadHistory} isAdmin={isAdmin} />
          </Grid>
          <Grid item xs={12}>
            <DeleteAllReachlistCard onDeleted={loadHistory} isAdmin={isAdmin} />
          </Grid>
          <Grid item xs={12}>
            <ResetIr21DatabaseCard onReset={loadHistory} isAdmin={isAdmin} />
          </Grid>
        </Grid>

        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
          Upload History
        </Typography>
        <DataGrid<UploadHistoryRow>
          rowData={history}
          columnDefs={[
            { field: "filename", headerName: "Filename", flex: 1.5 },
            {
              field: "uploadTime",
              headerName: "Uploaded",
              valueFormatter: (p) => new Date(p.value).toLocaleString(),
            },
            { field: "uploadedBy", headerName: "Uploaded By" },
            { field: "recordsLoaded", headerName: "Records Loaded" },
            {
              field: "status",
              headerName: "Status",
              cellRenderer: (p: { value: string }) => (
                <Chip
                  size="small"
                  label={p.value}
                  color={p.value === "SUCCESS" ? "success" : p.value === "PARTIAL" ? "warning" : "error"}
                />
              ),
            },
            {
              field: "isCurrentActive",
              headerName: "Active Baseline",
              cellRenderer: (p: { value: boolean }) =>
                p.value ? <Chip size="small" label="ACTIVE" color="info" /> : null,
            },
          ]}
        />
      </AppShell>
    </RequireAuth>
  );
}
