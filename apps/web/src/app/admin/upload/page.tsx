"use client";

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import DataGrid from "@/components/DataGrid";
import { api, ApiError } from "@/lib/api";
import { Role, UploadHistoryRow, UploadResult } from "@ccip/shared-types";

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
          Admin Upload
        </Typography>
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <Grid item xs={12} md={6}>
            <UploadCard
              title="IR.21 Upload"
              description="Upload the GSMA IR.21-derived connectivity spreadsheet."
              endpoint="/upload/ir21"
              columnsHint="Country, Operator, TADIG, SCCP Provider, DSX Provider, IPX Provider"
              onUploaded={loadHistory}
            />
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
          ]}
        />
      </AppShell>
    </RequireAuth>
  );
}
