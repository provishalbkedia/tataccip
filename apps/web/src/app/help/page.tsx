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
  CardActionArea,
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
import PlayCircleFilledIcon from "@mui/icons-material/PlayCircleFilled";
import WavingHandIcon from "@mui/icons-material/WavingHand";
import Looks1Icon from "@mui/icons-material/LooksOne";
import Looks2Icon from "@mui/icons-material/LooksTwo";
import Looks3Icon from "@mui/icons-material/Looks3";
import Looks4Icon from "@mui/icons-material/Looks4";
import Looks5Icon from "@mui/icons-material/Looks5";
import VisibilityIcon from "@mui/icons-material/Visibility";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import VideoModal from "@/components/VideoModal";
import { useAuth } from "@/lib/auth-context";
import { BRIEF_VIDEO, MASTERCLASS_VIDEO, type VideoAsset } from "@/lib/videos";
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

// A third callout tier alongside Tip (ℹ Note) and Warn (⚠ Key Distinction) --
// for a genuinely time-saving shortcut rather than a caveat or a warning,
// styled in the platform's own teal accent so it reads as "worth trying",
// not "be careful".
function ProTip({ children }: { children: React.ReactNode }) {
  return (
    <Alert
      icon={<span style={{ fontSize: 16 }}>⚡</span>}
      severity="success"
      sx={{ mb: 2, bgcolor: "rgba(0,212,178,0.1)", color: "#0A2540", "& .MuiAlert-icon": { color: "#00A98A" } }}
    >
      <strong>Pro-Tip:</strong> {children}
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

// ---------- Video Walkthroughs & Training ----------

function VideoShowcaseCard({
  video,
  chipLabel,
  chipColor,
  cardTitle,
  description,
  actionLabel,
  onPlay,
}: {
  video: VideoAsset;
  chipLabel: string;
  chipColor: string;
  cardTitle: string;
  description: string;
  actionLabel: string;
  onPlay: () => void;
}) {
  const isVertical = video.orientation === "vertical";
  return (
    <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <CardActionArea
        onClick={onPlay}
        className="video-showcase-action"
        sx={{ display: "flex", flexDirection: "column", alignItems: "stretch", height: "100%" }}
      >
        <Box
          sx={{
            position: "relative",
            width: "100%",
            aspectRatio: isVertical ? "9 / 16" : "16 / 9",
            maxHeight: isVertical ? 320 : "none",
            bgcolor: "#0A2540",
            backgroundImage: `url(https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg)`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Box
            sx={{
              width: 60,
              height: 60,
              borderRadius: "50%",
              bgcolor: "rgba(255,255,255,0.94)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 14px rgba(0,0,0,0.4)",
              transition: "transform 150ms ease",
              ".video-showcase-action:hover &": { transform: "scale(1.1)" },
            }}
          >
            <PlayCircleFilledIcon sx={{ fontSize: 42, color: "#0A2540" }} />
          </Box>
        </Box>
        <CardContent sx={{ flexGrow: 1, width: "100%" }}>
          <Chip label={chipLabel} size="small" sx={{ bgcolor: chipColor, color: "#fff", fontWeight: 700, mb: 1.5 }} />
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            {cardTitle}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {description}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<PlayCircleFilledIcon />}
            sx={{ pointerEvents: "none" }}
            tabIndex={-1}
          >
            {actionLabel}
          </Button>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

function VideoWalkthroughsSection() {
  const [activeVideo, setActiveVideo] = React.useState<VideoAsset | null>(null);

  return (
    <Box className="no-print" sx={{ mb: 4 }}>
      <Typography variant="h6" fontWeight={700} gutterBottom>
        Video Walkthroughs &amp; Training
      </Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <VideoShowcaseCard
            video={BRIEF_VIDEO}
            chipLabel="⚡ 80-Sec Quick Overview"
            chipColor="#0B6FBF"
            cardTitle="Platform Highlights & Mission"
            description="How CCIP bridges the gap between commercial claims and GSMA IR.21 engineering data."
            actionLabel="Watch Overview"
            onPlay={() => setActiveVideo(BRIEF_VIDEO)}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <VideoShowcaseCard
            video={MASTERCLASS_VIDEO}
            chipLabel="🎓 7-Min Masterclass"
            chipColor="#00D4B2"
            cardTitle="Complete Architecture & Features"
            description="Full walkthrough of all modules: MNO search, provider footprints, churn tracking, and parser rules."
            actionLabel="Watch Masterclass"
            onPlay={() => setActiveVideo(MASTERCLASS_VIDEO)}
          />
        </Grid>
      </Grid>
      <VideoModal video={activeVideo} onClose={() => setActiveVideo(null)} />
    </Box>
  );
}

// ---------- Getting Started (new-user welcome) ----------

const GETTING_STARTED_STEPS: { icon: React.ReactNode; title: string; body: string; route: string }[] = [
  {
    icon: <Looks1Icon color="primary" />,
    title: "Start at the Dashboard",
    body: "A quick, at-a-glance snapshot of the whole platform — how many operators, providers, and live SCCP/DSX/IPX connections CCIP currently tracks.",
    route: "/dashboard",
  },
  {
    icon: <Looks2Icon color="primary" />,
    title: "Look up an operator",
    body: "Head to MNO / Cust Search and type any operator name, TADIG code, or country. Open one to see exactly which wholesale carriers it has officially declared versus what carriers commercially claim to serve it.",
    route: "/search/mno",
  },
  {
    icon: <Looks3Icon color="primary" />,
    title: "See who's winning and losing carriers",
    body: "Market Intelligence & Routing Changes tracks every provider a carrier gained, lost, or swapped over time — filter by carrier, region, or timeframe to find the story you're after.",
    route: "/analytics/ir21-changes",
  },
  {
    icon: <Looks4Icon color="primary" />,
    title: "Browse a wholesale carrier's footprint",
    body: "Provider Search flips the view around — pick a carrier (e.g. BICS, Tata Comm, Syniverse) to see every operator it serves, worldwide.",
    route: "/search/provider",
  },
  {
    icon: <Looks5Icon color="primary" />,
    title: "Bring in new data (Admins only)",
    body: "The Admin Menu is where a fresh GSMA IR.21 batch or a carrier's Reach List file gets uploaded, and where any name the parser couldn't automatically match gets resolved.",
    route: "/admin",
  },
];

const ROLE_INFO: Record<string, { label: string; color: "default" | "info" | "warning"; icon: React.ReactNode; description: string }> = {
  VIEWER: {
    label: "Viewer",
    color: "default",
    icon: <VisibilityIcon fontSize="small" />,
    description:
      "Full read access: search and browse every screen, open operator and provider detail pages, filter Market Intelligence, and export CSVs. Upload, override, and account-management buttons are hidden or disabled for this role.",
  },
  ANALYST: {
    label: "Analyst",
    color: "info",
    icon: <VisibilityIcon fontSize="small" />,
    description:
      "The same full read access as Viewer — search, browse, filter, and export everything. In this platform today, Analyst and Viewer see identical capability; only Admin can change data.",
  },
  ADMIN: {
    label: "Admin",
    color: "warning",
    icon: <AdminPanelSettingsIcon fontSize="small" />,
    description:
      "Everything Viewer/Analyst can do, plus every action that changes data: uploading IR.21/Reach List files, resolving unmapped providers and operators, editing provider overrides, reclassifying routing-change events, and managing user roles.",
  },
};

function GettingStartedSection() {
  const { user } = useAuth();
  const roleInfo = user ? ROLE_INFO[user.role] : undefined;

  return (
    <Box sx={{ mb: 4 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
        <WavingHandIcon sx={{ fontSize: 32, color: "#EF6C00" }} />
        <Typography variant="h5" fontWeight={700}>
          Welcome to CCIP!
        </Typography>
      </Box>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2.5, maxWidth: 760 }}>
        New here? This page is your map to everything the platform can do. If you only read one thing today, read
        the five steps below — they&apos;ll have you finding real answers within a couple of minutes. Everything
        else on this page is here for whenever you want to go deeper on a specific feature.
      </Typography>

      {roleInfo && (
        <Alert
          icon={roleInfo.icon}
          severity={roleInfo.color === "warning" ? "warning" : "info"}
          sx={{ mb: 2.5, maxWidth: 760 }}
        >
          You&apos;re signed in as <strong>{roleInfo.label}</strong>. {roleInfo.description}
        </Alert>
      )}

      <Grid container spacing={2}>
        {GETTING_STARTED_STEPS.map((step) => (
          <Grid item xs={12} sm={6} md={4} key={step.title}>
            <Card variant="outlined" sx={{ height: "100%" }}>
              <CardContent>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                  {step.icon}
                  <Typography variant="subtitle1" fontWeight={700}>
                    {step.title}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  {step.body}
                </Typography>
                <GoTo label="Go there now" route={step.route} />
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

// ---------- Tab content ----------

function OverviewTab() {
  return (
    <Box role="tabpanel" className="guide-tabpanel">
      <GettingStartedSection />

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

      <Section title="Navigation, Filters &amp; Escape Hatches">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          A few conventions repeat across every search and analytics screen — once you recognize them on one
          page, every other page behaves the same way.
        </Typography>
        <Bullets
          items={[
            "The active section in the left sidebar is always high-contrast: solid navy fill, white bold text, a teal left accent bar, and a teal icon — never guess which page you're on.",
            <>
              Wherever a filter can narrow a table (MNO / Cust Search, Provider Search, Market Intelligence), an
              <strong> active filter ribbon</strong> appears directly above it once anything is applied — one
              removable <code>(✕)</code> chip per dimension, plus a single &quot;Reset All Filters&quot; /
              &quot;Reset to Default View&quot; action for everything at once.
            </>,
            "Dismissing one chip removes only that constraint; the rest of your filters stay exactly as they were.",
            "A contextual banner directly above each results table names the table's exact scope in plain language (e.g. \"Showing 1 of 8 providers matching 'Tata Comm'\") — with a quick link back to the unfiltered baseline once a search has narrowed things down.",
          ]}
        />
        <Typography variant="subtitle2" fontWeight={700} gutterBottom sx={{ mt: 2 }}>
          Mobile &amp; tablet
        </Typography>
        <Bullets
          items={[
            "The sidebar collapses behind a hamburger menu; filter pill bars wrap and remain fully tappable rather than truncating.",
            "Wide tables (comparison matrices, the Market Intelligence feed) scroll horizontally inside their own container — the page itself never scrolls sideways.",
            "Floating action docks (the multi-provider compare bar, selection summaries) stack their buttons vertically on narrow screens and reserve enough bottom padding to never cover a table's own pagination controls.",
          ]}
        />
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

        <TechAccordion title="Filtering the feed — the &quot;Change:&quot; pill bar">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Below Timeframe / Region / Service sits a two-segment row of pills, each carrying a live count badge for
            however the rest of your filters are currently set:
          </Typography>
          <Bullets
            items={[
              <>
                <strong>Commercial churn segment</strong> — Commercial Churn (Default), + ADDED, ⇄ REPLACED, and −
                REMOVED. This is genuine wholesale carrier activity: a provider was actually won, lost, or swapped.
                Hover any pill for a plain-language explanation — REMOVED means a provider was dropped with no
                replacement identified anywhere in the operator&apos;s filings, while REPLACED means a specific
                competitor is on record as having won it; the same distinction is explained again on every row&apos;s
                Change Action badge in the table.
              </>,
              <>
                <strong>Technical &amp; admin segment</strong> — 🌐 IP &amp; Subnets, 🔄 Diameter &amp; SS7 Config,
                ℹ Admin &amp; Entity Updates, and Show Everything. These are real declarations too (network
                config, signaling-plane config, administrative metadata), but never a carrier switch — hidden from
                the default view for exactly that reason, one click away when you need them.
              </>,
              "A pill showing (0) for the current scope is dimmed and unclickable, so you never waste a click opening an empty category.",
              "On a phone or tablet, the whole filter section collapses behind a single \"Filter & Refine\" button with a badge showing how many filters are active — tap it to open every control in a bottom sheet, with its own Clear All / Show Results buttons.",
            ]}
          />
        </TechAccordion>

        <TechAccordion title="Always knowing what's filtering the view">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Clicking a KPI card, picking a provider, or selecting a Change pill narrows the table — and a
            &quot;Filtered by:&quot; strip appears directly above it naming every dimension currently in effect
            (Timeframe, Region, Service, Change, Provider, Search, or which KPI card drove the view), each with its
            own × to clear just that one thing, plus a single &quot;Reset to Default View&quot; button for
            everything at once. If a filter combination matches nothing, the table is replaced with a plain
            explanation and a one-click way to clear the filters, rather than a bare empty grid.
          </Typography>
        </TechAccordion>

        <TechAccordion title="IR.21 Change Log & Normalization Review (Admin/Analyst audit screen)">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            &quot;View Full Normalization Audit&quot;, next to the pill bar, opens the full unrestricted history
            behind every classification decision — every ADDED/REMOVED/REPLACED event and every technical/admin
            update, together with the raw GSMA IR.21 <code>&lt;ChangeHistory&gt;</code> text that produced it, which
            named regex rule matched, and whether it counts as commercial churn.
          </Typography>
          <Bullets
            items={[
              '"Needs Review" pre-filters to exactly the rows worth a second look — an automatic technical/admin classification, or an onboarding-flagged addition — versus "All Events" for the complete unfiltered log.',
              'Clicking "Review" on any row opens a dialog showing the raw declaration text and lets an admin correct the automatic classification by hand, stamping it "Reviewed" in the audit trail.',
            ]}
          />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1, mt: 1.5 }}>
            Two admin-only buttons re-run the platform&apos;s classification logic retroactively across the entire
            existing baseline, for whenever the underlying rules improve:
          </Typography>
          <Bullets
            items={[
              <>
                <strong>Reclassify Taxonomy</strong> — re-runs every historical entry&apos;s raw description through
                the current classification rules, correcting rows that were bucketed under an older, narrower rule
                set, and shows a before/after breakdown of how many events moved between categories.
              </>,
              <>
                <strong>Reprocess Existing Baseline</strong> — retroactively flags each operator&apos;s very first
                recorded addition as onboarding rather than market churn, fixing an old bulk-loaded baseline that
                would otherwise look like a flood of brand-new carrier wins.
              </>,
            ]}
          />
          <Tip>
            Both are safe to re-run at any time — only rows that genuinely need correcting are touched, and neither
            can invent evidence that isn&apos;t already in the source data.
          </Tip>
        </TechAccordion>

        <TechAccordion title="Executive Market Dynamics — interactive charts" defaultExpanded>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            A collapsible strip directly below the KPI cards, wired to the page&apos;s own filter state — clicking
            a slice or bar sets Service / Provider / Region exactly as if you&apos;d used the manual controls, and
            the strip re-renders around whatever the rest of your filters already narrowed it to.
          </Typography>
          <Bullets
            items={[
              <><strong>Routing Changes by Service donut</strong> — change volume by layer (SCCP / DSX / IPX). Click a slice to filter Service.</>,
              <><strong>Carrier Net Movement bar</strong> — a diverging green (net gain) / red (net loss) bar chart, capped to the 5 strongest gainers and 5 strongest losers so a long tail doesn't turn it into a wall of thin bars. Click a bar to filter by Provider.</>,
              <><strong>Regional Churn Distribution</strong> — geographic breakdown of carrier switches by region. Click a bar to filter Region.</>,
            ]}
          />
        </TechAccordion>

        <TechAccordion title="Market Share &amp; Churn Pivot Summary">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            The &quot;⚡ Executive Pivot&quot; button (&quot;Market Share Pivot Summary&quot;) opens a full-screen
            per-carrier win/loss pivot for the current filter scope — a different shape than the row-level change
            feed below it, built for a commercial &quot;who&apos;s actually capturing this market&quot; read.
          </Typography>
          <Bullets
            items={[
              "One row per wholesale carrier: Net Movement, Service Gains, Service Losses, Impacted MNOs / Custs, and a Market Share Trend badge (Capturing Market / Defending / Losing Share).",
              "Expand the [+] on any carrier row to see its full granular migration list — Date, MNO / Customer Name, TADIG, Country, Service, Action, and the specific Displaced / Competing Carrier for each event.",
              'One-click "Export Pivot to Excel (.xlsx)" for the whole pivot, scoped to whatever the Master Filter Bar currently shows.',
            ]}
          />
        </TechAccordion>

        <TechAccordion title="Download MIS Report">
          <Bullets
            items={[
              <><strong>Executive PDF Report (with Charts)</strong> — formatted CXO brief with market-share graphs and KPIs, scoped to the current filters.</>,
              <><strong>Detailed MIS Workbook (.xlsx)</strong> — formatted multi-tab spreadsheet with summary KPIs and the underlying data.</>,
              "Raw CSV Export — unformatted raw feed for downstream data pipelines.",
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
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Each scope combines two things: which operators are included, and which source&apos;s provider names
          are shown for them. The header badge beside the page title always reflects whichever scope is active.
        </Typography>
        <Bullets
          items={[
            <>
              <strong>IR.21 Verified</strong> (default, badge: <em>GSMA IR.21 Declared</em>) — only operators with
              a parsed IR.21 XML declaration on file, showing only IR.21-declared providers. This is the
              platform&apos;s ground-truth baseline: direct operator declarations from IR.21 Section 5 (SCCP
              Signaling), Section 17 (IPX/GRX Roaming Peering &amp; ASNs), and Section 20 (DSX/Diameter Routing
              Agent).
            </>,
            <>
              <strong>As per Reach List</strong> (badge: <em>As per Reach List</em>) — every operator with at
              least one wholesale Reach List claim, whether or not it also has an IR.21 declaration, showing only
              Reach-List-claimed providers. This answers &quot;what do the reach lists say&quot;, distinct from
              &quot;which operators did IR.21 never see&quot; below.
            </>,
            <>
              <strong>Reach List Exclusive only</strong> (badge: <em>Reach List Exclusive Only</em>) — operators
              whose connectivity footprint is present solely via wholesale reach lists, with no official GSMA
              IR.21 declaration on file at all; also shows only Reach-List-sourced providers.
            </>,
            <>
              <strong>All MNOs (IR.21 + Reach List)</strong> (badge: <em>Combined (IR.21 + Reach List)</em>) —
              the full merged market view, every operator with providers shown from whichever source declared
              them. A companion &quot;Only with listed providers&quot; toggle hides any operator with nothing to
              show in the SCCP/DSX/IPX columns, on by default.
            </>,
          ]}
        />
        <ProTip>
          The Dataset Scope, Exclusivity Scope, Region, and Wholesale Provider filters all combine — e.g. &quot;As
          per Reach List&quot; + &quot;SCCP Solo&quot; + a specific carrier shows exactly that carrier&apos;s
          Reach-List-sourced SCCP monopolies, nothing broader.
        </ProTip>

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
            "Multi-parameter filtering by MNO / Cust Name, TADIG, Country, Region, Wholesale Provider, MCC, and MNC — press Enter in any field to search instantly, no separate click required.",
            "Country accepts either a full country name or its ISO-3 code, with a searchable autocomplete dropdown of matching countries as you type.",
            "One-click Region toggle pills (All / Americas / MEA / Europe / APAC / Non-Terrestrial) filter the result set without touching the text fields.",
            "Wholesale Provider is a searchable autocomplete — narrows the table to that carrier's own accounts, and (see Exclusivity Intelligence below) is service-aware once a single-service Exclusivity Scope pill is active.",
            "Database-backed autocomplete suggestions as you type the MNO / Customer name.",
            "Search criteria and results are synchronized to the URL, so browser Back/Forward restores the exact search you had.",
            <>
              An <strong>Active Output Scope Banner</strong> sits directly above the table whenever any filter is
              narrowing the view (Dataset Scope, Exclusivity Scope, Wholesale Provider, Region, Search) — a
              plain-language summary sentence (e.g. &quot;Showing 9 MNOs matching: As per Reach List · IPX Solo ·
              Wholesale Provider: Tata Comm&quot;) plus one removable chip per dimension, and a single
              &quot;Clear All Filters&quot; action.
            </>,
            "CSV export of the current result set — includes a legal footnote noting the data is sourced from declared IR.21 & Reach List archives without operational warranty.",
          ]}
        />

        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          Exclusivity Intelligence — the platform&apos;s key strategic differentiator
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Beyond &quot;who serves this operator&quot;, CCIP surfaces <strong>who serves it exclusively</strong> —
          a single-provider lock-in is commercially very different from an account any competitor could contest.
          The amber &quot;EXCLUSIVITY SCOPE&quot; pill bar (directly below Dataset Scope and Region) narrows the
          table, and every chart beneath it, to one of six lock-in definitions:
        </Typography>
        <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, mb: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Exclusivity Scope pill</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Meaning</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[
                ["All MNOs", "No exclusivity narrowing — every operator in the current Dataset Scope / Region."],
                ["★ Fully Exclusive", "One carrier is the sole declared provider across all three services (SCCP + DSX + IPX) at once — total lock-in."],
                ["SCCP Solo", "Exactly one carrier declared for SCCP signaling on that operator, independent of DSX/IPX."],
                ["DSX Solo", "Exactly one carrier declared for DSX / LTE Diameter routing."],
                ["IPX Solo", "Exactly one carrier declared for GRX/IPX data roaming."],
                ["Any Service Exclusive", "The operator has single-provider lock-in on at least one of the three services, even if the others are shared."],
              ].map(([pill, desc]) => (
                <TableRow key={pill}>
                  <TableCell sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>{pill}</TableCell>
                  <TableCell>{desc}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Every provider name in the table carries the same visual legend, shown again in the table&apos;s own
          Legend row:
        </Typography>
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid item xs={12} sm={6}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box component="span" sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: "#2E7D32", display: "inline-block", flexShrink: 0 }} />
              <Typography variant="caption" color="text.secondary">
                <strong>Green provider name</strong> — exclusive / sole provider for that service
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box component="span" sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: "#5A6B7B", display: "inline-block", flexShrink: 0 }} />
              <Typography variant="caption" color="text.secondary">
                <strong>Dark / gray provider name</strong> — multi-provider, shared service
              </Typography>
            </Box>
          </Grid>
        </Grid>

        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          Exclusivity &amp; Market Share chart strip
        </Typography>
        <Bullets
          items={[
            <>
              <strong>Carrier Exclusivity Share donut</strong> — interactive market-share breakdown of exclusive
              accounts by carrier, scoped to whichever Exclusivity Scope pill is active. Click any slice to drill
              the table down to just that carrier&apos;s exclusive accounts; click &quot;Others&quot; to open a
              modal listing every secondary carrier with its own one-click filter action.
            </>,
            <>
              <strong>Tata Comm Exclusivity Standing</strong> — a dedicated teal KPI banner, always visible,
              showing Tata Comm&apos;s own exclusive-account count, market-share percentage, and rank among all
              carriers in the current scope — surfaced explicitly rather than left to however tall its own donut
              slice happens to be.
            </>,
            <>
              <strong>Exclusivity Vulnerability bar</strong> — the ratio of fully-locked-in accounts vs.
              multi-provider (contestable) accounts. With a carrier drill-down active, it reflects that carrier&apos;s
              own accounts specifically: how many are safely exclusive to them vs. shared with a competitor who
              could win them.
            </>,
            "Clicking a drill-down (a donut slice, or the Wholesale Provider filter) narrows the donut, KPI, and vulnerability chart together — an amber \"Filtering by Carrier\" ribbon and a one-click \"Reset Chart Filter\" always show above the charts while one is active.",
            "Download Exclusivity MIS Report — a PDF (KPI banner + carrier exclusivity chart + full MNO roster) or Excel workbook (market-share sheet with data-bar conditional formatting + MNO exclusivity roster), scoped to exactly whatever's currently filtered.",
          ]}
        />
        <ProTip>
          The donut&apos;s carrier percentages are computed from the full scoped result set, not the
          Wholesale-Provider-filtered table — filtering the table to one carrier doesn&apos;t skew every other
          carrier&apos;s share, so the market picture stays statistically honest even while you&apos;re drilled
          into one carrier&apos;s own accounts.
        </ProTip>
        <Warn>
          <strong>Key distinction:</strong> a single-service pill (e.g. SCCP Solo) plus a Wholesale Provider
          filter shows only rows where that carrier is <em>specifically</em> the exclusive provider for that
          service — not rows where the carrier merely appears somewhere on the row (e.g. as the DSX or IPX
          provider instead). This keeps every visible row genuinely matching the scope you selected.
        </Warn>

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
            'Three high-contrast Dataset Scope pills — "As per IR.21 Data" (declared footprint), "As per Reach List" (commercial claimed footprint), or "Both (Combined)" (union view, one row per source per provider).',
            'A Reset button beside Search clears the search term and returns Dataset Scope to its own default — greyed out whenever nothing is actually filtered.',
            <>
              An <strong>Active Filters ribbon</strong> appears whenever a search term or non-default Dataset
              Scope is applied — a removable chip per dimension plus a &quot;Reset All Filters&quot; button, so
              narrowing to one carrier never traps you without a visible way back to the full list.
            </>,
          ]}
        />

        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          Provider Coverage Overview — charts above the table
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          A collapsible chart panel, mirroring MNO Search&apos;s own Exclusivity charts, gives Provider Search the
          same at-a-glance visual read before anyone opens the raw table:
        </Typography>
        <Bullets
          items={[
            <>
              <strong>Tata Comm Coverage Standing</strong> — a teal KPI banner showing Tata Comm&apos;s own MNO
              count, country count, and rank among every provider in the current search scope.
            </>,
            <>
              <strong>Top Providers by MNO Coverage</strong> — a ranked bar chart (top 10) of every provider by
              total MNOs served; Tata Comm&apos;s own bar is always highlighted in gold regardless of rank. Click
              any bar to filter the search straight to that provider.
            </>,
            <>
              <strong>Service Coverage Mix</strong> — total SCCP / DSX / IPX provider-to-MNO relationships summed
              across every provider currently in scope, showing which service has the broadest wholesale coverage
              overall.
            </>,
            <>
              In &quot;Both (Combined)&quot; mode, a provider appearing under both sources is de-duplicated to one
              bar (its larger of the two MNO counts), never double-counted or double-listed.
            </>,
          ]}
        />

        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          Side-by-Side Carrier Benchmark (Select 2–5 Providers)
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          A dedicated banner, directly above the table, makes the multi-carrier compare feature impossible to
          miss:
        </Typography>
        <Bullets
          items={[
            "5 live selection slots — check a row's checkbox (or click anywhere on the row) and it fills the next open slot as a removable chip; an empty slot shows a dashed placeholder.",
            'Once 2+ carriers are selected, an inline "Compare Selected Providers (N) →" button appears right in the banner.',
            <>
              Two <strong>Quick Benchmark Shortcuts</strong> — &quot;Compare Top 2&quot; and &quot;Compare Top
              3&quot; — one-click straight into the comparison matrix using whichever carriers currently rank
              top-2/top-3 by MNO coverage in the active search scope (not a fixed carrier list, so the shortcut is
              always comparing what&apos;s actually on top right now).
            </>,
            <>
              A high-contrast navy/teal floating dock appears at the bottom of the screen once 2+ carriers are
              selected — &quot;N of 5 Providers Selected&quot;, a &quot;Launch Comparative Analysis →&quot;
              button, and &quot;Clear All&quot;. It never covers the table&apos;s own pagination controls.
            </>,
          ]}
        />

        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Multi-Provider Comparison Matrix — /search/provider/compare
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          One row per MNO covered by <em>any</em> of the 2–5 selected providers, with each provider&apos;s own
          IR.21 vs. Reach List service breakdown in its own grouped column block.
        </Typography>
        <Bullets
          items={[
            'Quick Filter: "All MNOs", "Show common MNOs only" (covered by every selected provider), or "Show exclusivity/gap MNOs" (covered by some but not all — where the real competitive gaps are).',
            "A live search box narrows the matrix by Country or MNO / Cust name.",
            "Clicking any MNO row opens that operator's own full Detail page in a new context.",
          ]}
        />
        <Typography variant="subtitle2" fontWeight={700} gutterBottom sx={{ mt: 1.5 }}>
          Autonomous System Numbers (ASNs)
        </Typography>
        <Bullets
          items={[
            <>
              <strong>MNO ASN column</strong> — pinned directly beside TADIG, showing that operator&apos;s own
              declared routing AS Number(s) from its IR.21 GRX/IPX ASN table (e.g. <code>AS271773</code>). An
              operator with more than one declares its primary on the cell itself, with the full list on hover.
            </>,
            <>
              <strong>Wholesale Provider ASN</strong> — each provider&apos;s own column-group header carries a
              chip showing the ASN(s) that provider has been observed declaring for itself across every ingested
              IR.21 filing (e.g. <em>Arelion</em> <Chip label="ASN 1299" size="small" sx={{ height: 18, fontSize: "0.68rem", bgcolor: "#0A2540", color: "#E2E8F0" }} />). This is parsed from real IR.21 GRX/IPX ASN table data, not a separate registered-ASN field — a provider never observed with a self-declared ASN anywhere shows no chip.
            </>,
          ]}
        />
        <ProTip>
          Use the ASN columns for peering and IPX routing audits — cross-check a wholesale provider&apos;s
          claimed ASN against what your own BGP session actually sees before escalating a routing discrepancy.
        </ProTip>
        <Bullets
          items={["CSV export of the full comparison matrix, including every ASN and service column."]}
        />

        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          Download Provider Report
        </Typography>
        <Bullets
          items={[
            <>
              <strong>Executive PDF Report (with Charts)</strong> — branded brief with a KPI banner (providers in
              scope, total MNO relationships, broadest reach, Tata Comm standing) plus the Top Providers by MNO
              Coverage and Service Coverage Mix charts, followed by a full provider ranking ledger.
            </>,
            <>
              <strong>Detailed MIS Workbook (.xlsx)</strong> — an &quot;Executive Summary&quot; tab (KPI blocks +
              top-ranked table with data-bar conditional formatting) and a &quot;Provider Directory&quot; tab
              (full roster, frozen header, auto-filter, Tata Comm&apos;s own row highlighted).
            </>,
            "Raw CSV Export — the same ranked provider list, unformatted, for pipelines and spreadsheets.",
          ]}
        />

        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Provider Detail — /search/provider/[id]
        </Typography>
        <Bullets
          items={[
            "A heading and badge make explicit which source you're looking at — GSMA IR.21 Declared, Reach List Claimed, or the consolidated IR.21 + Reach List view.",
            "A dedicated in-table search bar instantly filters the served-MNO list by operator name, country, or TADIG as you type.",
            "Clicking any MNO row deep-links straight into that operator's own Detail page.",
            "Dual top-and-bottom pagination — built for large footprints (one major IPX provider alone spans 300+ MNOs) — plus a per-row IR.21 PDF button.",
            "Select both the IR.21 and Reach List row of the same provider (Both Combined mode) to jump straight to its own declared-vs-claimed breakdown instead of the multi-provider matrix.",
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
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        The Admin Menu has six areas. Every action that changes data — uploading, resolving, overriding,
        reclassifying, managing accounts — is restricted to the Admin role; a Viewer or Analyst can open every
        screen below to see the underlying data, but write controls are hidden or disabled for them.
      </Typography>

      <Section title="IR.21 &amp; Reach List Uploads — /admin/upload">
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

        <TechAccordion title="Format guide &amp; sample templates (recap)">
          <Typography variant="body2" color="text.secondary">
            The Reach List Upload card documents both accepted single-file shapes inline, each with a downloadable
            sample <code>.xlsx</code> template pre-filled with the expected columns.
          </Typography>
        </TechAccordion>

        <GoTo label="Open IR.21 &amp; Reach List Uploads" route="/admin/upload" />
      </Section>

      <Section title="Unmapped Variants Queue — /admin/provider-aliases">
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
          {isRestricted && <Chip size="small" color="warning" label="ADMIN ONLY" />}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Every raw carrier-name string encountered during ingestion that doesn&apos;t match any known provider
          alias lands here for a human decision, rather than being silently auto-created as a new, possibly
          duplicate provider. Each entry shows the raw text as it appeared in the source file, how many times it has
          occurred, and which MNOs it affects.
        </Typography>
        <Bullets
          items={[
            "Map a raw variant to an existing canonical provider — every past and future occurrence of that exact text then resolves there automatically.",
            "Register it as a brand-new provider if it genuinely isn't one CCIP already knows about.",
          ]}
        />
        <GoTo label="Open Unmapped Variants Queue" route="/admin/provider-aliases" />
      </Section>

      <Section title="Unresolved Reach List Aliases &amp; Normalization Review — /admin/mno-normalization">
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
          {isRestricted && <Chip size="small" color="warning" label="ADMIN ONLY" />}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          This page has two tabs. GSMA IR.21 is the platform&apos;s sole authoritative source for brand-new operator
          records, so a Reach List row whose operator or TADIG doesn&apos;t match an existing IR.21 MNO no longer
          silently creates one — it queues here instead, under <strong>MNO / Cust Normalization</strong>.
        </Typography>
        <Bullets
          items={[
            "Map a pending row to the correct existing operator by name/TADIG/country search, or accept a system-suggested auto-match with one click.",
            'Select several rows at once for bulk actions — accept all suggestions, map them all to one operator, ignore, or dismiss.',
            '"Create New MNO" registers a genuinely new operator that will never have its own GSMA IR.21 filing (an SMS aggregator, SS7 hub, or MVNO) — it appears under the Reach List Only scope on MNO / Cust Search, kept separate from IR.21-verified coverage.',
          ]}
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          The second tab, <strong>IR.21 Change Log &amp; Normalization Review</strong>, is the full audit trail
          behind every Market Intelligence classification — see the &quot;IR.21 Change Log &amp; Normalization
          Review&quot; topic under the Market Intelligence tab of this guide for what it shows and the Reclassify
          Taxonomy / Reprocess Existing Baseline actions available there.
        </Typography>
        <GoTo label="Open Normalization Review" route="/admin/mno-normalization" />
      </Section>

      <Section title="Provider Overrides &amp; Normalization Audit — /admin/overrides">
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
          {isRestricted && <Chip size="small" color="warning" label="ADMIN ONLY" />}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Also a two-tab page. <strong>MNO/Cust-Level Overrides Log</strong> lists every active per-operator,
          per-service override — a manual pin saying &quot;always resolve this MNO&apos;s SCCP provider to X&quot;,
          regardless of what a future re-upload&apos;s raw text would otherwise resolve to.
        </Typography>
        <Bullets
          items={[
            "Edit an override to point it at a different provider, with a reason note kept for the audit trail.",
            "Revert an override entirely, which goes back to resolving straight from the raw IR.21-declared text.",
          ]}
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, mb: 1 }}>
          <strong>Provider Normalization &amp; Alias Dictionary</strong> shows every canonical provider as a card
          with its known raw-name variants and how many live records currently use each one.
        </Typography>
        <Warn>
          Reassigning an alias to a different canonical provider retroactively repoints every matching operator&apos;s
          connectivity, not just future uploads — the page warns you before this happens.
        </Warn>
        <GoTo label="Open Provider Overrides" route="/admin/overrides" />
      </Section>

      <Section title="User Access &amp; Roles — /admin/users">
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
          {isRestricted && <Chip size="small" color="warning" label="ADMIN ONLY" />}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Every registered account — local email/password sign-ins and Microsoft SSO sign-ins alike — with role,
          active/inactive status, join date, and last-active time. Summary tiles show the total headcount and the
          split across Admin / Analyst / Viewer.
        </Typography>
        <Bullets
          items={[
            "Change any user's role via a dropdown — takes effect on their very next request, no re-login required.",
            "Deactivate or reactivate an account with a single switch.",
            "You can't change your own role or deactivate your own account, as a safeguard against accidentally locking yourself out.",
          ]}
        />
        <GoTo label="Open User Access &amp; Roles" route="/admin/users" />
      </Section>

      <Section title="Platform Architecture (HLD &amp; LLD) — /admin/architecture">
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
          {isRestricted && <Chip size="small" color="warning" label="ADMIN ONLY" />}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          A reference document, not a workflow screen — prepared for IT Security review of the platform&apos;s
          pending Microsoft Entra ID (Azure AD) single sign-on integration, restricted to
          @tatacommunications.com accounts. Covers the system architecture (browser → Vercel frontend → Cloud Run
          backend → Supabase Postgres), the Microsoft sign-in sequence in detail, token lifetime and session
          handling, and the exact Azure AD App Registration fields IT Security needs to configure. Has its own
          &quot;Download PDF&quot; button for sharing with reviewers who don&apos;t have platform access.
        </Typography>
        <GoTo label="Open Platform Architecture" route="/admin/architecture" />
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

        <Divider sx={{ mb: 3 }} className="no-print" />

        <VideoWalkthroughsSection />

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
