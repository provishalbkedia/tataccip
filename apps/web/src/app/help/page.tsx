"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CellTowerIcon from "@mui/icons-material/CellTower";
import BusinessIcon from "@mui/icons-material/Business";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import DashboardIcon from "@mui/icons-material/Dashboard";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";
import { Role } from "@ccip/shared-types";

// ---------- Small reusable building blocks ----------

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <Alert icon={<InfoOutlinedIcon fontSize="small" />} severity="info" sx={{ mb: 2 }}>
      {children}
    </Alert>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <Alert icon={<WarningAmberIcon fontSize="small" />} severity="warning" sx={{ mb: 2 }}>
      {children}
    </Alert>
  );
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <List dense disablePadding>
      {items.map((item, i) => (
        <ListItem key={i} disableGutters alignItems="flex-start">
          <ListItemIcon sx={{ minWidth: 32, mt: 0.3 }}>
            <CheckCircleOutlineIcon fontSize="small" color="primary" />
          </ListItemIcon>
          <ListItemText primary={item} />
        </ListItem>
      ))}
    </List>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card sx={{ mb: 3 }} className="help-section">
      <CardContent>
        <Typography variant="h6" fontWeight={700} gutterBottom>
          {title}
        </Typography>
        {children}
      </CardContent>
    </Card>
  );
}

function TechAccordion({ title, defaultExpanded, children }: { title: string; defaultExpanded?: boolean; children: React.ReactNode }) {
  return (
    <Accordion defaultExpanded={defaultExpanded} className="guide-accordion" disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle1" fontWeight={700}>
          {title}
        </Typography>
      </AccordionSummary>
      <AccordionDetails>{children}</AccordionDetails>
    </Accordion>
  );
}

function GoTo({ label, route }: { label: string; route: string }) {
  const router = useRouter();
  return (
    <Button className="no-print" variant="outlined" endIcon={<ArrowForwardIcon />} onClick={() => router.push(route)} sx={{ mt: 1 }}>
      {label}
    </Button>
  );
}

// ---------- Tab content ----------

function OverviewTab() {
  return (
    <Box role="tabpanel" className="guide-tabpanel">
      <Section title="Mission">
        <Typography variant="body2" sx={{ mb: 2 }}>
          CCIP (Connectivity Coverage Intelligence Platform) bridges the gap between the official GSMA IR.21
          engineering declarations mobile network operators file with each other, and the commercial reach lists
          wholesale carriers publish claiming coverage of those same operators. The platform cross-references both
          sources per operator, per service, so business-development, carrier-relations, and roaming-engineering
          teams can see exactly where they agree — and, more importantly, exactly where they don&apos;t.
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Card variant="outlined" sx={{ height: "100%", borderColor: "primary.main" }}>
              <CardContent>
                <Chip label="Ground Truth" color="primary" size="small" sx={{ mb: 1 }} />
                <Typography variant="subtitle2" fontWeight={700}>
                  GSMA IR.21 Baseline
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Technical network declarations an MNO files with GSMA, specifying its own SCCP roaming signaling,
                  LTE/Diameter (DSX) edge agents, and GRX/IPX data-roaming routes — DPCs, authoritative DNS, inter-PMN
                  IP ranges, and operational contacts included.
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Card variant="outlined" sx={{ height: "100%", borderColor: "secondary.main" }}>
              <CardContent>
                <Chip label="Commercial Claim" color="secondary" size="small" sx={{ mb: 1 }} />
                <Typography variant="subtitle2" fontWeight={700}>
                  Carrier Reach Lists
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Coverage claims published by IPX carriers and aggregators — which operators, in which countries,
                  for which services (SCCP/DSX/IPX) they say they can reach, independent of what those operators
                  have actually declared to GSMA themselves.
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
        <Tip>
          <strong>Interconnect Parity Analysis</strong> is the platform&apos;s core output: automated detection of a
          carrier over-claiming (listed on Reach List, absent from IR.21), under-claiming (declared in IR.21, missing
          from the Reach List), or matching cleanly — giving carrier-relations teams concrete leverage in wholesale
          negotiations and routing audits instead of a manual cross-check across two spreadsheets.
        </Tip>
      </Section>
    </Box>
  );
}

const MNO_COLUMNS: [string, string][] = [
  ["1. Operator Name", "Pinned on desktop and mobile so it stays visible while scrolling the rest of the row."],
  ["2. Region", "4-region macro classification — Americas, MEA, Europe, APAC — plus a separate Non-Terrestrial bucket for aeronautical/maritime/satellite networks with no fixed country."],
  ["3. Country", "ISO 3166-1 alpha-3 code, as declared in the source IR.21/Reach List data."],
  ["4. SCCP Provider (IR.21)", "The operator's declared roaming-signaling carrier(s)."],
  ["5. DSX / LTE Provider (IR.21)", "The operator's declared LTE/Diameter edge-agent carrier(s)."],
  ["6. IPX Provider (IR.21)", "The operator's declared GRX/IPX data-roaming carrier(s)."],
  ["7. IR.21 PDF", "One-click link to the original GSMA document, when the paired PDF was uploaded alongside its XML."],
  ["8. TADIG", "The operator's primary GSMA network identifier."],
  ["9. Network Type", "Terrestrial vs. Non-Terrestrial (aeronautical/maritime)."],
  ["10. Last Effective Date", "The declared effective date of the most recent IR.21 ingested for this operator."],
  ["11. Status", "Operational status as declared."],
];

function OperatorSearchTab() {
  return (
    <Box role="tabpanel" className="guide-tabpanel">
      <Section title="Operator (MNO) Search — /search/mno">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The default landing point for reconciliation work: every operator CCIP knows about, one row each, laid
          out in a fixed 11-column reference layout.
        </Typography>
        <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, mb: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Column</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>What it shows</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {MNO_COLUMNS.map(([col, desc]) => (
                <TableRow key={col}>
                  <TableCell sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>{col}</TableCell>
                  <TableCell>{desc}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          Search &amp; filter controls
        </Typography>
        <Bullets
          items={[
            "Multi-parameter filtering by Operator Name, TADIG, Country, MCC, and MNC — press Enter in any field to search instantly, no separate click required.",
            "One-click Region toggle pills (All / Americas / MEA / Europe / APAC / Non-Terrestrial) filter the result set without touching the text fields.",
            "Database-backed autocomplete suggestions as you type the operator name.",
            "Search criteria and results are synchronized to the URL, so browser Back/Forward restores the exact search you had.",
            "CSV export of the current result set — includes a legal footnote noting the data is sourced from declared IR.21 & Reach List archives without operational warranty.",
          ]}
        />

        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          Multi-operator comparison
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Check 2 to 5 operators via the row checkboxes to open the Operator Comparison Matrix — a side-by-side
          breakdown of every wholesale carrier connected to any of them, split by IR.21 Declared vs. Reach List
          Claimed per service, with its own CSV export.
        </Typography>

        <GoTo label="Open Operator Search" route="/search/mno" />
      </Section>
    </Box>
  );
}

function OperatorDetailTab() {
  return (
    <Box role="tabpanel" className="guide-tabpanel">
      <Section title="Operator Detail — /search/mno/[id]">
        <TechAccordion title="Interconnect Comparison Grid" defaultExpanded>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The first thing on the page: a per-service (SCCP / DSX / IPX) breakdown comparing every provider the
            operator&apos;s IR.21 declares against every provider its Reach List entries claim.
          </Typography>
          <Grid container spacing={1.5} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={4}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Chip label="Matched" color="success" size="small" />
                <Typography variant="caption" color="text.secondary">
                  In IR.21 <em>and</em> on the Reach List
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Chip label="IR.21 Only" color="info" size="small" />
                <Typography variant="caption" color="text.secondary">
                  Declared, not commercially claimed
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Chip label="Reach List Only" color="warning" size="small" />
                <Typography variant="caption" color="text.secondary">
                  Claimed, not officially declared
                </Typography>
              </Box>
            </Grid>
          </Grid>
          <Typography variant="body2" color="text.secondary">
            <strong>Matched</strong> is the intersection of the IR.21-declared provider names and the Reach-List-
            claimed provider names for that service; the live discrepancy counter next to it is everything left over
            — IR.21-only plus Reach-List-only combined — so a glance at the header tells you how clean an
            operator&apos;s interconnect picture actually is before you open a single chip.
          </Typography>
        </TechAccordion>

        <TechAccordion title="Multi-TADIG resolution">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            A real-world operator occasionally holds more than one TADIG — a legacy code from before a merger, or a
            second license for a separate radio generation. A Reach List frequently only quotes one of them.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            An admin can link a known alternate TADIG to an existing operator (Admin → Operator record). Once
            linked, a Reach List row quoting that alternate code resolves to the same operator record instead of
            silently creating a duplicate — its Comparison Grid then shows the combined picture automatically.
          </Typography>
          <Warn>
            This linking is a deliberate admin decision, never automatic. Two operators sharing a similar name or
            operating in the same country are not necessarily the same legal entity — CCIP does not guess this
            relationship from text similarity alone, precisely to avoid attributing one operator&apos;s wholesale
            data to a completely different one.
          </Warn>
        </TechAccordion>

        <TechAccordion title="Technical network details">
          <Bullets
            items={[
              <>
                <strong>Roaming Signaling (SCCP)</strong> — primary and backup SCCP carriers, plus the operator&apos;s
                declared DPC point codes.
              </>,
              <>
                <strong>Data &amp; LTE Roaming (DSX / IPX)</strong> — LTE/Diameter edge-agent routing and GRX/IPX
                data-roaming carrier declarations.
              </>,
              "Authoritative and local DNS IP addresses, and declared inter-PMN IP subnet ranges.",
              "24×7 NOC and Roaming Coordinator contact details, where declared in the source IR.21.",
              'One-click "View Original IR.21 PDF" to inspect the official GSMA document in-browser, when one was uploaded alongside that operator\'s XML.',
            ]}
          />
        </TechAccordion>
      </Section>
    </Box>
  );
}

function ProviderSearchTab() {
  return (
    <Box role="tabpanel" className="guide-tabpanel">
      <Section title="Provider Search — /search/provider">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The canonical carrier master: raw declared strings from source documents are normalized and consolidated
          down to the platform&apos;s true wholesale provider list, so &quot;BICS&quot;, &quot;Belgacom&quot;, and
          &quot;Belgacom International Carrier Services&quot; all resolve to one row instead of three.
        </Typography>
        <Bullets
          items={[
            "Aggregated metrics per provider — total MNOs served, total countries covered, and a protocol breakdown (SCCP / DSX / IPX counts).",
            'Tri-view data mode toggle — "As per IR.21 Data" (declared footprint), "As per Reach List" (commercial claimed footprint), or "Both (Combined)" (union view).',
            "Select 2-5 providers via the row checkboxes to open the Provider Comparison Matrix, or select both the IR.21 and Reach List row of the same provider to jump straight to its own declared-vs-claimed breakdown.",
          ]}
        />

        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          Provider Detail — /search/provider/[id]
        </Typography>
        <Bullets
          items={[
            "A heading and badge make explicit which source you're looking at — GSMA IR.21 Declared, Reach List Claimed, or the consolidated IR.21 + Reach List view.",
            "A dedicated in-table search bar instantly filters the served-MNO list by operator name, country, or TADIG as you type.",
            "Clicking any MNO row deep-links straight into that operator's own Detail page.",
            "Dual top-and-bottom pagination — built for large footprints (one major IPX provider alone spans 300+ MNOs) — plus a per-row IR.21 PDF button.",
          ]}
        />

        <GoTo label="Open Provider Search" route="/search/provider" />
      </Section>
    </Box>
  );
}

function AdminTab() {
  const { user } = useAuth();
  const isRestricted = user?.role !== Role.ADMIN;

  return (
    <Box role="tabpanel" className="guide-tabpanel">
      <Section title="Data Ingestion &amp; Admin Engine — /admin/upload">
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
          {isRestricted && <Chip size="small" color="warning" label="ADMIN ONLY" />}
        </Box>

        <TechAccordion title="Bulk IR.21 ingestion" defaultExpanded>
          <Typography variant="body2" color="text.secondary">
            Native parser for GSMA IR.21 <code>.xml</code> files or a single <code>.zip</code> archive containing up
            to ~1,000 of them, with paired PDFs auto-matched to their XML by TADIG. An archive over 30MB is
            automatically split into several smaller uploads in your browser — each PDF stays grouped with its own
            XML across the split. An admin can opt into &quot;Replace Active Dataset&quot;, which purges every
            existing IR.21-sourced connectivity record before ingesting the new archive as the sole active baseline
            — appropriate for a full periodic rebaseline, since it is scoped to the entire IR.21 dataset, not one
            file.
          </Typography>
        </TechAccordion>

        <TechAccordion title="Dual-format Reach List ingestion">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            The upload automatically detects which of two accepted shapes a file is, from its header row alone — no
            manual pre-processing needed:
          </Typography>
          <Bullets
            items={[
              <><strong>Standard transposed format</strong> — five columns: Provider, Country, MNO, TADIG, Services.</>,
              <>
                <strong>Wide competitor matrix format</strong> — one row per MNO, one column per wholesale provider
                (e.g. A1, Syniverse, BICS, Comfone, Orange, Telefonica...). CCIP unpivots this in memory into the
                standard shape before ingesting.
              </>,
            ]}
          />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, mb: 1 }}>
            The matrix format carries no TADIG column of its own, so each row&apos;s operator is resolved against
            the platform&apos;s existing operator list by (Country, MNO) name — first an exact match after
            stripping legal-entity suffixes ("Ltd", "Limited", "S.A." ...), then a confident substring match for
            cases where the platform&apos;s own IR.21-derived name is shorter (e.g. "Movistar" vs. the matrix&apos;s
            "Movistar Argentina"). An operator that still can&apos;t be resolved this way is reported back — not
            guessed at — since the matrix has no TADIG to attach a new operator record to.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Wholesale provider abbreviations in matrix column headers (e.g. &quot;TATAComms&quot; → &quot;Tata
            Comm&quot;, &quot;TIS&quot; → &quot;Sparkle&quot;) resolve through the same canonical alias table as
            every other ingestion path, so a competitor-matrix upload and a standard-format upload of the same data
            land on identical provider records.
          </Typography>
        </TechAccordion>

        <TechAccordion title="Replace / purge safety">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Both upload types offer an opt-in replace checkbox, unchecked by default, each scoped to what it&apos;s
            actually safe to replace:
          </Typography>
          <Bullets
            items={[
              <><strong>IR.21 batch</strong> — &quot;Replace Active Dataset&quot; wipes every IR.21-sourced connectivity record platform-wide before ingesting, since a rebaseline archive is meant to represent the entire known operator universe.</>,
              <><strong>Reach List</strong> — &quot;Replace records from this file&quot; deletes only the records previously loaded from a file of that exact name before ingesting the new version, leaving Reach List data loaded from any other file untouched — a Reach List upload is usually one source&apos;s subset, not the whole picture, so a full-table purge would destroy unrelated providers&apos; data.</>,
            ]}
          />
          <Warn>Both replace actions are permanent and ask for confirmation before running. Neither can be undone.</Warn>
        </TechAccordion>

        <TechAccordion title="Unmapped provider management">
          <Typography variant="body2" color="text.secondary">
            Raw carrier-name strings encountered during ingestion that don&apos;t match any known provider are
            queued for an admin to resolve, rather than silently auto-created — visible under the{" "}
            <strong>Unmapped Variants Queue</strong>. <strong>Provider Overrides &amp; Normalization Audit</strong>{" "}
            lets an admin pin a specific provider to one MNO+service permanently (it survives future re-uploads),
            and audit every canonical provider&apos;s registered alias variants with live occurrence counts.
          </Typography>
        </TechAccordion>

        <GoTo label="Open Admin Menu" route="/admin" />
      </Section>
    </Box>
  );
}

const DISCLAIMER_CLAUSES = [
  "Nature of Data — CCIP is an analytical intelligence tool cross-referencing GSMA IR.21 declarations and reach lists.",
  'No Operational Warranty — all data is provided "as-is"; automated normalization does not guarantee real-time accuracy or completeness.',
  "Official Reference — the platform does not replace binding bilateral Roaming Agreements, GSMA IREG/TADIG test sheets, or live routing tables.",
  "Limitation of Liability — no liability for commercial, routing, or financial decisions made from platform data.",
  "Proprietary Notice — GSMA IR.21 documents and TADIG codes remain the property of their respective operators and the GSMA.",
];

function GovernanceTab() {
  return (
    <Box role="tabpanel" className="guide-tabpanel">
      <Section title="Platform Governance &amp; Technical Resilience">
        <TechAccordion title="Cloud Run warm-up" defaultExpanded>
          <Typography variant="body2" color="text.secondary">
            The backend runs on an auto-scaling Cloud Run instance that can go idle and take a few seconds to wake
            on the very first request after inactivity. A dedicated refresh icon — in the header, and again on the
            Operator Search page — pings the API ahead of time so your first real search doesn&apos;t eat that
            cold-start delay.
          </Typography>
        </TechAccordion>

        <TechAccordion title="Session stability">
          <Typography variant="body2" color="text.secondary">
            Sessions use a sliding JWT: your sign-in token is valid for 24 hours and silently re-issued roughly
            every 30 minutes while a tab stays open, so an active work session doesn&apos;t get interrupted by
            expiry. A 401 response from any API call (an expired or invalidated token) clears the stored session and
            returns you to the sign-in page automatically.
          </Typography>
        </TechAccordion>

        <TechAccordion title="Legal &amp; liability disclaimer">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Every page carries a footer link — &quot;View Disclaimer &amp; Terms&quot; — to the platform&apos;s full
            data-provenance and liability terms:
          </Typography>
          <Bullets items={DISCLAIMER_CLAUSES} />
        </TechAccordion>
      </Section>
    </Box>
  );
}

// ---------- Page ----------

const TABS = [
  { label: "Overview & Mission", icon: <DashboardIcon fontSize="small" />, Panel: OverviewTab },
  { label: "Operator Search", icon: <CellTowerIcon fontSize="small" />, Panel: OperatorSearchTab },
  { label: "Operator Detail", icon: <CellTowerIcon fontSize="small" />, Panel: OperatorDetailTab },
  { label: "Provider Search", icon: <BusinessIcon fontSize="small" />, Panel: ProviderSearchTab },
  { label: "Admin & Ingestion", icon: <UploadFileIcon fontSize="small" />, Panel: AdminTab },
  { label: "Governance", icon: <ShieldOutlinedIcon fontSize="small" />, Panel: GovernanceTab },
];

export default function HelpPage() {
  const [today] = React.useState(() => new Date().toLocaleDateString());
  const [tab, setTab] = React.useState(0);

  return (
    <RequireAuth>
      <AppShell>
        {/* Print-only styling: this page doubles as the source for "Download
           Platform Guide (PDF)" via the browser's native print-to-PDF —
           real, selectable text and clean automatic pagination beat a
           rasterized screenshot for a text-heavy reference document, at
           zero added bundle weight. Tab panels stay mounted (React
           `hidden`, not conditional rendering) specifically so print CSS
           can force every panel visible at once — otherwise only the
           currently-selected tab would ever make it into the PDF. */}
        <style>{`
          @media print {
            .MuiDrawer-root, .MuiAppBar-root, .no-print { display: none !important; }
            main { padding: 0 !important; }
            .help-section, .guide-accordion { break-inside: avoid; page-break-inside: avoid; box-shadow: none !important; border: 1px solid #ccc; }
            .guide-tabpanel[hidden] { display: block !important; }
            .guide-tabpanel { margin-bottom: 24px; border-top: 2px solid #999; padding-top: 12px; }
            .guide-accordion .MuiCollapse-root { height: auto !important; visibility: visible !important; }
            .guide-accordion .MuiAccordionDetails-root { display: block !important; }
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
          <Button className="no-print" variant="contained" startIcon={<PictureAsPdfIcon />} onClick={() => window.print()}>
            Download Platform Guide (PDF)
          </Button>
        </Box>

        <Divider sx={{ mb: 2 }} className="no-print" />

        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          className="no-print"
          sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
        >
          {TABS.map((t, i) => (
            <Tab key={t.label} label={t.label} icon={t.icon} iconPosition="start" sx={{ minHeight: 48 }} value={i} />
          ))}
        </Tabs>

        {TABS.map((t, i) => (
          <Box key={t.label} hidden={tab !== i} className="guide-tabpanel">
            <Typography variant="overline" color="text.secondary" className="print-only-heading" sx={{ display: "none", "@media print": { display: "block" } }}>
              {t.label}
            </Typography>
            <t.Panel />
          </Box>
        ))}

        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 3, mb: 1 }}>
          Notice: Exported from CCIP for intelligence analysis. Sourced from declared IR.21 &amp; Reach List
          archives without operational warranty.
        </Typography>

        <Alert severity="info" className="no-print" sx={{ mt: 2 }}>
          Clicking &quot;Download Platform Guide (PDF)&quot; opens your browser&apos;s print dialog — choose &quot;Save
          as PDF&quot; as the destination for a clean, text-searchable copy of this guide, covering every tab above.
        </Alert>
      </AppShell>
    </RequireAuth>
  );
}
