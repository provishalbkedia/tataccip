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
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import BlockIcon from "@mui/icons-material/Block";
import CircleIcon from "@mui/icons-material/Circle";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import ReadOnlyBanner from "@/components/ReadOnlyBanner";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { AuthProvider, Role, UserRow } from "@ccip/shared-types";

const ROLE_OPTIONS: Role[] = [Role.ADMIN, Role.ANALYST, Role.VIEWER];
const ROLE_PRIORITY: Record<Role, number> = { [Role.ADMIN]: 0, [Role.ANALYST]: 1, [Role.VIEWER]: 2 };

// Same window the backend uses to decide "online" (ONLINE_WINDOW_MS in
// auth.service.ts) — a user's lastActiveAt within this long shows as live.
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function isOnline(u: UserRow): boolean {
  return !!u.lastActiveAt && Date.now() - new Date(u.lastActiveAt).getTime() < ONLINE_WINDOW_MS;
}

function formatTimeSpent(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0 && minutes === 0) return "< 1m";
  return `${hours}h ${minutes}m`;
}

/** Formats the "Last Session" column -- unlike formatTimeSpent above (which
 * always shows an "Xh Ym" pair, even "0h 5m"), this drops the hours
 * entirely under an hour ("28m", not "0h 28m") since a single session is
 * usually short enough that the leading "0h" is just noise. `hasSession` is
 * a separate flag rather than inferring "no session" from 0 seconds --
 * lastActiveAt null (never logged in) and "just started a session, 0
 * seconds accrued yet" both produce 0 seconds, and only the former should
 * read as "—". */
function formatLastSession(seconds: number, hasSession: boolean): string {
  if (!hasSession) return "—";
  if (seconds < 60) return "< 1m";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/** A short "how long ago" string for a user who isn't currently online —
 * coarse on purpose (this is a presence indicator, not an activity log). */
function formatLastSeen(lastActiveAt: string): string {
  const diffMs = Date.now() - new Date(lastActiveAt).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function PresenceIndicator({ lastActiveAt }: { lastActiveAt: string | null }) {
  const online = !!lastActiveAt && Date.now() - new Date(lastActiveAt).getTime() < ONLINE_WINDOW_MS;
  if (online) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "#2E7D32" }}>
        <CircleIcon sx={{ fontSize: 10 }} />
        <Typography variant="body2" fontWeight={600}>
          Online
        </Typography>
      </Box>
    );
  }
  return (
    <Typography variant="body2" color="text.secondary">
      {lastActiveAt ? `Offline · ${formatLastSeen(lastActiveAt)}` : "Offline"}
    </Typography>
  );
}

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

/** A single-select row of pill Chips — the same toggle-group pattern the
 * MNO/Provider Search pages use for Dataset Scope and Exclusivity Scope, so
 * this filter strip reads as the same design system rather than a one-off
 * set of dropdowns. */
function FilterPillGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
      {options.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          size="small"
          clickable
          onClick={() => onChange(o.value)}
          sx={
            value === o.value
              ? { bgcolor: "#0A2540", color: "#fff", fontWeight: 600, "&:hover": { bgcolor: "#0A2540" } }
              : { fontWeight: 500 }
          }
          variant={value === o.value ? "filled" : "outlined"}
        />
      ))}
    </Box>
  );
}

type SortField = "name" | "role" | "logins" | "lastLogin" | "lastSession" | "timeSpent" | "presence" | "status";
type SortOrder = "asc" | "desc";
type RoleFilter = "ALL" | Role;
type ProviderFilter = "ALL" | "MICROSOFT" | "LOCAL";
type StatusFilter = "ALL" | "ACTIVE" | "DISABLED";

const DEFAULT_SORT_FIELD: SortField = "lastLogin";
const DEFAULT_SORT_ORDER: SortOrder = "desc";

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  const [searchQuery, setSearchQuery] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<RoleFilter>("ALL");
  const [providerFilter, setProviderFilter] = React.useState<ProviderFilter>("ALL");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("ALL");
  const [onlineOnly, setOnlineOnly] = React.useState(false);
  const [sortField, setSortField] = React.useState<SortField>(DEFAULT_SORT_FIELD);
  const [sortOrder, setSortOrder] = React.useState<SortOrder>(DEFAULT_SORT_ORDER);

  const load = React.useCallback(() => {
    api
      .get<UserRow[]>("/users")
      .then(setUsers)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load users"));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

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

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      // Names/roles read naturally ascending (A→Z, Admin-first); the rest
      // (counts, dates, durations, presence, status) read naturally
      // descending (busiest/most-recent/live first) — matches what an
      // admin scanning this table for "who's most active" wants on the
      // very first click, not a second click to flip it.
      setSortOrder(field === "name" || field === "role" ? "asc" : "desc");
    }
  }

  const hasActiveFilters =
    !!searchQuery || roleFilter !== "ALL" || providerFilter !== "ALL" || statusFilter !== "ALL" || onlineOnly;

  function resetFilters() {
    setSearchQuery("");
    setRoleFilter("ALL");
    setProviderFilter("ALL");
    setStatusFilter("ALL");
    setOnlineOnly(false);
  }

  const visibleUsers = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let rows = users.filter((u) => {
      if (q && !`${u.name ?? ""} ${u.email}`.toLowerCase().includes(q)) return false;
      if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
      if (providerFilter !== "ALL" && u.authProvider !== providerFilter) return false;
      if (statusFilter === "ACTIVE" && !u.isActive) return false;
      if (statusFilter === "DISABLED" && u.isActive) return false;
      if (onlineOnly && !isOnline(u)) return false;
      return true;
    });

    const dir = sortOrder === "asc" ? 1 : -1;
    rows = rows.slice().sort((a, b) => {
      switch (sortField) {
        case "name":
          return dir * (a.name ?? a.email).localeCompare(b.name ?? b.email);
        case "role":
          return dir * (ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role]);
        case "logins":
          return dir * (a.loginCount - b.loginCount);
        case "timeSpent":
          return dir * (a.totalTimeSpentSeconds - b.totalTimeSpentSeconds);
        case "lastSession":
          return dir * (a.lastSessionDurationSeconds - b.lastSessionDurationSeconds);
        case "presence":
          return dir * (Number(isOnline(a)) - Number(isOnline(b)));
        case "status":
          return dir * (Number(a.isActive) - Number(b.isActive));
        case "lastLogin": {
          // Never-logged-in users sort to the bottom regardless of sort
          // direction — a null "last login" isn't meaningfully "earliest"
          // or "latest", it's just absent, so flipping the sort shouldn't
          // surface it at the top.
          if (!a.lastLoginAt && !b.lastLoginAt) return 0;
          if (!a.lastLoginAt) return 1;
          if (!b.lastLoginAt) return -1;
          return dir * (new Date(a.lastLoginAt).getTime() - new Date(b.lastLoginAt).getTime());
        }
        default:
          return 0;
      }
    });
    return rows;
  }, [users, searchQuery, roleFilter, providerFilter, statusFilter, onlineOnly, sortField, sortOrder]);

  const counts = React.useMemo(
    () => ({
      total: users.length,
      admin: users.filter((u) => u.role === Role.ADMIN).length,
      analyst: users.filter((u) => u.role === Role.ANALYST).length,
      viewer: users.filter((u) => u.role === Role.VIEWER).length,
    }),
    [users],
  );

  function SortableHeader({ field, label, align }: { field: SortField; label: string; align?: "right" }) {
    return (
      <TableCell align={align}>
        <TableSortLabel
          active={sortField === field}
          direction={sortField === field ? sortOrder : "asc"}
          onClick={() => handleSort(field)}
          sx={sortField === field ? { fontWeight: 700, color: "#0A2540 !important" } : undefined}
        >
          {label}
        </TableSortLabel>
      </TableCell>
    );
  }

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
        <ReadOnlyBanner />

        <Grid container spacing={2} sx={{ mb: 3 }}>
          <SummaryBadge label="Total Users" value={counts.total} color="#0A2540" />
          <SummaryBadge label="Admins" value={counts.admin} color="#C62828" />
          <SummaryBadge label="Analysts" value={counts.analyst} color="#0B6FBF" />
          <SummaryBadge label="Viewers" value={counts.viewer} color="#2E7D32" />
        </Grid>

        <Paper sx={{ p: 2, mb: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            <TextField
              size="small"
              label="Search by name or email"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ minWidth: 280 }}
            />
            {hasActiveFilters && (
              <Button size="small" startIcon={<RestartAltIcon fontSize="small" />} onClick={resetFilters}>
                Reset Filters
              </Button>
            )}
          </Box>

          <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                Role
              </Typography>
              <FilterPillGroup
                value={roleFilter}
                onChange={setRoleFilter}
                options={[
                  { value: "ALL", label: "All Roles" },
                  { value: Role.ADMIN, label: "Admin" },
                  { value: Role.ANALYST, label: "Analyst" },
                  { value: Role.VIEWER, label: "Viewer" },
                ]}
              />
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                Sign-In Type
              </Typography>
              <FilterPillGroup
                value={providerFilter}
                onChange={setProviderFilter}
                options={[
                  { value: "ALL", label: "All Providers" },
                  { value: "MICROSOFT", label: "Microsoft SSO" },
                  { value: "LOCAL", label: "Local" },
                ]}
              />
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                Status
              </Typography>
              <FilterPillGroup
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: "ALL", label: "All Status" },
                  { value: "ACTIVE", label: "Active" },
                  { value: "DISABLED", label: "Disabled" },
                ]}
              />
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                Live
              </Typography>
              <Chip
                icon={<CircleIcon sx={{ fontSize: "10px !important", color: onlineOnly ? "#fff !important" : "#2E7D32 !important" }} />}
                label="Online Only"
                size="small"
                clickable
                onClick={() => setOnlineOnly((v) => !v)}
                variant={onlineOnly ? "filled" : "outlined"}
                sx={onlineOnly ? { bgcolor: "#2E7D32", color: "#fff", fontWeight: 600, "&:hover": { bgcolor: "#2E7D32" } } : { fontWeight: 500 }}
              />
            </Box>
          </Box>
        </Paper>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Showing {visibleUsers.length} of {users.length} users
        </Typography>

        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <SortableHeader field="name" label="User Name & Email" />
                <TableCell>Sign-In Type</TableCell>
                <SortableHeader field="role" label="Current Role" />
                <SortableHeader field="status" label="Status" />
                <SortableHeader field="logins" label="Logins" align="right" />
                <SortableHeader field="lastLogin" label="Last Login" />
                <SortableHeader field="lastSession" label="Last Session" />
                <SortableHeader field="timeSpent" label="Time Spent" />
                <SortableHeader field="presence" label="Presence" />
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleUsers.map((u) => {
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
                      <Tooltip title={isSelf ? "You cannot change your own role" : ""}>
                        <span>
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
                        </span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={u.isActive ? "Active" : "Inactive"} color={u.isActive ? "success" : "default"} />
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                      {u.loginCount}
                    </TableCell>
                    <TableCell>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : <em>Never</em>}</TableCell>
                    <TableCell sx={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatLastSession(u.lastSessionDurationSeconds, !!u.lastActiveAt)}
                    </TableCell>
                    <TableCell sx={{ fontVariantNumeric: "tabular-nums" }}>{formatTimeSpent(u.totalTimeSpentSeconds)}</TableCell>
                    <TableCell>
                      <PresenceIndicator lastActiveAt={u.lastActiveAt} />
                    </TableCell>
                    <TableCell>
                      <Tooltip
                        title={
                          isSelf
                            ? "You cannot deactivate your own account"
                            : u.isActive
                              ? "Deactivate"
                              : "Reactivate"
                        }
                      >
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
              {visibleUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10}>
                    <Box sx={{ py: 2, textAlign: "center" }}>
                      <Typography variant="body2" color="text.secondary" component="span">
                        {users.length === 0
                          ? "No users found."
                          : "No users found matching current filters."}
                      </Typography>
                      {hasActiveFilters && (
                        <Button size="small" onClick={resetFilters} sx={{ ml: 1 }}>
                          Clear Filters
                        </Button>
                      )}
                    </Box>
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
