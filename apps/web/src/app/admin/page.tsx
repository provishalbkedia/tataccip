"use client";

import * as React from "react";
import Link from "next/link";
import { Box, Card, CardActionArea, CardContent, Grid, Typography } from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import RuleIcon from "@mui/icons-material/Rule";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import TuneIcon from "@mui/icons-material/Tune";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import ActiveBaselineBanner from "@/components/ActiveBaselineBanner";
import ReadOnlyBanner from "@/components/ReadOnlyBanner";

const SECTIONS = [
  {
    href: "/admin/upload",
    title: "IR.21 & Reach List Uploads",
    description: "Bulk-ingest GSMA IR.21 XML/ZIP archives (with paired PDFs) and Reach List Excel files.",
    icon: <UploadFileIcon fontSize="large" color="primary" />,
  },
  {
    href: "/admin/provider-aliases",
    title: "Unmapped Variants Queue",
    description: "Resolve raw carrier-name strings encountered during ingestion that didn't match any known alias.",
    icon: <RuleIcon fontSize="large" color="primary" />,
  },
  {
    href: "/admin/mno-normalization",
    title: "Unresolved Reach List Aliases",
    description: "Map Reach List rows that didn't match an existing IR.21 MNO to the correct operator — GSMA IR.21 stays the sole source of new MNO records.",
    icon: <FactCheckIcon fontSize="large" color="primary" />,
  },
  {
    href: "/admin/overrides",
    title: "Provider Overrides & Normalization Audit",
    description: "Per-operator provider overrides, and a full audit of how raw carrier-name variants consolidate into canonical providers.",
    icon: <TuneIcon fontSize="large" color="primary" />,
  },
  {
    href: "/admin/users",
    title: "User Access & Roles",
    description: "Promote or reassign signed-in users to VIEWER, ANALYST, or ADMIN, and suspend access when needed.",
    icon: <ManageAccountsIcon fontSize="large" color="primary" />,
  },
  {
    href: "/admin/architecture",
    title: "Platform Architecture (HLD & LLD)",
    description: "Microsoft Entra ID SSO integration design — system architecture, auth sequence, and security controls, for IT Security review reference.",
    icon: <AccountTreeIcon fontSize="large" color="primary" />,
  },
];

export default function AdminMenuPage() {
  return (
    <RequireAuth>
      <AppShell>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
          Admin Menu
        </Typography>
        <ReadOnlyBanner />
        <ActiveBaselineBanner />
        <Grid container spacing={2}>
          {SECTIONS.map((s) => (
            <Grid item xs={12} sm={6} key={s.href}>
              <Card sx={{ height: "100%" }}>
                <CardActionArea component={Link} href={s.href} sx={{ height: "100%" }}>
                  <CardContent>
                    <Box sx={{ mb: 1 }}>{s.icon}</Box>
                    <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
                      {s.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {s.description}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      </AppShell>
    </RequireAuth>
  );
}
