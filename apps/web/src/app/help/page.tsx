"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";
import { Role } from "@ccip/shared-types";

interface FeatureSection {
  menuLabel: string;
  route: string;
  ctaLabel: string;
  adminOnly?: boolean;
  points: string[];
  subsections?: { title: string; points: string[] }[];
}

const SECTIONS: FeatureSection[] = [
  {
    menuLabel: "Dashboard",
    route: "/dashboard",
    ctaLabel: "Open Dashboard",
    points: [
      "Active Baseline Tracker — real-time visibility into the currently loaded IR.21 XML batch: filename, upload timestamp, and total MNO count.",
      "Interactive KPI summary cards — Total MNOs, Canonical Providers, Total Connections, SCCP, DSX/LTE Diameter, and IPX relationships. Every card is a direct click-through link into the relevant search or filtered view.",
      "Live user presence — the header shows how many users are online right now alongside your own cumulative login count.",
    ],
  },
  {
    menuLabel: "Operator (MNO) Search",
    route: "/search/mno",
    ctaLabel: "Open Operator Search",
    points: [
      "Multi-parameter filtering by Operator Name, TADIG code, Country, and MCC/MNC, with database-backed autocomplete suggestions as you type.",
      "Search criteria and results are synchronized to the URL — browser Back/Forward restores the exact search you had, not a blank page.",
      "Select 2-5 operators via the row checkboxes to open the Operator Comparison Matrix — a side-by-side breakdown of every wholesale carrier connected to any of them, split by IR.21 Declared vs. Reach List Claimed per service, with CSV export.",
    ],
    subsections: [
      {
        title: "Operator Detail page",
        points: [
          "Roaming Signaling (SCCP), Data & LTE Roaming (DSX/IPX), inter-PMN IP subnets, DPC point codes, Diameter Edge Agent FQDN, and operational contacts.",
          "Comparison Grid — every IR.21-declared provider for a service rendered as clickable chips, color-coded against what the Reach List claims (green = confirmed both sides, blue = IR.21-only, orange = Reach-List-only), with a live match/discrepancy counter.",
          "One-click \"View Original IR.21 PDF\" to inspect the official GSMA document in-browser, when one was uploaded for that operator.",
        ],
      },
    ],
  },
  {
    menuLabel: "Provider Search",
    route: "/search/provider",
    ctaLabel: "Open Provider Search",
    points: [
      "Canonical carrier master — raw declared strings from source documents are normalized and consolidated down to the platform's true Tier-1/Tier-2 wholesale provider list, so \"BICS\", \"Belgacom\", and \"Belgacom International Carrier Services\" all resolve to one row.",
      "Source filter — view a provider's footprint \"As per IR.21 Data\", \"As per Reach List\", or \"Both (Combined)\" side by side.",
      "Select 2-5 providers via the row checkboxes to open the Provider Comparison Matrix, or select both the IR.21 and Reach List row of the same provider to jump straight to its own IR.21-vs-Reach-List breakdown.",
    ],
    subsections: [
      {
        title: "Provider Detail page",
        points: [
          "Heading and badge make explicit which source you're looking at — GSMA IR.21 Declared, Reach List Claimed, or the consolidated Both view.",
          "On-Net MNO List with dual top-and-bottom pagination (built for large footprints — BICS alone spans 300+ MNOs) and a per-row IR.21 PDF button.",
        ],
      },
    ],
  },
  {
    menuLabel: "Admin Menu",
    route: "/admin",
    ctaLabel: "Open Admin Menu",
    adminOnly: true,
    points: [
      "IR.21 & Reach List Uploads — bulk-ingest GSMA IR.21 XML/ZIP archives (auto-pairing XML with paired PDFs by TADIG) and Reach List Excel files, with an opt-in \"Replace Active Dataset\" toggle for a clean full-baseline swap, plus recent upload history.",
      "Unmapped Variants Queue — triage raw carrier-name strings encountered during ingestion that didn't match any known provider, with a compact scrollable view of every affected MNO and a \"Map Per Operator\" drill-down for granular per-MNO assignment.",
      "Provider Overrides & Normalization Audit — pin a specific provider to one MNO+service permanently (survives future re-uploads), and audit every canonical provider's registered alias variants (e.g. \"FT\" -> Orange, \"N/A\" -> Others/Unassigned) with live occurrence counts.",
      "User Access & Roles — every registered user (local and Microsoft SSO), with instant role changes (VIEWER/ANALYST/ADMIN) and account activation/deactivation that takes effect on the user's very next request.",
    ],
  },
];

function SectionCard({ section }: { section: FeatureSection }) {
  const router = useRouter();
  const { user } = useAuth();
  const isRestricted = !!section.adminOnly && user?.role !== Role.ADMIN;

  return (
    <Card sx={{ mb: 3, breakInside: "avoid" }} className="help-section">
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1, mb: 1 }}>
          <Typography variant="h6" fontWeight={700}>
            {section.menuLabel}
          </Typography>
          {isRestricted && <Chip size="small" color="warning" label="ADMIN ONLY" />}
        </Box>

        <List dense disablePadding>
          {section.points.map((point) => (
            <ListItem key={point} disableGutters alignItems="flex-start">
              <ListItemIcon sx={{ minWidth: 32, mt: 0.3 }}>
                <CheckCircleOutlineIcon fontSize="small" color="primary" />
              </ListItemIcon>
              <ListItemText primary={point} />
            </ListItem>
          ))}
        </List>

        {section.subsections?.map((sub) => (
          <Box key={sub.title} sx={{ mt: 2 }}>
            <Typography variant="subtitle2" fontWeight={700} color="text.secondary" gutterBottom>
              {sub.title}
            </Typography>
            <List dense disablePadding>
              {sub.points.map((point) => (
                <ListItem key={point} disableGutters alignItems="flex-start">
                  <ListItemIcon sx={{ minWidth: 32, mt: 0.3 }}>
                    <CheckCircleOutlineIcon fontSize="small" color="secondary" />
                  </ListItemIcon>
                  <ListItemText primary={point} />
                </ListItem>
              ))}
            </List>
          </Box>
        ))}

        <Button
          className="no-print"
          variant="outlined"
          endIcon={<ArrowForwardIcon />}
          onClick={() => router.push(section.route)}
          sx={{ mt: 2 }}
        >
          {section.ctaLabel}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function HelpPage() {
  const [today] = React.useState(() => new Date().toLocaleDateString());

  return (
    <RequireAuth>
      <AppShell>
        {/* Print-only styling: this page is meant to double as the source for
           "Download Platform Guide (PDF)" via the browser's native print-to-
           PDF, rather than a canvas-screenshot library (jsPDF+html2canvas)
           — real, selectable text and clean automatic pagination beat a
           rasterized screenshot for a text-heavy reference document like
           this, at zero added bundle weight. .no-print hides the AppShell
           chrome and CTA buttons (meaningless on paper); each .help-section
           avoids splitting across a page break where possible. */}
        <style>{`
          @media print {
            .MuiDrawer-root, .MuiAppBar-root, .no-print { display: none !important; }
            main { padding: 0 !important; }
            .help-section { break-inside: avoid; page-break-inside: avoid; box-shadow: none !important; border: 1px solid #ccc; }
          }
        `}</style>

        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 2, mb: 1 }}>
          <Box>
            <Typography variant="h5" fontWeight={700}>
              Platform Guide &amp; Help
            </Typography>
            <Typography variant="body2" color="text.secondary">
              CCIP — Connectivity Coverage Intelligence Platform · Guide generated {today}
            </Typography>
          </Box>
          <Button
            className="no-print"
            variant="contained"
            startIcon={<PictureAsPdfIcon />}
            onClick={() => window.print()}
          >
            Download Platform Guide (PDF)
          </Button>
        </Box>

        <Card sx={{ mb: 3 }} className="help-section">
          <CardContent>
            <Typography variant="h6" fontWeight={700} gutterBottom>
              Platform Overview
            </Typography>
            <Typography variant="body2">
              CCIP is a roaming intelligence engine that cross-references GSMA IR.21 XML documents against
              carrier Reach Lists for every MNO, wholesale IPX/SCCP provider, and business-development
              opportunity in your dataset — surfacing exactly where declared interconnects and commercially
              claimed footprints agree, and where they don&apos;t.
            </Typography>
          </CardContent>
        </Card>

        <Divider sx={{ mb: 3 }} className="no-print" />

        {SECTIONS.map((section) => (
          <SectionCard key={section.route} section={section} />
        ))}

        <Alert severity="info" className="no-print" sx={{ mt: 2 }}>
          Clicking &quot;Download Platform Guide (PDF)&quot; opens your browser&apos;s print dialog — choose
          &quot;Save as PDF&quot; as the destination for a clean, text-searchable copy of this guide.
        </Alert>
      </AppShell>
    </RequireAuth>
  );
}
