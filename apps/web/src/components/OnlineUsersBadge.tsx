"use client";

import * as React from "react";
import { Box, Chip, List, ListItem, ListItemText, Popover, Typography } from "@mui/material";
import CircleIcon from "@mui/icons-material/Circle";
import { api } from "@/lib/api";
import { ActiveUsersInfo } from "@ccip/shared-types";

const POLL_MS = 30_000;

/** "N Online | M Total Logins" — "online" is a heuristic (lastActiveAt
 * within 5 minutes, updated on every authenticated request), not a real
 * presence/session system; JWT auth has no server-side session to query
 * directly. Distinct from LoginHistoryChip, which shows the *current
 * user's own* login count, not the platform-wide total. */
export default function OnlineUsersBadge({ dark = true }: { dark?: boolean }) {
  const [info, setInfo] = React.useState<ActiveUsersInfo | null>(null);
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    const load = () => api.get<ActiveUsersInfo>("/auth/active-users").then(setInfo).catch(() => {});
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  if (!info) return null;

  return (
    <>
      <Chip
        icon={<CircleIcon sx={{ color: "#4caf50 !important", fontSize: "10px !important" }} />}
        label={`${info.onlineUsersCount} Online | ${info.totalLoginsCount} Total Logins`}
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
        <Box sx={{ p: 2, minWidth: 240 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
            Active Now
          </Typography>
          <List dense>
            {info.onlineUsersList.map((u) => (
              <ListItem key={u.email} disableGutters>
                <ListItemText primary={u.email} secondary={u.role} />
              </ListItem>
            ))}
            {info.onlineUsersList.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No one else active right now.
              </Typography>
            )}
          </List>
        </Box>
      </Popover>
    </>
  );
}
