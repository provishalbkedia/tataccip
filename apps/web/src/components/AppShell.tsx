"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AppBar,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Link as MuiLink,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import LogoutIcon from "@mui/icons-material/Logout";
import RefreshIcon from "@mui/icons-material/Refresh";
import DashboardIcon from "@mui/icons-material/Dashboard";
import CellTowerIcon from "@mui/icons-material/CellTower";
import BusinessIcon from "@mui/icons-material/Business";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import { Role } from "@ccip/shared-types";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import LoginHistoryChip from "./LoginHistoryChip";
import OnlineUsersBadge from "./OnlineUsersBadge";

const DRAWER_WIDTH = 240;

const NAV_ITEMS: { href: string; label: string; icon: React.ReactNode; roles?: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard", icon: <DashboardIcon /> },
  { href: "/search/mno", label: "Operator Search", icon: <CellTowerIcon /> },
  { href: "/search/provider", label: "Provider Search", icon: <BusinessIcon /> },
  { href: "/admin", label: "Admin Menu", icon: <AdminPanelSettingsIcon /> },
  { href: "/help", label: "Platform Guide & Help", icon: <MenuBookIcon /> },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [accountAnchor, setAccountAnchor] = React.useState<HTMLElement | null>(null);
  const [warmingUp, setWarmingUp] = React.useState(false);

  const handleWarmUp = React.useCallback(async () => {
    setWarmingUp(true);
    try {
      await api.ping();
    } finally {
      setWarmingUp(false);
    }
  }, []);

  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

  const navList = (
    <List sx={{ mt: 1 }}>
      {visibleItems.map((item) => (
        <ListItemButton
          key={item.href}
          component={Link}
          href={item.href}
          onClick={() => setMobileOpen(false)}
          selected={pathname === item.href || pathname.startsWith(item.href + "/")}
          sx={{ minHeight: 48 }}
        >
          <ListItemIcon>{item.icon}</ListItemIcon>
          <ListItemText primary={item.label} />
        </ListItemButton>
      ))}
    </List>
  );

  // Pinned to the bottom of the sidebar (both permanent and temporary
  // variants) via the paper's flex column layout below — the standard
  // placement for legal links in an app nav, visible from every
  // authenticated page without cluttering the AppBar.
  const drawerFooter = (
    <Box sx={{ mt: "auto", px: 2, py: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
      <Typography variant="caption" color="text.secondary" display="block">
        © {new Date().getFullYear()} Tata Communications
      </Typography>
      <MuiLink component={Link} href="/privacy" variant="caption" onClick={() => setMobileOpen(false)}>
        Privacy Policy
      </MuiLink>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar sx={{ gap: { xs: 0.5, sm: 2 } }}>
          <IconButton
            color="inherit"
            edge="start"
            aria-label="Open navigation menu"
            onClick={() => setMobileOpen(true)}
            sx={{ display: { xs: "inline-flex", md: "none" }, minWidth: 44, minHeight: 44 }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700, letterSpacing: 0.5 }}>
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
              CCIP — Connectivity Coverage Intelligence Platform
            </Box>
            <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
              CCIP
            </Box>
          </Typography>
          <Tooltip title="Refresh data / Warm up server">
            <IconButton
              color="inherit"
              onClick={handleWarmUp}
              disabled={warmingUp}
              aria-label="Refresh data / Warm up server"
              sx={{ minWidth: 44, minHeight: 44 }}
            >
              <RefreshIcon
                fontSize="small"
                sx={warmingUp ? { animation: "spin 1s linear infinite", "@keyframes spin": { to: { transform: "rotate(360deg)" } } } : undefined}
              />
            </IconButton>
          </Tooltip>
          {user && (
            <>
              {/* Full badge row — desktop/tablet only */}
              <Box sx={{ display: { xs: "none", md: "flex" }, alignItems: "center", gap: 2 }}>
                <Chip label={`${user.email} · ${user.role}`} size="small" sx={{ color: "white", borderColor: "white" }} variant="outlined" />
                <OnlineUsersBadge />
                <LoginHistoryChip />
                <IconButton color="inherit" onClick={logout} title="Logout" sx={{ minWidth: 44, minHeight: 44 }}>
                  <LogoutIcon fontSize="small" />
                </IconButton>
              </Box>
              {/* Condensed avatar dropdown — mobile/tablet only */}
              <IconButton
                color="inherit"
                onClick={(e) => setAccountAnchor(e.currentTarget)}
                aria-label="Account menu"
                sx={{ display: { xs: "inline-flex", md: "none" }, minWidth: 44, minHeight: 44 }}
              >
                <AccountCircleIcon />
              </IconButton>
              <Menu anchorEl={accountAnchor} open={Boolean(accountAnchor)} onClose={() => setAccountAnchor(null)}>
                <MenuItem disabled sx={{ opacity: "1 !important", flexDirection: "column", alignItems: "flex-start" }}>
                  <Typography variant="body2" fontWeight={600}>
                    {user.email}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {user.role}
                  </Typography>
                </MenuItem>
                <Divider />
                {/* No onClick here (unlike Logout below) — these chips open
                   their own nested Popover on click, and closing this Menu
                   at the same time would unmount their anchor element out
                   from under it. */}
                <MenuItem sx={{ minHeight: 44 }}>
                  <OnlineUsersBadge dark={false} />
                </MenuItem>
                <MenuItem sx={{ minHeight: 44 }}>
                  <LoginHistoryChip dark={false} />
                </MenuItem>
                <Divider />
                <MenuItem onClick={logout} sx={{ minHeight: 44 }}>
                  <ListItemIcon>
                    <LogoutIcon fontSize="small" />
                  </ListItemIcon>
                  Logout
                </MenuItem>
              </Menu>
            </>
          )}
        </Toolbar>
      </AppBar>

      {/* Desktop/tablet: persistent sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: "none", md: "block" },
          width: DRAWER_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: DRAWER_WIDTH, boxSizing: "border-box", display: "flex", flexDirection: "column" },
        }}
      >
        <Toolbar />
        {navList}
        {drawerFooter}
      </Drawer>

      {/* Mobile/tablet: slide-over drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          [`& .MuiDrawer-paper`]: {
            width: Math.min(DRAWER_WIDTH + 40, 300),
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <Toolbar />
        {navList}
        {drawerFooter}
      </Drawer>

      <Box
        component="main"
        sx={{ flexGrow: 1, bgcolor: "background.default", minHeight: "100vh", width: { xs: "100%", md: `calc(100% - ${DRAWER_WIDTH}px)` } }}
      >
        <Toolbar />
        <Box sx={{ p: { xs: 1.5, sm: 3 } }}>{children}</Box>
      </Box>
    </Box>
  );
}
