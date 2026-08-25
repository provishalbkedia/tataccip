"use client";

import * as React from "react";
import {
  Box,
  Chip,
  List,
  ListItem,
  ListItemText,
  Popover,
  Typography,
} from "@mui/material";
import LoginIcon from "@mui/icons-material/Login";
import { api } from "@/lib/api";
import { LoginHistorySummary } from "@ccip/shared-types";

/** Shows how many times the current user has logged in, and — on click — a
 * recent-activity list. Multiple concurrent logins from different browsers
 * are already unrestricted (stateless JWT auth, nothing to enable here);
 * this is purely a visibility feature. IP + browser/OS is the closest real
 * substitute for "which machine" — a web app can't see the client's actual
 * machine name, browsers don't expose that. */
export default function LoginHistoryChip({ dark = true }: { dark?: boolean }) {
  const [summary, setSummary] = React.useState<LoginHistorySummary | null>(null);
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    api.get<LoginHistorySummary>("/auth/login-history").then(setSummary).catch(() => {});
  }, []);

  if (!summary) return null;

  return (
    <>
      <Chip
        icon={<LoginIcon sx={dark ? { color: "white !important" } : undefined} />}
        label={`${summary.totalLogins} login${summary.totalLogins === 1 ? "" : "s"}`}
        size="small"
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={dark ? { color: "white", borderColor: "white", cursor: "pointer" } : { cursor: "pointer" }}
        variant="outlined"
      />
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Box sx={{ p: 2, maxWidth: 380 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
            Recent Login Activity
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Browser/OS and IP are the closest we can log — browsers don&apos;t expose the actual machine name to a
            web app.
          </Typography>
          <List dense sx={{ maxHeight: 320, overflowY: "auto" }}>
            {summary.recent.map((row) => (
              <ListItem key={row.id} disableGutters sx={{ display: "block", py: 0.5 }}>
                <ListItemText
                  primary={new Date(row.loginAt).toLocaleString()}
                  secondary={`${row.browserOs ?? "Unknown browser"} · ${row.ipAddress ?? "unknown IP"}`}
                />
              </ListItem>
            ))}
            {summary.recent.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No login history yet.
              </Typography>
            )}
          </List>
        </Box>
      </Popover>
    </>
  );
}
