import {
  CHANGE_TYPE_REPORT_COLOR,
  MisReportInput,
  REGION_COLORS,
  REPORT_COLORS,
  SERVICE_COLORS,
  aggregateByRegion,
  aggregateByService,
  aggregateCarrierMovement,
  reportFileBaseName,
  toLedgerRows,
  triggerBrowserDownload,
} from "./misReportData";
import { MARGIN, PAGE_W, drawBreakdownChart, drawDivergingBarChart, drawFooter, drawKpiCards, drawMasthead, drawSectionHeading, hexToRgb } from "./pdfHelpers";

const REPORT_TITLE = "CCIP — Wholesale Roaming Market Intelligence & Routing Changes MIS";

function scopeLineFor(input: MisReportInput): string {
  return (
    `Timeframe: ${input.scope.timeframe}  |  Region: ${input.scope.region}  |  Service: ${input.scope.service}  |  Category: ${input.scope.changeCategory}` +
    (input.scope.provider ? `  |  Provider: ${input.scope.provider}` : "") +
    (input.scope.search ? `  |  Search: "${input.scope.search}"` : "")
  );
}

export async function generatePdfReport(input: MisReportInput): Promise<void> {
  const { jsPDF: JsPdfCtor } = await import("jspdf");
  const autoTableModule = await import("jspdf-autotable");
  const autoTable = autoTableModule.default;

  const doc = new JsPdfCtor({ orientation: "landscape", unit: "mm", format: "a4" });
  const scopeLine = scopeLineFor(input);

  // ---- Page 1: Executive summary + carrier movement ----
  drawMasthead(doc, REPORT_TITLE, scopeLine, input.generatedAt, "Executive Summary");
  const s = input.summary;
  const topGainer = s?.topGainingProviders[0];
  const topLoser = s?.topLosingProviders[0];
  drawKpiCards(
    doc,
    [
      {
        label: "Total Churn Events",
        value: s ? String(s.totalChurnEvents) : "-",
        sub: s ? `Added ${s.addedCount}  •  Replaced ${s.replacedCount}  •  Removed ${s.removedCount}` : undefined,
        accent: REPORT_COLORS.navy,
      },
      {
        label: "Top Provider Gainer",
        value: topGainer?.providerName ?? "No gains this period",
        sub: topGainer ? `+${topGainer.grossGains} Service Gain across ${topGainer.uniqueOperatorsCount} MNO/Cust${topGainer.uniqueOperatorsCount === 1 ? "" : "s"}` : undefined,
        accent: REPORT_COLORS.success,
      },
      {
        label: "Top Provider Loser",
        value: topLoser?.providerName ?? "No losses recorded",
        sub: topLoser ? `-${topLoser.grossLosses} Service Loss across ${topLoser.uniqueOperatorsCount} MNO/Cust${topLoser.uniqueOperatorsCount === 1 ? "" : "s"}` : undefined,
        accent: REPORT_COLORS.danger,
      },
      {
        label: "Active Switching MNOs / Custs",
        value: s ? String(s.activeSwitchingOperatorCount) : "-",
        accent: REPORT_COLORS.warning,
      },
    ],
    MARGIN,
    40,
    PAGE_W - MARGIN * 2,
    24,
  );

  const carrierMovement = aggregateCarrierMovement(input.rows);
  drawSectionHeading(doc, "Carrier Competitive Net Movement", MARGIN, 78);
  drawDivergingBarChart(doc, carrierMovement.map((c) => ({ label: c.providerName, net: c.net })), MARGIN, 84, PAGE_W - MARGIN * 2);

  // ---- Page 2: Service + regional breakdowns ----
  doc.addPage("a4", "landscape");
  drawMasthead(doc, REPORT_TITLE, scopeLine, input.generatedAt, "Distribution Analysis");
  const halfWidth = (PAGE_W - MARGIN * 2 - 10) / 2;

  drawSectionHeading(doc, "Routing Changes by Service Layer", MARGIN, 42);
  drawBreakdownChart(doc, aggregateByService(input.rows), (l) => SERVICE_COLORS[l] ?? REPORT_COLORS.textSecondary, MARGIN, 48, halfWidth);

  drawSectionHeading(doc, "Regional Distribution of Carrier Switches", MARGIN + halfWidth + 10, 42);
  drawBreakdownChart(
    doc,
    aggregateByRegion(input.rows),
    (l) => REGION_COLORS[l] ?? REPORT_COLORS.textSecondary,
    MARGIN + halfWidth + 10,
    48,
    halfWidth,
  );

  // ---- Page 3+: Detailed ledger ----
  doc.addPage("a4", "landscape");
  drawMasthead(doc, REPORT_TITLE, scopeLine, input.generatedAt, "Detailed Routing Modifications Ledger");
  const ledgerRows = toLedgerRows(input.rows);
  autoTable(doc, {
    startY: 38,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Effective Date", "Region", "Country", "MNO / Customer", "TADIG", "Service", "Change Action", "Carrier Movement Detail", "Source"]],
    body: ledgerRows.map((r) => [r.date, r.region, r.country, r.mnoName, r.tadigCode, r.service, r.changeLabel, r.detail, r.source]),
    theme: "striped",
    styles: { fontSize: 7.5, cellPadding: 1.6, textColor: hexToRgb(REPORT_COLORS.navy) },
    headStyles: { fillColor: hexToRgb(REPORT_COLORS.navy), textColor: hexToRgb(REPORT_COLORS.white), fontStyle: "bold" },
    alternateRowStyles: { fillColor: hexToRgb(REPORT_COLORS.softGray) },
    columnStyles: { 7: { cellWidth: 60 } },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 6) {
        const changeType = ledgerRows[data.row.index]?.changeType;
        const color = changeType ? CHANGE_TYPE_REPORT_COLOR[changeType] : undefined;
        if (color) {
          data.cell.styles.textColor = hexToRgb(color);
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  // Footer + masthead continuation on every page this table spilled onto.
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    if (p > 3) drawMasthead(doc, REPORT_TITLE, scopeLine, input.generatedAt, "Detailed Routing Modifications Ledger (cont'd)");
    drawFooter(doc, p, totalPages);
  }

  const blob = doc.output("blob");
  triggerBrowserDownload(blob, `${reportFileBaseName()}.pdf`);
}
