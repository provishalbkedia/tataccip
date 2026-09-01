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
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import LogoutIcon from "@mui/icons-material/Logout";
import RefreshIcon from "@mui/icons-material/Refresh";
import DashboardIcon from "@mui/icons-material/Dashboard";
import CellTowerIcon from "@mui/icons-material/CellTower";
import BusinessIcon from "@mui/icons-material/Business";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import TimelineIcon from "@mui/icons-material/Timeline";
import { Role } from "@ccip/shared-types";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import LoginHistoryChip from "./LoginHistoryChip";
import OnlineUsersBadge from "./OnlineUsersBadge";
import DisclaimerModal from "./DisclaimerModal";

const DRAWER_WIDTH = 240;
const DRAWER_WIDTH_COLLAPSED = 72;
const NAV_COLLAPSED_STORAGE_KEY = "ccip-nav-collapsed";

const NAV_ITEMS: { href: string; label: string; icon: React.ReactNode; roles?: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard", icon: <DashboardIcon /> },
  { href: "/search/mno", label: "MNO / Cust Search", icon: <CellTowerIcon /> },
  { href: "/search/provider", label: "Provider Search", icon: <BusinessIcon /> },
  { href: "/analytics/ir21-changes", label: "Market Intelligence", icon: <TimelineIcon /> },
  { href: "/admin", label: "Admin Menu", icon: <AdminPanelSettingsIcon /> },
  { href: "/help", label: "Platform Guide & Help", icon: <MenuBookIcon /> },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [accountAnchor, setAccountAnchor] = React.useState<HTMLElement | null>(null);
  const [warmingUp, setWarmingUp] = React.useState(false);
  const [disclaimerOpen, setDisclaimerOpen] = React.useState(false);
  // Desktop-only rail collapse (icons-only), independent of the mobile
  // temporary drawer's open/close state below. Persisted so the choice
  // survives a reload — read after mount (not as useState's initializer)
  // to avoid a server/client markup mismatch, since localStorage doesn't
  // exist during SSR.
  const [collapsed, setCollapsed] = React.useState(false);
  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(NAV_COLLAPSED_STORAGE_KEY) === "1");
    } catch {
      // Private browsing / storage blocked — default (expanded) stands.
    }
  }, []);
  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(NAV_COLLAPSED_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Same as above — collapse still works for this session either way.
      }
      return next;
    });
  }, []);

  const handleWarmUp = React.useCallback(async () => {
    setWarmingUp(true);
    try {
      await api.ping();
    } finally {
      setWarmingUp(false);
    }
  }, []);

  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

  // `railCollapsed` only ever applies to the permanent desktop drawer — the
  // mobile temporary drawer always renders this with railCollapsed=false,
  // since a collapsed icons-only rail defeats the point of a drawer the
  // user just explicitly opened to see the nav.
  const renderNavList = (railCollapsed: boolean) => (
    <List sx={{ mt: 1 }}>
      {visibleItems.map((item) => {
        const button = (
          <ListItemButton
            key={item.href}
            component={Link}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            selected={pathname === item.href || pathname.startsWith(item.href + "/")}
            sx={{ minHeight: 48, justifyContent: railCollapsed ? "center" : "flex-start", px: railCollapsed ? 1.5 : 2 }}
          >
            <ListItemIcon sx={{ minWidth: railCollapsed ? 0 : 40, justifyContent: "center" }}>{item.icon}</ListItemIcon>
            {!railCollapsed && <ListItemText primary={item.label} />}
          </ListItemButton>
        );
        return railCollapsed ? (
          <Tooltip key={item.href} title={item.label} placement="right">
            {button}
          </Tooltip>
        ) : (
          button
        );
      })}
    </List>
  );

  // Pinned to the bottom of the sidebar (both permanent and temporary
  // variants) via the paper's flex column layout below — the standard
  // placement for legal links in an app nav, visible from every
  // authenticated page without cluttering the AppBar.
  const drawerFooter = (
    <Box sx={{ mt: "auto", px: 2, py: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
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

      {/* Desktop/tablet: persistent sidebar, collapsible to an icons-only
         rail. Width transitions on both the Drawer and its paper use the
         same MUI transition mixin the component ships for exactly this —
         matches the easing/duration MUI's own collapsing nav examples use,
         rather than a hand-picked one that might drift from it. */}
      <Drawer
        variant="permanent"
        sx={(theme) => ({
          display: { xs: "none", md: "block" },
          width: collapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH,
          flexShrink: 0,
          transition: theme.transitions.create("width", {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
          [`& .MuiDrawer-paper`]: {
            width: collapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH,
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            overflowX: "hidden",
            transition: theme.transitions.create("width", {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
          },
        })}
      >
        <Toolbar />
        {renderNavList(collapsed)}
        <Box sx={{ flexGrow: 1 }} />
        <Box sx={{ display: "flex", justifyContent: collapsed ? "center" : "flex-end", px: 1, py: 1 }}>
          <Tooltip title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <IconButton onClick={toggleCollapsed} size="small" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              {collapsed ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>
        {!collapsed && drawerFooter}
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
        {renderNavList(false)}
        {drawerFooter}
      </Drawer>

      <Box
        component="main"
        sx={(theme) => ({
          flexGrow: 1,
          bgcolor: "background.default",
          minHeight: "100vh",
          width: { xs: "100%", md: `calc(100% - ${collapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH}px)` },
          transition: theme.transitions.create("width", {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        })}
      >
        <Toolbar />
        <Box sx={{ p: { xs: 1.5, sm: 3 } }}>{children}</Box>
        <Box
          component="footer"
          sx={{
            px: { xs: 1.5, sm: 3 },
            py: 2,
            borderTop: "1px solid",
            borderColor: "divider",
            textAlign: "center",
          }}
        >
          <Typography variant="caption" color="text.secondary">
            © CCIP Intelligence Platform · For Internal Analytical Use Only ·{" "}
            <MuiLink component="button" variant="caption" onClick={() => setDisclaimerOpen(true)} sx={{ verticalAlign: "baseline" }}>
              View Disclaimer &amp; Terms
            </MuiLink>
          </Typography>
        </Box>
      </Box>

      <DisclaimerModal open={disclaimerOpen} onClose={() => setDisclaimerOpen(false)} />
    </Box>
  );
}
