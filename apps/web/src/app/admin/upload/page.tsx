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
  Typography,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import FolderZipIcon from "@mui/icons-material/FolderZip";
import LanIcon from "@mui/icons-material/Lan";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import DataGrid from "@/components/DataGrid";
import { api, ApiError } from "@/lib/api";
import { splitZipForUpload } from "@/lib/splitZipForUpload";
import { BulkXmlUploadResult, DsxBackfillResult, Role, UploadHistoryRow, UploadResult } from "@ccip/shared-types";

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
}: {
  title: string;
  description: string;
  endpoint: string;
  columnsHint: string;
  onUploaded: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<UploadResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
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

  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="h6" fontWeight={700}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {description}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
          Expected columns: {columnsHint}
        </Typography>
        <Button
          variant="contained"
          component="label"
          startIcon={<UploadFileIcon />}
          disabled={busy}
        >
          {busy ? "Uploading..." : "Choose Excel file"}
          <input
            ref={inputRef}
            type="file"
            hidden
            accept=".xlsx,.xls"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </Button>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        {result && (
          <Box sx={{ mt: 2 }}>
            <Alert severity={result.uploadHistory.status === "SUCCESS" ? "success" : "warning"}>
              {result.uploadHistory.recordsLoaded} record(s) loaded — status: {result.uploadHistory.status}
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

function XmlBatchUploadCard({ onUploaded }: { onUploaded: () => void }) {
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
              disabled={busy}
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
        <Button
          variant="contained"
          component="label"
          color={replaceActiveDataset ? "warning" : "primary"}
          startIcon={<FolderZipIcon />}
          disabled={busy}
        >
          {busy ? "Uploading..." : "Choose .xml files or .zip"}
          <input
            ref={inputRef}
            type="file"
            hidden
            multiple
            accept=".xml,.zip"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
            }}
          />
        </Button>

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

function DsxBackfillCard() {
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
        <Button variant="outlined" startIcon={<LanIcon />} onClick={run} disabled={busy}>
          {busy ? "Running…" : "Run DSX Backfill"}
        </Button>

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
  const [history, setHistory] = React.useState<UploadHistoryRow[]>([]);

  const loadHistory = React.useCallback(() => {
    api.get<UploadHistoryRow[]>("/upload/history").then(setHistory).catch(() => {});
  }, []);

  React.useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <RequireAuth roles={[Role.ADMIN]}>
      <AppShell>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
          IR.21 &amp; Reach List Uploads
        </Typography>
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <Grid item xs={12} md={6}>
            <XmlBatchUploadCard onUploaded={loadHistory} />
          </Grid>
          <Grid item xs={12} md={6}>
            <UploadCard
              title="Reach List Upload"
              description="Upload a connectivity provider's published reach list."
              endpoint="/upload/reachlist"
              columnsHint="Provider, Country, MNO, TADIG, Services"
              onUploaded={loadHistory}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <DsxBackfillCard />
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
