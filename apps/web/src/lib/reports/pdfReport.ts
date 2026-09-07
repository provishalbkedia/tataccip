import type { jsPDF } from "jspdf";
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

const PAGE_W = 297; // A4 landscape, mm
const PAGE_H = 210;
const MARGIN = 14;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

function setFill(doc: jsPDF, hex: string) {
  doc.setFillColor(...hexToRgb(hex));
}
function setText(doc: jsPDF, hex: string) {
  doc.setTextColor(...hexToRgb(hex));
}
function setDraw(doc: jsPDF, hex: string) {
  doc.setDrawColor(...hexToRgb(hex));
}

/** Every page's masthead: a navy band across the top with the report
 * title, plus (on pages 2+) a running-header re-statement of the filter
 * scope, since a printed/scrolled page far from page 1 shouldn't leave a
 * reader guessing what data they're looking at. */
function drawMasthead(doc: jsPDF, input: MisReportInput, pageLabel: string) {
  setFill(doc, REPORT_COLORS.navy);
  doc.rect(0, 0, PAGE_W, 20, "F");
  setText(doc, REPORT_COLORS.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("CCIP — Wholesale Roaming Market Intelligence & Routing Changes MIS", MARGIN, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setText(doc, REPORT_COLORS.teal);
  doc.text(pageLabel, PAGE_W - MARGIN, 12, { align: "right" });

  setText(doc, REPORT_COLORS.textSecondary);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const scopeLine =
    `Timeframe: ${input.scope.timeframe}  |  Region: ${input.scope.region}  |  Service: ${input.scope.service}  |  Category: ${input.scope.changeCategory}` +
    (input.scope.provider ? `  |  Provider: ${input.scope.provider}` : "") +
    (input.scope.search ? `  |  Search: "${input.scope.search}"` : "");
  doc.text(scopeLine, MARGIN, 26);
  doc.text(`Generated ${input.generatedAt.toISOString().replace("T", " ").slice(0, 19)} UTC  •  Authoritative Baseline: GSMA RAEX IR.21 Ground Truth`, MARGIN, 30.5);
  setDraw(doc, REPORT_COLORS.border);
  doc.line(MARGIN, 33, PAGE_W - MARGIN, 33);
}

function drawFooter(doc: jsPDF, pageNum: number, totalPages: number) {
  setText(doc, REPORT_COLORS.textSecondary);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text(
    "Notice: Exported from CCIP for intelligence analysis. Sourced from declared IR.21 & Reach List archives without operational warranty.",
    MARGIN,
    PAGE_H - 8,
  );
  doc.text(`Page ${pageNum} of ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
}

function drawSectionHeading(doc: jsPDF, text: string, x: number, y: number) {
  setText(doc, REPORT_COLORS.navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(text, x, y);
  setDraw(doc, REPORT_COLORS.teal);
  doc.setLineWidth(0.8);
  doc.line(x, y + 1.5, x + doc.getTextWidth(text), y + 1.5);
  doc.setLineWidth(0.2);
}

interface KpiCardSpec {
  label: string;
  value: string;
  sub?: string;
  accent: string;
}

function drawKpiCards(doc: jsPDF, cards: KpiCardSpec[], x: number, y: number, totalWidth: number, height: number) {
  const gap = 4;
  const cardWidth = (totalWidth - gap * (cards.length - 1)) / cards.length;
  cards.forEach((card, i) => {
    const cx = x + i * (cardWidth + gap);
    setFill(doc, REPORT_COLORS.softGray);
    doc.roundedRect(cx, y, cardWidth, height, 2, 2, "F");
    setFill(doc, card.accent);
    doc.rect(cx, y, cardWidth, 1.6, "F");

    setText(doc, REPORT_COLORS.textSecondary);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(card.label.toUpperCase(), cx + 4, y + 8);

    setText(doc, REPORT_COLORS.navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    const valueLines = doc.splitTextToSize(card.value, cardWidth - 8);
    doc.text(valueLines, cx + 4, y + 16);

    if (card.sub) {
      setText(doc, REPORT_COLORS.textSecondary);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      const subLines = doc.splitTextToSize(card.sub, cardWidth - 8);
      doc.text(subLines, cx + 4, y + 16 + valueLines.length * 4.5);
    }
  });
}

/** Diverging horizontal bar chart -- carrier names on the left, a bar
 * extending right (green, gains) or left (red, losses) from a centered
 * zero-line, exactly the shape a CXO expects from a "who's winning /
 * losing carriers" ranking. Capped to the 5 biggest gainers + 5 biggest
 * losers so a long tail of single-event carriers can't turn this into an
 * unreadable wall of thin bars. */
function drawCarrierMovementChart(doc: jsPDF, entries: { providerName: string; net: number }[], x: number, y: number, width: number) {
  if (entries.length === 0) {
    setText(doc, REPORT_COLORS.textSecondary);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.text("No carrier gain/loss events in the current filter scope.", x, y + 6);
    return y + 14;
  }
  const shown = entries.length <= 10 ? entries : [...entries.slice(0, 5), ...entries.slice(-5)];
  const labelWidth = 46;
  const barAreaX = x + labelWidth;
  const barAreaWidth = width - labelWidth;
  const centerX = barAreaX + barAreaWidth / 2;
  const maxAbs = Math.max(...shown.map((e) => Math.abs(e.net)), 1);
  const rowHeight = 6.5;

  setDraw(doc, REPORT_COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(centerX, y - 2, centerX, y + shown.length * rowHeight + 2);

  shown.forEach((entry, i) => {
    const rowY = y + i * rowHeight;
    setText(doc, REPORT_COLORS.navy);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const label = entry.providerName.length > 22 ? `${entry.providerName.slice(0, 21)}…` : entry.providerName;
    doc.text(label, x, rowY + 4, { align: "left" });

    const halfWidth = barAreaWidth / 2 - 4;
    const barLength = (Math.abs(entry.net) / maxAbs) * halfWidth;
    const isGain = entry.net >= 0;
    setFill(doc, isGain ? REPORT_COLORS.success : REPORT_COLORS.danger);
    if (isGain) doc.rect(centerX, rowY + 0.8, barLength, 4, "F");
    else doc.rect(centerX - barLength, rowY + 0.8, barLength, 4, "F");

    setText(doc, isGain ? REPORT_COLORS.success : REPORT_COLORS.danger);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const valueLabel = `${entry.net >= 0 ? "+" : ""}${entry.net}`;
    if (isGain) doc.text(valueLabel, centerX + barLength + 2, rowY + 3.8);
    else doc.text(valueLabel, centerX - barLength - 2, rowY + 3.8, { align: "right" });
  });

  return y + shown.length * rowHeight + 6;
}

/** Simple horizontal bar chart for a non-diverging breakdown (Service
 * Layer, Region) -- one bar per category from a fixed left edge, length
 * proportional to share of total, labeled with count and percentage. */
function drawBreakdownChart(
  doc: jsPDF,
  entries: { label: string; count: number; pct: number }[],
  colorOf: (label: string) => string,
  x: number,
  y: number,
  width: number,
) {
  if (entries.length === 0) {
    setText(doc, REPORT_COLORS.textSecondary);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.text("No events in the current filter scope.", x, y + 6);
    return y + 14;
  }
  const labelWidth = 36;
  const barAreaX = x + labelWidth;
  const barAreaWidth = width - labelWidth - 26;
  const maxCount = Math.max(...entries.map((e) => e.count), 1);
  const rowHeight = 7.5;

  entries.forEach((entry, i) => {
    const rowY = y + i * rowHeight;
    setText(doc, REPORT_COLORS.navy);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(entry.label, x, rowY + 4.2);

    const barLength = (entry.count / maxCount) * barAreaWidth;
    setFill(doc, colorOf(entry.label));
    doc.rect(barAreaX, rowY + 1, Math.max(barLength, 1.5), 4.5, "F");

    setText(doc, REPORT_COLORS.textSecondary);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(`${entry.count} (${entry.pct.toFixed(0)}%)`, barAreaX + barAreaWidth + 2, rowY + 4.2);
  });

  return y + entries.length * rowHeight + 6;
}

export async function generatePdfReport(input: MisReportInput): Promise<void> {
  const { jsPDF: JsPdfCtor } = await import("jspdf");
  const autoTableModule = await import("jspdf-autotable");
  const autoTable = autoTableModule.default;

  const doc = new JsPdfCtor({ orientation: "landscape", unit: "mm", format: "a4" });

  // ---- Page 1: Executive summary + carrier movement ----
  drawMasthead(doc, input, "Executive Summary");
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
  drawCarrierMovementChart(doc, carrierMovement, MARGIN, 84, PAGE_W - MARGIN * 2);

  // ---- Page 2: Service + regional breakdowns ----
  doc.addPage("a4", "landscape");
  drawMasthead(doc, input, "Distribution Analysis");
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
  drawMasthead(doc, input, "Detailed Routing Modifications Ledger");
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
    didDrawPage: () => {
      // autoTable draws its own header on every continuation page it adds
      // internally; the masthead/footer for those pages is applied in the
      // page-count pass below instead of here, since didDrawPage fires
      // mid-table before this function's own page count is known.
    },
  });

  // Footer + masthead continuation on every page this table spilled onto.
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    if (p > 3) drawMasthead(doc, input, "Detailed Routing Modifications Ledger (cont'd)");
    drawFooter(doc, p, totalPages);
  }

  const blob = doc.output("blob");
  triggerBrowserDownload(blob, `${reportFileBaseName()}.pdf`);
}
