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
import TimelineIcon from "@mui/icons-material/Timeline";
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

        <Typography variant="subtitle2" fontWeight={700} gutterBottom sx={{ mt: 1 }}>
          Interconnect Parity Logic
        </Typography>
        <Grid container spacing={1.5}>
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
      </Section>

      <Section title="Main Dashboard Metrics — /dashboard">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          The landing page's stat tiles are all scoped strictly to the active GSMA IR.21 baseline — none of them mix
          in unverified commercial Reach List rows, even where a related figure elsewhere in the platform does.
        </Typography>
        <Bullets
          items={[
            <>
              <strong>Total MNOs</strong> — operators with a full, authoritative GSMA IR.21 declaration on file.
              Legacy Reach-List-only TADIGs and rows still pending admin review are tracked separately (see the
              banner directly above the tiles) and excluded from this count.
            </>,
            <>
              <strong>Total Providers</strong> — wholesale/IPX providers that actually back at least one live SCCP,
              DSX, or IPX relationship, not a raw database row count.
            </>,
            <>
              <strong>Total Connections</strong> — always exactly SCCP + DSX + IPX Relationships (the three tiles
              below it added together). If this number and that sum ever disagree, something upstream is double
              counting or leaking Reach List data in — treat it as a data-integrity signal worth reporting.
            </>,
            <>
              <strong>SCCP / DSX / IPX Relationships</strong> — every distinct (MNO/Cust, Provider) pair declared
              for that service in IR.21, counting <em>both</em> the primary carrier and any secondary/backup
              carrier an operator declares (e.g. a primary + backup SCCP gateway, or a multi-entry GRX/IPX list) —
              the same full picture the MNO Detail page&apos;s Comparison Grid shows, not just the single canonical
              provider CCIP stores per (MNO, service) for routing purposes. An MNO that multi-homes a service
              contributes one relationship per distinct provider it declares there, not just one.
            </>,
            <>
              <strong>Unresolved Reach List Aliases</strong> — Reach List rows still waiting on admin review; see{" "}
              the Admin tab below.
            </>,
          ]}
        />
        <GoTo label="Open Dashboard" route="/dashboard" />
      </Section>
    </Box>
  );
}

function MarketIntelligenceTab() {
  return (
    <Box role="tabpanel" className="guide-tabpanel">
      <Section title="Market Intelligence &amp; Routing Changes Tracker — /analytics/ir21-changes">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Tracks every provider addition, removal, and direct replacement declared across successive IR.21
          re-uploads, per operator and per service (SCCP / DSX / IPX) — built for commercial and carrier-relations
          review of who is winning and losing wholesale accounts over time.
        </Typography>

        <TechAccordion title="Delta Detection Engine" defaultExpanded>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Two complementary mechanisms feed the change log, because they can see different things:
          </Typography>
          <Bullets
            items={[
              <>
                <strong>Live snapshot diffing</strong> — every re-upload resolves each operator&apos;s declared
                provider per service and compares it against whatever the platform already had on file
                immediately beforehand. A change is recorded only when the resolved provider actually differs —
                classified as <strong>ADDED</strong> (nothing on file before), <strong>REMOVED</strong> (this
                upload dropped the service entirely), or <strong>REPLACED</strong> (a different provider now).
                A &quot;Replace Active Dataset&quot; upload snapshots the prior state before wiping the table it
                is about to rebuild, specifically so this comparison still works correctly on a full rebaseline —
                without that snapshot, every operator would look like a brand-new addition on every rebaseline,
                even one where nothing actually changed.
              </>,
              <>
                <strong>Native GSMA <code>&lt;ChangeHistory&gt;</code> extraction</strong> — every IR.21 XML
                carries its own historical change log per section, documenting provider switches that happened
                years before this platform ever tracked anything (live diffing can only ever see a transition
                between two uploads it was present for). A conservative parser interprets each log entry&apos;s
                free text, resolves the named carrier through the same alias table every other ingestion path
                uses, and backfills it — skipping any addition already captured by live diffing, so the same
                real-world event is never counted twice.
              </>,
            ]}
          />
        </TechAccordion>

        <TechAccordion title="Account &amp; Route Metrics">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            A single operator can change providers on more than one service in the same period — three separate
            route events, but one operator account won or lost. Every count on this page distinguishes the two:
          </Typography>
          <Bullets
            items={[
              <>
                <strong>MNOs / Custs (primary)</strong> — the distinct MNO/TADIG count behind a figure, e.g.{" "}
                <code>82 MNO/Custs (+178 Service Gain)</code> means 178 individual route changes landed across
                82 different MNO / Customer accounts.
              </>,
              <>
                <strong>Service Gain / Service Loss (secondary)</strong> — the raw route-event count itself,
                shown alongside the MNO / Customer count rather than instead of it.
              </>,
              <>
                <strong>Net</strong> — gross gains minus gross losses for that provider across the selected
                period; a provider can be net-positive overall while still genuinely losing real accounts, so
                Top Provider Loser ranks by gross losses, not net position.
              </>,
            ]}
          />
        </TechAccordion>

        <TechAccordion title="Interactive KPI Autocompletes">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            The Top Provider Gainer, Top Provider Loser, and Active Switching MNOs / Custs cards each embed a
            searchable, ranked dropdown — type a carrier or MNO / Customer name (or a rank number) to jump straight
            to it, not just the single top-ranked entry the card headlines.
          </Typography>
          <Bullets
            items={[
              "Selecting a provider from the Gainer or Loser dropdown updates that card's own headline, fills the Wholesale Provider filter below, and re-scopes the table to specifically that provider's gain or loss events.",
              "Selecting an MNO / Customer from the Active Switching MNOs / Custs dropdown fills the Search MNO / Cust / TADIG box and scopes the table to that MNO / Customer's full change history.",
              "The four KPI cards always reflect the overall Timeframe/Region/Service scope — clicking or searching within one card narrows the table below without collapsing the other cards' own numbers.",
            ]}
          />
        </TechAccordion>

        <GoTo label="Open Market Intelligence" route="/analytics/ir21-changes" />
      </Section>
    </Box>
  );
}

const MNO_COLUMNS: [string, string][] = [
  ["1. MNO / Cust Name", "Pinned on desktop and mobile so it stays visible while scrolling the rest of the row."],
  ["2. Region", "4-region macro classification — Americas, MEA, Europe, APAC — plus a separate Non-Terrestrial bucket for aeronautical/maritime/satellite networks with no fixed country."],
  ["3. Country", "Full country name (searchable by name or ISO 3166-1 alpha-3 code), mapped from the ISO-3 code declared in the source IR.21/Reach List data."],
  ["4. SCCP Provider (IR.21)", "The MNO / Customer's declared roaming-signaling carrier(s)."],
  ["5. DSX / LTE Provider (IR.21)", "The MNO / Customer's declared LTE/Diameter edge-agent carrier(s)."],
  ["6. IPX Provider (IR.21)", "The MNO / Customer's declared GRX/IPX data-roaming carrier(s)."],
  ["7. IR.21 PDF", "One-click link to the original GSMA document, when the paired PDF was uploaded alongside its XML."],
  ["8. TADIG", "The MNO / Customer's primary GSMA network identifier."],
  ["9. Network Type", "Terrestrial vs. Non-Terrestrial (aeronautical/maritime)."],
  ["10. Last Effective Date", "The declared effective date of the most recent IR.21 ingested for this MNO / Customer."],
  ["11. Status", "Operational status as declared."],
];

function OperatorTab() {
  return (
    <Box role="tabpanel" className="guide-tabpanel">
      <Section title="MNO / Cust Search &amp; Detail Deep-Dive — /search/mno">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The default landing point for reconciliation work: every operator CCIP knows about, one row each, laid
          out in a fixed 11-column reference layout.
        </Typography>

        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          Dataset scope filtering
        </Typography>
        <Bullets
          items={[
            <>
              <strong>IR.21 Verified</strong> — only operators with a parsed IR.21 XML declaration on file
              (default). This is the platform&apos;s ground-truth baseline.
            </>,
            <>
              <strong>Reach List Only</strong> — operators known solely from a legacy Reach List upload, from
              before MNO normalization was enforced. A newer unresolved Reach List row no longer creates one of
              these at all — see the Unresolved Reach List Aliases queue in Admin instead.
            </>,
            <>
              <strong>All MNOs</strong> — the unified view across both. A companion &quot;Only with listed
              providers&quot; toggle hides any operator with nothing to show in the SCCP/DSX/IPX columns, on by
              default.
            </>,
          ]}
        />

        <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, mb: 2, mt: 2 }}>
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
            "Multi-parameter filtering by MNO / Cust Name, TADIG, Country, MCC, and MNC — press Enter in any field to search instantly, no separate click required.",
            "Country accepts either a full country name or its ISO-3 code, with a searchable autocomplete dropdown of matching countries as you type.",
            "One-click Region toggle pills (All / Americas / MEA / Europe / APAC / Non-Terrestrial) filter the result set without touching the text fields.",
            "Database-backed autocomplete suggestions as you type the MNO / Customer name.",
            "Search criteria and results are synchronized to the URL, so browser Back/Forward restores the exact search you had.",
            "CSV export of the current result set — includes a legal footnote noting the data is sourced from declared IR.21 & Reach List archives without operational warranty.",
          ]}
        />

        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          Multi-MNO / Cust comparison
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Check 2 to 5 MNOs / Custs via the row checkboxes to open the MNO / Cust Comparison Matrix — a side-by-side
          breakdown of every wholesale carrier connected to any of them, split by IR.21 Declared vs. Reach List
          Claimed per service, with its own CSV export.
        </Typography>

        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          MNO / Cust Detail — /search/mno/[id]
        </Typography>

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
            A real-world MNO / Customer occasionally holds more than one TADIG — a legacy code from before a
            merger, or a second license for a separate radio generation. A Reach List frequently only quotes one
            of them.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            An admin can link a known alternate TADIG to an existing MNO / Customer (Admin → MNO / Cust record).
            Once linked, a Reach List row quoting that alternate code resolves to the same MNO / Cust record
            instead of silently creating a duplicate — its Comparison Grid then shows the combined picture
            automatically.
          </Typography>
          <Warn>
            This linking is a deliberate admin decision, never automatic. Two MNOs / Customers sharing a similar
            name or operating in the same country are not necessarily the same legal entity — CCIP does not guess
            this relationship from text similarity alone, precisely to avoid attributing one MNO / Customer&apos;s
            wholesale data to a completely different one.
          </Warn>
        </TechAccordion>

        <TechAccordion title="Technical network details">
          <Bullets
            items={[
              <>
                <strong>Roaming Signaling (SCCP)</strong> — primary and backup SCCP carriers, plus the MNO /
                Customer&apos;s declared DPC point codes.
              </>,
              <>
                <strong>Data &amp; LTE Roaming (DSX / IPX)</strong> — LTE/Diameter edge-agent routing and GRX/IPX
                data-roaming carrier declarations.
              </>,
              "Authoritative and local DNS IP addresses, and declared inter-PMN IP subnet ranges.",
              "24×7 NOC and Roaming Coordinator contact details, where declared in the source IR.21.",
              'One-click "View Original IR.21 PDF" to inspect the official GSMA document in-browser, when one was uploaded alongside that MNO / Customer\'s XML.',
            ]}
          />
        </TechAccordion>

        <GoTo label="Open MNO / Cust Search" route="/search/mno" />
      </Section>
    </Box>
  );
}

function ProviderSearchTab() {
  return (
    <Box role="tabpanel" className="guide-tabpanel">
      <Section title="Wholesale Provider Search &amp; Benchmarking — /search/provider">
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
      <Section title="Advanced Data Ingestion &amp; Normalization — /admin/upload">
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

        <TechAccordion title="Multi-Carrier Reach List ZIP Upload (Batch Ingestion)">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            A separate path from the single-file Reach List Upload above, built for the shape carriers actually
            send: one <code>.zip</code> archive containing several carriers&apos; own exports at once, each
            identified by its own filename (e.g. &quot;BICS External LTE...xlsx&quot;, &quot;Comfone Customer
            List.pdf&quot;) rather than a shared Provider column. Every file, whatever its format, is converted to
            the same row shape the single-file path understands and passed through the identical provider-alias
            resolution, country normalization, and secondaryTadigs-aware MNO lookup — a ZIP-batch upload and a
            standard-format upload of the same data land on identical records.
          </Typography>
          <Bullets
            items={[
              <><strong>.xlsx / .xls</strong> — flexible header detection scans up to 40 rows to find the real header row (country, operator, TADIG, MCC-MNC, and service columns), so files don&apos;t need to match a fixed template. Numbered &quot;TADIG 1&quot;..&quot;TADIG N&quot; columns are all captured as secondary TADIGs for the same operator.</>,
              <><strong>.pdf</strong> — Comfone-style customer-list exports, parsed from the tab-delimited text stream directly (these files carry no ruled table borders for automatic table detection to find).</>,
              <><strong>.msg</strong> — an Outlook email with a pasted partner table or plain name list, parsed either by TADIG anchor (tracking the last-seen country and service heading while scanning) or by free-text operator name.</>,
            ]}
          />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            The carrier for each file is inferred automatically — first from the filename (leading tokens, e.g.
            &quot;BICS...&quot;, then trailing tokens for a forwarded-email subject that names the carrier last,
            e.g. &quot;...Routing Audit. Telstra 2026.msg&quot;), then from the .msg sender name or email domain. A
            file whose provider or table structure can&apos;t be confidently recognized is skipped and reported —
            not guessed at — in a per-file breakdown table after upload, alongside a downloadable CSV of any MNOs
            that couldn&apos;t be resolved.
          </Typography>
        </TechAccordion>

        <TechAccordion title="Carrier-specific connection filtering">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Some carriers&apos; own exports list every route they know about, including indirect/hub/transit paths
            CCIP shouldn&apos;t record as direct connectivity. For three carriers, rows are filtered against the
            file&apos;s own Connection Type / Route Type column before ingestion — applied uniformly across every
            format above (.xlsx, .xls, .pdf, .msg), not just Excel:
          </Typography>
          <Bullets
            items={[
              <><strong>Deutsche Telekom &amp; China Mobile</strong> — only rows whose connection type contains &quot;direct&quot; and does not contain &quot;indirect&quot;, &quot;hub&quot;, or &quot;transit&quot; are kept.</>,
              <><strong>iBasis</strong> — only rows whose connection type matches &quot;direct&quot; or &quot;on-net&quot; are kept (iBasis&apos;s real Route Type values are &quot;Direct&quot;, &quot;On-Net&quot;, &quot;On-Net Planned&quot;, &quot;On-Net Backup&quot;, etc. — not the literal word &quot;iBasis&quot;).</>,
              <><strong>Every other carrier</strong> — passes through unfiltered, using the standard extraction rules above.</>,
            ]}
          />
          <Tip>A row with a blank or unrecognized connection type is excluded, not assumed direct — the same &quot;no confirmation, no inclusion&quot; standard for all three carriers.</Tip>
        </TechAccordion>

        <TechAccordion title="Replace / purge safety">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Upload paths offer an opt-in replace checkbox, unchecked by default, each scoped to what it&apos;s
            actually safe to replace — plus one fully unscoped purge for a genuine full reset:
          </Typography>
          <Bullets
            items={[
              <><strong>IR.21 batch</strong> — &quot;Replace Active Dataset&quot; wipes every IR.21-sourced connectivity record platform-wide before ingesting, since a rebaseline archive is meant to represent the entire known operator universe.</>,
              <><strong>Reach List (single file)</strong> — &quot;Replace records from this file&quot; deletes only the records previously loaded from a file of that exact name before ingesting the new version, leaving Reach List data loaded from any other file untouched.</>,
              <><strong>Reach List ZIP batch</strong> — &quot;Replace records from these files&quot; applies that same per-filename scoping independently to every file inside the archive; Reach List data loaded from a file not in this archive is never touched.</>,
              <><strong>Delete All Reach List Data</strong> — a fully unscoped purge of every Reach List record platform-wide (IR.21-sourced connectivity data is not affected), for a genuine full reset rather than a per-source replace. Danger-styled, gated behind a confirmation dialog, and logged to Upload History.</>,
            ]}
          />
          <Warn>All replace and purge actions are permanent and ask for confirmation before running. None can be undone.</Warn>
        </TechAccordion>

        <TechAccordion title="Format guide &amp; sample templates">
          <Typography variant="body2" color="text.secondary">
            The Reach List Upload card documents both accepted single-file shapes (standard transposed and wide
            competitor matrix — see &quot;Dual-format Reach List ingestion&quot; above) inline, each with a
            downloadable sample <code>.xlsx</code> template pre-filled with the expected columns, so a new upload
            can be built by editing a known-good file rather than guessing at the format from prose alone.
          </Typography>
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
      <Section title="Governance, Security &amp; Liability Terms">
        <TechAccordion title="Cloud Run warm-up" defaultExpanded>
          <Typography variant="body2" color="text.secondary">
            The backend runs on an auto-scaling Cloud Run instance that can go idle and take a few seconds to wake
            on the very first request after inactivity. A dedicated refresh icon — in the header, and again on the
            MNO / Cust Search page — pings the API ahead of time so your first real search doesn&apos;t eat that
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
  { label: "Overview & Architecture", icon: <DashboardIcon fontSize="small" />, Panel: OverviewTab },
  { label: "Market Intelligence", icon: <TimelineIcon fontSize="small" />, Panel: MarketIntelligenceTab },
  { label: "MNO / Cust Search & Detail", icon: <CellTowerIcon fontSize="small" />, Panel: OperatorTab },
  { label: "Provider Search", icon: <BusinessIcon fontSize="small" />, Panel: ProviderSearchTab },
  { label: "Data Ingestion", icon: <UploadFileIcon fontSize="small" />, Panel: AdminTab },
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
