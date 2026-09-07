import { REPORT_COLORS, triggerBrowserDownload } from "./misReportData";
import { MARGIN, PAGE_W, drawBreakdownChart, drawFooter, drawKpiCards, drawMasthead, drawSectionHeading, hexToRgb } from "./pdfHelpers";
import {
  ProviderReportInput,
  computeProviderReportKpis,
  computeServiceMix,
  providerReportFileBaseName,
  scopeLineFor,
  toProviderRosterRows,
} from "./providerReportData";

const REPORT_TITLE = "CCIP — Wholesale Provider Footprint & Reach Benchmark Report";
const TOP_N_CHART = 10;

export async function generateProviderPdfReport(input: ProviderReportInput): Promise<void> {
  const { jsPDF: JsPdfCtor } = await import("jspdf");
  const autoTableModule = await import("jspdf-autotable");
  const autoTable = autoTableModule.default;

  const doc = new JsPdfCtor({ orientation: "landscape", unit: "mm", format: "a4" });
  const scopeLine = scopeLineFor(input);
  const kpis = computeProviderReportKpis(input.rankedProviders);
  const serviceMix = computeServiceMix(input.rankedProviders);
  const topProviders = input.rankedProviders.slice(0, TOP_N_CHART);
  const totalForChart = topProviders.reduce((sum, p) => sum + p.stats.totalMnos, 0) || 1;

  // ---- Page 1: Executive summary + coverage charts ----
  drawMasthead(doc, REPORT_TITLE, scopeLine, input.generatedAt, "Executive Summary");
  drawKpiCards(
    doc,
    [
      { label: "Providers in Scope", value: String(kpis.totalProviders), accent: REPORT_COLORS.navy },
      { label: "Total MNO Relationships", value: String(kpis.totalMnoRelationships), accent: REPORT_COLORS.blue },
      {
        label: "Broadest Reach",
        value: kpis.broadestReachProvider ?? "-",
        sub: kpis.broadestReachProvider ? `${kpis.broadestReachCount} MNOs covered` : undefined,
        accent: REPORT_COLORS.teal,
      },
      {
        label: "Tata Comm Standing",
        value: kpis.homeCarrierRank ? `Rank #${kpis.homeCarrierRank} of ${kpis.totalProviders}` : "Not in scope",
        sub: kpis.homeCarrierMnoCount !== null ? `${kpis.homeCarrierMnoCount} MNOs covered` : undefined,
        accent: REPORT_COLORS.warning,
      },
    ],
    MARGIN,
    40,
    PAGE_W - MARGIN * 2,
    24,
  );

  drawSectionHeading(doc, `Top Providers by MNO Coverage (top ${topProviders.length} of ${kpis.totalProviders})`, MARGIN, 78);
  const afterTopChartY = drawBreakdownChart(
    doc,
    topProviders.map((p) => ({ label: p.providerName, count: p.stats.totalMnos, pct: (p.stats.totalMnos / totalForChart) * 100 })),
    () => REPORT_COLORS.navy,
    MARGIN,
    84,
    PAGE_W - MARGIN * 2,
  );

  const serviceMixTotal = serviceMix.reduce((sum, s) => sum + s.count, 0) || 1;
  drawSectionHeading(doc, "Service Coverage Mix (SCCP / DSX / IPX relationships across all listed providers)", MARGIN, afterTopChartY + 6);
  drawBreakdownChart(
    doc,
    serviceMix.map((s) => ({ label: s.label, count: s.count, pct: (s.count / serviceMixTotal) * 100 })),
    (label) => (label.startsWith("SCCP") ? REPORT_COLORS.navy : label.startsWith("DSX") ? REPORT_COLORS.teal : REPORT_COLORS.blue),
    MARGIN,
    afterTopChartY + 12,
    PAGE_W - MARGIN * 2,
  );

  // ---- Page 2+: Provider ranking ledger ----
  doc.addPage("a4", "landscape");
  drawMasthead(doc, REPORT_TITLE, scopeLine, input.generatedAt, "Provider Ranking Ledger");
  const roster = toProviderRosterRows(input.rankedProviders);
  autoTable(doc, {
    startY: 38,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Rank", "Provider Name", "Type", "Headquarters", "Total MNOs", "Countries", "SCCP", "DSX", "IPX"]],
    body: roster.map((r) => [
      String(r.rank),
      r.providerName,
      r.providerType,
      r.headquarters,
      String(r.totalMnos),
      String(r.totalCountries),
      String(r.sccpCount),
      String(r.dsxCount),
      String(r.ipxCount),
    ]),
    theme: "striped",
    styles: { fontSize: 8.5, cellPadding: 2, textColor: hexToRgb(REPORT_COLORS.navy) },
    headStyles: { fillColor: hexToRgb(REPORT_COLORS.navy), textColor: hexToRgb(REPORT_COLORS.white), fontStyle: "bold" },
    alternateRowStyles: { fillColor: hexToRgb(REPORT_COLORS.softGray) },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 1 && roster[data.row.index]?.providerName === "Tata Comm") {
        data.cell.styles.textColor = hexToRgb(REPORT_COLORS.teal);
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    if (p > 2) drawMasthead(doc, REPORT_TITLE, scopeLine, input.generatedAt, "Provider Ranking Ledger (cont'd)");
    drawFooter(doc, p, totalPages);
  }

  const blob = doc.output("blob");
  triggerBrowserDownload(blob, `${providerReportFileBaseName()}.pdf`);
}
