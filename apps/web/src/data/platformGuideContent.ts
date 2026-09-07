// Structured knowledge registry behind the Executive Copilot assistant
// (components/assistant/ExecutiveCopilot.tsx). Deliberately a plain data
// module, not parsed out of apps/web/src/app/help/page.tsx's JSX at
// runtime -- the Guide page's content is prose meant for a human reading
// top-to-bottom with accordions and tables, while this registry needs
// short, route-addressable, voice-readable chunks. Kept as the *same
// facts*, written twice for two different jobs, rather than one trying to
// serve both; every entry here should stay consistent with its
// corresponding section of the Guide if that section changes.
export interface GuideTopic {
  id: string;
  // Matches a topic to the current page via exact match or path-prefix
  // (see topicsForRoute in ExecutiveCopilot.tsx) -- e.g. "/search/mno"
  // also matches "/search/mno/123" (an MNO Detail page).
  route: string;
  title: string;
  // A concise 5-8 second spoken line -- read aloud by window.speechSynthesis,
  // so it's written to be heard, not read: short sentences, no jargon that
  // needs a screen to parse (spelled-out "GRX slash IPX" reads worse aloud
  // than just "IPX").
  shortVoiceSummary: string;
  // Rich text shown in the popover card -- one or two sentences, screen-read
  // only (not spoken).
  detailedExplanation: string;
  proTips: string[];
  // State variable names on that route this topic is about, for a future
  // "highlight the live control" integration -- not yet wired to anything,
  // kept here so the registry doesn't need a shape change when that lands.
  relatedFilterKeys?: string[];
}

export const PLATFORM_GUIDE_TOPICS: GuideTopic[] = [
  {
    id: "dataset-scopes",
    route: "/search/mno",
    title: "Dataset Scope: IR.21 vs. Reach List",
    shortVoiceSummary:
      "Use IR-21 Verified for GSMA ground truth, As per Reach List for commercial carrier claims, Reach List Exclusive for operators with no IR-21 file at all, or Combined for the full merged market view.",
    detailedExplanation:
      "Each Dataset Scope pill combines which operators are included with which source's provider names are shown for them. The header badge beside the page title always reflects whichever scope is active.",
    proTips: [
      "IR.21 Verified is the platform's ground-truth baseline — only operators with a parsed GSMA IR.21 XML on file.",
      "As per Reach List and Reach List Exclusive only both show Reach-List-sourced provider names — they differ in which operators are included, not which source is shown.",
      "Combined (IR.21 + Reach List) merges both sources for the broadest market view.",
    ],
    relatedFilterKeys: ["datasetScope"],
  },
  {
    id: "mno-exclusivity",
    route: "/search/mno",
    title: "Exclusivity Intelligence",
    shortVoiceSummary:
      "The Exclusivity Scope pills show which carrier holds sole control of SCCP, DSX, or IPX for each operator, and Tata Comm's own standing is always front and center in a dedicated KPI banner.",
    detailedExplanation:
      "Beyond who serves an operator, CCIP surfaces who serves it exclusively — a single-provider lock-in is commercially very different from an account any competitor could contest. Six Exclusivity Scope pills (All MNOs, Fully Exclusive, SCCP Solo, DSX Solo, IPX Solo, Any Service Exclusive) narrow the table and every chart beneath it to one lock-in definition.",
    proTips: [
      "Green provider names are exclusive/sole for that service; dark/gray names are multi-provider and shared.",
      "Click any donut slice to drill the table into just that carrier's exclusive accounts — an amber \"Filtering by Carrier\" ribbon shows above the charts while active, with a one-click Reset Chart Filter.",
      "A single-service pill (e.g. SCCP Solo) plus a Wholesale Provider filter only matches rows where that carrier is specifically the exclusive provider for that service, not any service it merely touches on the row.",
    ],
    relatedFilterKeys: ["exclusiveMode", "datasetScope", "providerFilter"],
  },
  {
    id: "provider-directory",
    route: "/search/provider",
    title: "Provider Search & Coverage Overview",
    shortVoiceSummary:
      "Provider Search flips the view around: pick a carrier to see every operator it serves worldwide, ranked by MNO coverage, with Tata Comm's own standing always highlighted.",
    detailedExplanation:
      "The Provider Coverage Overview charts (Top Providers by MNO Coverage, Service Coverage Mix) give an at-a-glance read before opening the raw table. Three Dataset Scope pills — As per IR.21 Data, As per Reach List, Both (Combined) — control which source's footprint is shown.",
    proTips: [
      "Click any bar in the Top Providers chart to filter the search straight to that provider.",
      "An Active Filters ribbon and a Reset button keep a single-provider search from trapping you — a \"View All N Providers\" quick link always leads back to the full baseline.",
      "Select 2 to 5 providers via checkboxes to open the Side-by-Side Carrier Benchmark, or use the Quick Benchmark Shortcuts to compare the current top 2 or top 3 in one click.",
    ],
    relatedFilterKeys: ["source", "q"],
  },
  {
    id: "provider-comparison",
    route: "/search/provider/compare",
    title: "Multi-Provider Comparison & ASNs",
    shortVoiceSummary:
      "The comparison matrix shows every operator covered by any selected provider, split by IR-21 versus Reach List per service, with each carrier's own ASN shown right in its column header.",
    detailedExplanation:
      "One row per MNO covered by any of the 2-5 selected providers, each provider's own IR.21 vs. Reach List service breakdown in its own grouped column block. The MNO's own declared routing ASN sits pinned beside TADIG.",
    proTips: [
      "Use \"Show common MNOs only\" to see full overlap, or \"Show exclusivity/gap MNOs\" to find where providers genuinely differ.",
      "A provider's ASN chip in its column header reflects real observed IR.21 declarations, not a separate registered-ASN field — a provider never seen with a self-declared ASN shows no chip.",
      "Cross-check a wholesale provider's claimed ASN against your own BGP session before escalating a routing discrepancy.",
    ],
  },
  {
    id: "market-churn",
    route: "/analytics/ir21-changes",
    title: "Commercial Churn Classification",
    shortVoiceSummary:
      "Every carrier switch is classified as Added, Replaced, or Removed — Replaced means a named competitor won the account, Removed means no replacement was identified anywhere in the filings.",
    detailedExplanation:
      "Market Intelligence tracks every provider addition, removal, and direct replacement declared across successive IR.21 re-uploads, per operator and per service. Technical and administrative changes (IP/subnet updates, Diameter/SS7 config, admin renames) are classified separately and hidden from the default commercial-churn view.",
    proTips: [
      "The 'Change:' pill bar's commercial-churn segment is genuine wholesale activity; the technical/admin segment never represents a carrier switch.",
      "Every KPI card embeds a searchable ranked dropdown — type a carrier or MNO name to jump straight to it, not just the top-ranked entry.",
      "A 'Filtered by:' strip above the table always names every active dimension, each with its own clear button.",
    ],
    relatedFilterKeys: ["changeFilter", "timeframe", "region", "service"],
  },
  {
    id: "market-dynamics",
    route: "/analytics/ir21-changes",
    title: "Executive Market Dynamics Charts",
    shortVoiceSummary:
      "The Executive Market Dynamics strip shows service mix, carrier net movement, and regional churn as interactive charts — click any slice or bar to filter the table beneath it.",
    detailedExplanation:
      "A collapsible chart strip directly below the KPI cards: a Routing Changes by Service donut, a diverging green/red Carrier Net Movement bar capped to the top 5 gainers and losers, and a Regional Churn Distribution bar.",
    proTips: [
      "Every chart is wired to the page's own filter state — clicking a slice or bar sets Service, Provider, or Region exactly as the manual controls would.",
    ],
  },
  {
    id: "pivot-summary",
    route: "/analytics/ir21-changes",
    title: "Market Share & Churn Pivot Summary",
    shortVoiceSummary:
      "The Executive Pivot opens a per-carrier win-loss summary with a Market Share Trend badge for each — Capturing Market, Defending, or Losing Share — and full drill-down to every migrated MNO.",
    detailedExplanation:
      "The \"Market Share Pivot Summary\" (⚡ Executive Pivot) button opens a full-screen pivot: one row per wholesale carrier with Net Movement, Service Gains, Service Losses, Impacted MNOs, and a Market Share Trend badge. Expand any row to see the granular migration list.",
    proTips: [
      "Expand the [+] on any carrier row for the full per-MNO migration list: date, TADIG, service, and the specific displaced or competing carrier.",
      "One-click \"Export Pivot to Excel\" exports the whole pivot scoped to whatever the Master Filter Bar currently shows.",
    ],
  },
  {
    id: "mis-reporting-market",
    route: "/analytics/ir21-changes",
    title: "Download MIS Report",
    shortVoiceSummary:
      "Download MIS Report gives you an executive PDF with embedded charts, a multi-tab Excel workbook with KPI data bars, or a raw CSV — all scoped to your current filters.",
    detailedExplanation:
      "Three formats: a branded Executive PDF Report with market-share graphs and KPIs, a Detailed MIS Workbook (.xlsx) with formatted summary and data tabs, and a Raw CSV Export for downstream pipelines.",
    proTips: ["Every export reflects exactly the filters currently applied on screen — nothing broader, nothing narrower."],
  },
  {
    id: "mis-reporting-exclusivity",
    route: "/search/mno",
    title: "Download Exclusivity MIS Report",
    shortVoiceSummary:
      "Download Exclusivity MIS Report packages the carrier exclusivity chart and full MNO roster into a PDF or Excel workbook, scoped to your current Dataset and Exclusivity Scope.",
    detailedExplanation:
      "A PDF (KPI banner + carrier exclusivity chart + full MNO roster) or Excel workbook (market-share sheet with data-bar formatting + MNO exclusivity roster), scoped to exactly whatever is currently filtered.",
    proTips: [],
  },
  {
    id: "mis-reporting-provider",
    route: "/search/provider",
    title: "Download Provider Report",
    shortVoiceSummary:
      "Download Provider Report gives you a branded PDF with coverage charts, a two-tab Excel workbook with Tata Comm highlighted, or a raw CSV of the ranked provider list.",
    detailedExplanation:
      "An Executive PDF Report with a KPI banner and both coverage charts, a Detailed MIS Workbook (.xlsx) with an Executive Summary tab and a Provider Directory tab, or a Raw CSV Export.",
    proTips: [],
  },
];

/** Every topic whose route exactly matches, or is a parent of, the given
 * pathname -- e.g. "/search/mno" matches both its own topics and, once an
 * MNO Detail page ("/search/mno/123") is open, the same topics still apply. */
export function topicsForRoute(pathname: string): GuideTopic[] {
  return PLATFORM_GUIDE_TOPICS.filter((t) => pathname === t.route || pathname.startsWith(`${t.route}/`));
}

/** Case-insensitive substring match across title, explanation, and pro-tips
 * -- deliberately simple (no fuzzy/ranked matching) so the search behavior
 * is easy to reason about and never surprises with a miss on an exact
 * phrase the user typed. */
export function searchGuideTopics(query: string): GuideTopic[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return PLATFORM_GUIDE_TOPICS.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      t.detailedExplanation.toLowerCase().includes(q) ||
      t.shortVoiceSummary.toLowerCase().includes(q) ||
      t.proTips.some((p) => p.toLowerCase().includes(q)),
  );
}
