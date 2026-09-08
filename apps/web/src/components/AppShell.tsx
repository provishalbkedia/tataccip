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
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { Role } from "@ccip/shared-types";
import { useAuth } from "@/lib/auth-context";
import { useCopilot } from "@/context/CopilotContext";
import { api } from "@/lib/api";
import OnlineUsersBadge from "./OnlineUsersBadge";
import DisclaimerModal from "./DisclaimerModal";
import ExecutiveCopilot from "./assistant/ExecutiveCopilot";

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
  const { copilotEnabled, toggleCopilot } = useCopilot();
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
            sx={{
              minHeight: 48,
              justifyContent: railCollapsed ? "center" : "flex-start",
              px: railCollapsed ? 1.5 : 2,
              mx: railCollapsed ? 0 : 0.75,
              width: railCollapsed ? "100%" : "auto",
              borderRadius: railCollapsed ? 1 : "0 8px 8px 0",
              color: "#0A2540",
              // Reserved on every item (transparent when inactive) so the
              // active item's accent border doesn't shift its content
              // relative to its neighbors when selection changes.
              borderLeft: "4px solid transparent",
              "&:hover": { bgcolor: "#F1F5F9" },
              "&.Mui-selected": {
                bgcolor: "#0A2540",
                color: "#FFFFFF",
                borderLeft: "4px solid #00D4B2",
                "&:hover": { bgcolor: "#0A2540" },
              },
              "&.Mui-selected .MuiListItemIcon-root": { color: "#00D4B2" },
              "&.Mui-selected .MuiListItemText-primary": { fontWeight: 700, letterSpacing: "0.01em" },
            }}
          >
            <ListItemIcon sx={{ minWidth: railCollapsed ? 0 : 40, justifyContent: "center", color: "inherit" }}>{item.icon}</ListItemIcon>
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

  // Global AI Copilot on/off toggle -- lets power users suppress the
  // floating assistant (ExecutiveCopilot.tsx) entirely, no auto-open
  // popovers, no audio, not even present in the DOM. Rendered in both the
  // permanent and temporary drawers (see renderNavList above for the same
  // pattern), with a compact icon-only affordance when the rail is
  // collapsed since there's no room for the pill + label there.
  const renderCopilotToggle = (railCollapsed: boolean) =>
    railCollapsed ? (
      <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
        <Tooltip title={`AI Copilot: ${copilotEnabled ? "ON" : "OFF"} — click to toggle`} placement="right">
          <IconButton
            size="small"
            onClick={toggleCopilot}
            aria-label={copilotEnabled ? "Turn off AI Copilot" : "Turn on AI Copilot"}
            sx={{ color: copilotEnabled ? "#00D4B2" : "text.disabled" }}
          >
            <AutoAwesomeIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    ) : (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <AutoAwesomeIcon fontSize="small" sx={{ color: copilotEnabled ? "#00D4B2" : "text.disabled" }} />
          <Typography variant="body2" fontWeight={600}>
            AI Copilot
          </Typography>
        </Box>
        <Box
          component="button"
          onClick={toggleCopilot}
          role="switch"
          aria-checked={copilotEnabled}
          aria-label={copilotEnabled ? "Turn off AI Copilot" : "Turn on AI Copilot"}
          sx={{
            position: "relative",
            width: 56,
            height: 26,
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
            bgcolor: copilotEnabled ? "#00D4B2" : "#CBD5E1",
            transition: "background-color 0.2s ease",
            p: 0,
            flexShrink: 0,
          }}
        >
          <Box
            sx={{
              position: "absolute",
              top: 3,
              left: copilotEnabled ? 32 : 3,
              width: 20,
              height: 20,
              borderRadius: "50%",
              bgcolor: "#fff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              transition: "left 0.2s ease",
            }}
          />
          <Typography
            variant="caption"
            sx={{
              position: "absolute",
              top: "50%",
              transform: "translateY(-50%)",
              left: copilotEnabled ? 8 : "auto",
              right: copilotEnabled ? "auto" : 8,
              color: copilotEnabled ? "#0A2540" : "#475569",
              fontWeight: 800,
              fontSize: "0.6rem",
              letterSpacing: "0.03em",
              userSelect: "none",
            }}
          >
            {copilotEnabled ? "ON" : "OFF"}
          </Typography>
        </Box>
      </Box>
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
                {/* No onClick here (unlike Logout below) — this chip opens
                   its own nested Popover on click, and closing this Menu at
                   the same time would unmount its anchor element out from
                   under it. */}
                <MenuItem sx={{ minHeight: 44 }}>
                  <OnlineUsersBadge dark={false} />
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
        <Divider />
        {renderCopilotToggle(collapsed)}
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
        <Box sx={{ flexGrow: 1 }} />
        <Divider />
        {renderCopilotToggle(false)}
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
      {copilotEnabled && <ExecutiveCopilot />}
    </Box>
  );
}
