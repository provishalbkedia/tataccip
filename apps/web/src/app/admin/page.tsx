"use client";

import * as React from "react";
import Link from "next/link";
import { Box, Card, CardActionArea, CardContent, Grid, Typography } from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import MergeTypeIcon from "@mui/icons-material/MergeType";
import RuleIcon from "@mui/icons-material/Rule";
import TuneIcon from "@mui/icons-material/Tune";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import ActiveBaselineBanner from "@/components/ActiveBaselineBanner";
import { Role } from "@ccip/shared-types";

const SECTIONS = [
  {
    href: "/admin/upload",
    title: "IR.21 & Reach List Uploads",
    description: "Bulk-ingest GSMA IR.21 XML/ZIP archives (with paired PDFs) and Reach List Excel files.",
    icon: <UploadFileIcon fontSize="large" color="primary" />,
  },
  {
    href: "/admin/provider-merge",
    title: "Provider Mappings & Merge Tool",
    description: "Merge duplicate or junk provider records into a canonical provider, or into Others / Unassigned.",
    icon: <MergeTypeIcon fontSize="large" color="primary" />,
  },
  {
    href: "/admin/provider-aliases",
    title: "Unmapped Variants Queue",
    description: "Resolve raw carrier-name strings encountered during ingestion that didn't match any known alias.",
    icon: <RuleIcon fontSize="large" color="primary" />,
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
];

export default function AdminMenuPage() {
  return (
    <RequireAuth roles={[Role.ADMIN]}>
      <AppShell>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
          Admin Menu
        </Typography>
        <ActiveBaselineBanner />
        <Grid container spacing={2}>
          {SECTIONS.map((s) => (
            <Grid item xs={12} md={4} key={s.href}>
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
