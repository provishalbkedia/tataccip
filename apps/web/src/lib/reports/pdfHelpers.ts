import type { jsPDF } from "jspdf";
import { REPORT_COLORS } from "./misReportData";

// A4 landscape, mm -- shared page geometry for every CCIP PDF report.
export const PAGE_W = 297;
export const PAGE_H = 210;
export const MARGIN = 14;

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

export function setFill(doc: jsPDF, hex: string) {
  doc.setFillColor(...hexToRgb(hex));
}
export function setText(doc: jsPDF, hex: string) {
  doc.setTextColor(...hexToRgb(hex));
}
export function setDraw(doc: jsPDF, hex: string) {
  doc.setDrawColor(...hexToRgb(hex));
}

/** Navy masthead band shared by every CCIP PDF report -- title, a running
 * page label, a one-line scope summary, and a generated timestamp. Report
 * modules pass their own title/scopeLine text rather than this helper
 * knowing about any one report's own input shape. */
export function drawMasthead(doc: jsPDF, title: string, scopeLine: string, generatedAt: Date, pageLabel: string) {
  setFill(doc, REPORT_COLORS.navy);
  doc.rect(0, 0, PAGE_W, 20, "F");
  setText(doc, REPORT_COLORS.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(title, MARGIN, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setText(doc, REPORT_COLORS.teal);
  doc.text(pageLabel, PAGE_W - MARGIN, 12, { align: "right" });

  setText(doc, REPORT_COLORS.textSecondary);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(scopeLine, MARGIN, 26);
  doc.text(`Generated ${generatedAt.toISOString().replace("T", " ").slice(0, 19)} UTC  •  Authoritative Baseline: GSMA RAEX IR.21 Ground Truth`, MARGIN, 30.5);
  setDraw(doc, REPORT_COLORS.border);
  doc.line(MARGIN, 33, PAGE_W - MARGIN, 33);
}

export function drawFooter(doc: jsPDF, pageNum: number, totalPages: number) {
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

export function drawSectionHeading(doc: jsPDF, text: string, x: number, y: number) {
  setText(doc, REPORT_COLORS.navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(text, x, y);
  setDraw(doc, REPORT_COLORS.teal);
  doc.setLineWidth(0.8);
  doc.line(x, y + 1.5, x + doc.getTextWidth(text), y + 1.5);
  doc.setLineWidth(0.2);
}

export interface KpiCardSpec {
  label: string;
  value: string;
  sub?: string;
  accent: string;
}

export function drawKpiCards(doc: jsPDF, cards: KpiCardSpec[], x: number, y: number, totalWidth: number, height: number) {
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

/** Diverging horizontal bar chart -- labels on the left, a bar extending
 * right (green) or left (red) from a centered zero-line. Capped to the 5
 * biggest positive + 5 biggest negative entries so a long tail can't turn
 * this into an unreadable wall of thin bars. */
export function drawDivergingBarChart(doc: jsPDF, entries: { label: string; net: number }[], x: number, y: number, width: number) {
  if (entries.length === 0) {
    setText(doc, REPORT_COLORS.textSecondary);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.text("No data in the current filter scope.", x, y + 6);
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
    const label = entry.label.length > 22 ? `${entry.label.slice(0, 21)}…` : entry.label;
    doc.text(label, x, rowY + 4, { align: "left" });

    const halfWidth = barAreaWidth / 2 - 4;
    const barLength = (Math.abs(entry.net) / maxAbs) * halfWidth;
    const isPositive = entry.net >= 0;
    setFill(doc, isPositive ? REPORT_COLORS.success : REPORT_COLORS.danger);
    if (isPositive) doc.rect(centerX, rowY + 0.8, barLength, 4, "F");
    else doc.rect(centerX - barLength, rowY + 0.8, barLength, 4, "F");

    setText(doc, isPositive ? REPORT_COLORS.success : REPORT_COLORS.danger);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const valueLabel = `${entry.net >= 0 ? "+" : ""}${entry.net}`;
    if (isPositive) doc.text(valueLabel, centerX + barLength + 2, rowY + 3.8);
    else doc.text(valueLabel, centerX - barLength - 2, rowY + 3.8, { align: "right" });
  });

  return y + shown.length * rowHeight + 6;
}

/** Simple horizontal bar chart for a non-diverging breakdown -- one bar per
 * category from a fixed left edge, length proportional to share of total,
 * labeled with count and percentage. */
export function drawBreakdownChart(
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
    doc.text("No data in the current filter scope.", x, y + 6);
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
    const label = entry.label.length > 24 ? `${entry.label.slice(0, 23)}…` : entry.label;
    doc.text(label, x, rowY + 4.2);

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
