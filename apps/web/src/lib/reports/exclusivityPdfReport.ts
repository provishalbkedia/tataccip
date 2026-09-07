import { REPORT_COLORS, triggerBrowserDownload } from "./misReportData";
import { MARGIN, PAGE_W, drawBreakdownChart, drawFooter, drawKpiCards, drawMasthead, drawSectionHeading, hexToRgb } from "./pdfHelpers";
import { ExclusivityReportInput, aggregateCarrierExclusivity, computeExclusivityKpis, exclusivityReportFileBaseName, toRosterRows } from "./exclusivityReportData";

const REPORT_TITLE = "CCIP — Wholesale Roaming Exclusivity & Account Dominance Report";

function scopeLineFor(input: ExclusivityReportInput): string {
  return (
    `Dataset: ${input.scope.datasetScope}  |  Region: ${input.scope.region}  |  Exclusivity: ${input.scope.exclusivityMode}  |  Service: ${input.scope.serviceFilter}` +
    (input.scope.provider ? `  |  Wholesale Provider: ${input.scope.provider}` : "") +
    (input.scope.search ? `  |  Search: "${input.scope.search}"` : "")
  );
}

export async function generateExclusivityPdfReport(input: ExclusivityReportInput): Promise<void> {
  const { jsPDF: JsPdfCtor } = await import("jspdf");
  const autoTableModule = await import("jspdf-autotable");
  const autoTable = autoTableModule.default;

  const doc = new JsPdfCtor({ orientation: "landscape", unit: "mm", format: "a4" });
  const scopeLine = scopeLineFor(input);
  const kpis = computeExclusivityKpis(input.rows);
  const carrierShare = aggregateCarrierExclusivity(input.rows);

  // ---- Page 1: Executive summary + carrier dominance ----
  drawMasthead(doc, REPORT_TITLE, scopeLine, input.generatedAt, "Executive Summary");
  drawKpiCards(
    doc,
    [
      { label: "Total MNOs / Custs in Scope", value: String(kpis.totalMnos), accent: REPORT_COLORS.navy },
      {
        label: "Total Exclusive MNOs",
        value: String(kpis.totalExclusiveMnos),
        sub: `${kpis.exclusivityRatePct.toFixed(1)}% of scope`,
        accent: REPORT_COLORS.warning,
      },
      {
        label: "Top Dominant Carrier",
        value: kpis.topDominantCarrier ?? "No exclusive accounts",
        sub: kpis.topDominantCarrier ? `${kpis.topDominantCarrierCount} exclusive MNO/Custs locked in` : undefined,
        accent: REPORT_COLORS.success,
      },
      { label: "Exclusivity Rate", value: `${kpis.exclusivityRatePct.toFixed(1)}%`, accent: REPORT_COLORS.danger },
    ],
    MARGIN,
    40,
    PAGE_W - MARGIN * 2,
    24,
  );

  drawSectionHeading(doc, "Carrier Exclusivity Market Share (by exclusive service assignments)", MARGIN, 78);
  drawBreakdownChart(
    doc,
    carrierShare.map((c) => ({ label: c.providerName, count: c.totalExclusiveAssignments, pct: c.pctOfExclusiveAssignments })),
    () => REPORT_COLORS.navy,
    MARGIN,
    84,
    PAGE_W - MARGIN * 2,
  );

  // ---- Page 2: Carrier Footprint Matrix ----
  doc.addPage("a4", "landscape");
  drawMasthead(doc, REPORT_TITLE, scopeLine, input.generatedAt, "Carrier Footprint Matrix");
  autoTable(doc, {
    startY: 38,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Wholesale Carrier", "Exclusive MNOs Locked In", "% of Exclusive Assignments", "SCCP-Solo", "DSX-Solo", "IPX-Solo"]],
    body: carrierShare.map((c) => [
      c.providerName,
      String(c.exclusiveMnoCount),
      `${c.pctOfExclusiveAssignments.toFixed(1)}%`,
      String(c.sccpExclusiveCount),
      String(c.dsxExclusiveCount),
      String(c.ipxExclusiveCount),
    ]),
    theme: "striped",
    styles: { fontSize: 9, cellPadding: 2.2, textColor: hexToRgb(REPORT_COLORS.navy) },
    headStyles: { fillColor: hexToRgb(REPORT_COLORS.navy), textColor: hexToRgb(REPORT_COLORS.white), fontStyle: "bold" },
    alternateRowStyles: { fillColor: hexToRgb(REPORT_COLORS.softGray) },
  });

  // ---- Page 3+: Scoped MNO Inventory ----
  doc.addPage("a4", "landscape");
  drawMasthead(doc, REPORT_TITLE, scopeLine, input.generatedAt, "Scoped MNO Inventory");
  const roster = toRosterRows(input.rows);
  autoTable(doc, {
    startY: 38,
    margin: { left: MARGIN, right: MARGIN },
    head: [["MNO / Customer", "TADIG", "Country", "Region", "SCCP Provider", "DSX Provider", "IPX Provider", "Exclusivity"]],
    body: roster.map((r) => [r.operatorName, r.tadigCode, r.country, r.region, r.sccpProvider, r.dsxProvider, r.ipxProvider, r.exclusivityStatus]),
    theme: "striped",
    styles: { fontSize: 7.5, cellPadding: 1.6, textColor: hexToRgb(REPORT_COLORS.navy) },
    headStyles: { fillColor: hexToRgb(REPORT_COLORS.navy), textColor: hexToRgb(REPORT_COLORS.white), fontStyle: "bold" },
    alternateRowStyles: { fillColor: hexToRgb(REPORT_COLORS.softGray) },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 7) {
        const status = roster[data.row.index]?.exclusivityStatus;
        data.cell.styles.textColor = hexToRgb(status === "Single Provider" ? REPORT_COLORS.success : REPORT_COLORS.textSecondary);
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    if (p > 3) drawMasthead(doc, REPORT_TITLE, scopeLine, input.generatedAt, "Scoped MNO Inventory (cont'd)");
    drawFooter(doc, p, totalPages);
  }

  const blob = doc.output("blob");
  triggerBrowserDownload(blob, `${exclusivityReportFileBaseName()}.pdf`);
}
