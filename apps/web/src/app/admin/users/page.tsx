"use client";

import * as React from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Switch,
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
import BlockIcon from "@mui/icons-material/Block";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { AuthProvider, Role, UserRow } from "@ccip/shared-types";

const ROLE_OPTIONS: Role[] = [Role.ADMIN, Role.ANALYST, Role.VIEWER];

function SummaryBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Grid item xs={6} sm={3}>
      <Card variant="outlined" sx={{ borderTop: 4, borderColor: color }}>
        <CardContent>
          <Typography variant="overline" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="h5" fontWeight={700}>
            {value}
          </Typography>
        </CardContent>
      </Card>
    </Grid>
  );
}

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [q, setQ] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    api
      .get<UserRow[]>(`/users?${params.toString()}`)
      .then(setUsers)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load users"));
  }, [q]);

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRoleChange(u: UserRow, role: Role) {
    setBusyId(u.id);
    setError(null);
    try {
      await api.put(`/users/${u.id}/role`, { role });
      setToast(`${u.name ?? u.email} is now ${role}.`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update role");
    } finally {
      setBusyId(null);
    }
  }

  async function handleStatusToggle(u: UserRow) {
    setBusyId(u.id);
    setError(null);
    try {
      const nextActive = !u.isActive;
      await api.put(`/users/${u.id}/status`, { isActive: nextActive });
      setToast(`${u.name ?? u.email} is now ${nextActive ? "active" : "deactivated"}.`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update status");
    } finally {
      setBusyId(null);
    }
  }

  const counts = React.useMemo(
    () => ({
      total: users.length,
      admin: users.filter((u) => u.role === Role.ADMIN).length,
      analyst: users.filter((u) => u.role === Role.ANALYST).length,
      viewer: users.filter((u) => u.role === Role.VIEWER).length,
    }),
    [users],
  );

  return (
    <RequireAuth roles={[Role.ADMIN]}>
      <AppShell>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
          User Access &amp; Roles
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Every registered user — local seeded accounts and Microsoft SSO sign-ins alike. Change a role and it
          takes effect on that user&apos;s very next request; no re-login required.
        </Typography>

        <Grid container spacing={2} sx={{ mb: 3 }}>
          <SummaryBadge label="Total Users" value={counts.total} color="#0A2540" />
          <SummaryBadge label="Admins" value={counts.admin} color="#C62828" />
          <SummaryBadge label="Analysts" value={counts.analyst} color="#0B6FBF" />
          <SummaryBadge label="Viewers" value={counts.viewer} color="#2E7D32" />
        </Grid>

        <Paper sx={{ p: 2, mb: 2 }}>
          <TextField
            size="small"
            label="Search by name or email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            sx={{ minWidth: 320 }}
          />
        </Paper>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>User Name &amp; Email</TableCell>
                <TableCell>Sign-In Type</TableCell>
                <TableCell>Current Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Joined Date</TableCell>
                <TableCell>Last Active</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => {
                const isSelf = currentUser?.id === u.id;
                return (
                  <TableRow key={u.id} sx={{ opacity: u.isActive ? 1 : 0.6 }}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {u.name ?? <em>No name on file</em>}
                        {isSelf && " (you)"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {u.email}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={u.authProvider === AuthProvider.MICROSOFT ? "Microsoft SSO" : "Local"}
                        color={u.authProvider === AuthProvider.MICROSOFT ? "primary" : "default"}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        size="small"
                        value={u.role}
                        disabled={busyId === u.id || isSelf}
                        onChange={(e) => handleRoleChange(u, e.target.value as Role)}
                        sx={{ minWidth: 130 }}
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <MenuItem key={r} value={r}>
                            {r}
                          </MenuItem>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={u.isActive ? "Active" : "Inactive"} color={u.isActive ? "success" : "default"} />
                    </TableCell>
                    <TableCell>{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : <em>Never</em>}</TableCell>
                    <TableCell>
                      <Tooltip title={isSelf ? "You cannot deactivate your own account" : u.isActive ? "Deactivate" : "Reactivate"}>
                        <span>
                          <Switch
                            size="small"
                            checked={u.isActive}
                            disabled={busyId === u.id || isSelf}
                            onChange={() => handleStatusToggle(u)}
                            icon={<BlockIcon fontSize="small" sx={{ p: "1px" }} />}
                          />
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                      No users found.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Snackbar
          open={!!toast}
          autoHideDuration={3500}
          onClose={() => setToast(null)}
          message={toast}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        />
      </AppShell>
    </RequireAuth>
  );
}
