"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AppBar,
  Box,
  Button,
  Chip,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import CellTowerIcon from "@mui/icons-material/CellTower";
import BusinessIcon from "@mui/icons-material/Business";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import { Role } from "@ccip/shared-types";
import { useAuth } from "@/lib/auth-context";
import LoginHistoryChip from "./LoginHistoryChip";
import OnlineUsersBadge from "./OnlineUsersBadge";

const DRAWER_WIDTH = 240;

const NAV_ITEMS: { href: string; label: string; icon: React.ReactNode; roles?: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard", icon: <DashboardIcon /> },
  { href: "/search/mno", label: "Operator Search", icon: <CellTowerIcon /> },
  { href: "/search/provider", label: "Provider Search", icon: <BusinessIcon /> },
  { href: "/admin", label: "Admin Menu", icon: <AdminPanelSettingsIcon />, roles: [Role.ADMIN] },
  { href: "/help", label: "Platform Guide & Help", icon: <MenuBookIcon /> },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700, letterSpacing: 0.5 }}>
            CCIP — Connectivity Coverage Intelligence Platform
          </Typography>
          {user && (
            <>
              <Chip label={`${user.email} · ${user.role}`} size="small" sx={{ color: "white", borderColor: "white" }} variant="outlined" />
              <OnlineUsersBadge />
              <LoginHistoryChip />
              <Button color="inherit" onClick={logout}>
                Logout
              </Button>
            </>
          )}
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: DRAWER_WIDTH, boxSizing: "border-box" },
        }}
      >
        <Toolbar />
        <List sx={{ mt: 1 }}>
          {visibleItems.map((item) => (
            <ListItemButton
              key={item.href}
              component={Link}
              href={item.href}
              selected={pathname === item.href || pathname.startsWith(item.href + "/")}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, bgcolor: "background.default", minHeight: "100vh" }}>
        <Toolbar />
        <Box sx={{ p: 3 }}>{children}</Box>
      </Box>
    </Box>
  );
}
