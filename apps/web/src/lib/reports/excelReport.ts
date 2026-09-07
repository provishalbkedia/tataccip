import type { Workbook, Worksheet } from "exceljs";
import {
  CHANGE_TYPE_REPORT_COLOR,
  MisReportInput,
  REPORT_COLORS,
  aggregateByRegion,
  aggregateByService,
  aggregateCarrierMovement,
  reportFileBaseName,
  toLedgerRows,
  triggerBrowserDownload,
} from "./misReportData";

// ARGB, not plain hex -- exceljs fill/font colors require the alpha
// channel prefix ("FF" = fully opaque) or the color is silently ignored.
const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

function styleTitleRow(ws: Worksheet, text: string, span: number) {
  ws.mergeCells(1, 1, 1, span);
  const cell = ws.getCell(1, 1);
  cell.value = text;
  cell.font = { size: 16, bold: true, color: { argb: argb(REPORT_COLORS.white) } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(REPORT_COLORS.navy) } };
  cell.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 30;
}

function styleSectionHeading(ws: Worksheet, row: number, text: string, span: number) {
  ws.mergeCells(row, 1, row, span);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { size: 12, bold: true, color: { argb: argb(REPORT_COLORS.navy) } };
  cell.border = { bottom: { style: "thin", color: { argb: argb(REPORT_COLORS.border) } } };
}

function styleTableHeaderRow(row: import("exceljs").Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: argb(REPORT_COLORS.white) } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(REPORT_COLORS.navy) } };
    cell.alignment = { vertical: "middle" };
  });
}

/** Builds "Executive MIS Summary" -- branded header, scope metadata, the 4
 * KPI blocks (same numbers the on-screen KPI cards show), and the three
 * aggregate tables the PDF renders as bar charts. Excel has no reliable
 * cross-platform way to script a native chart object via exceljs, so the
 * "chart" content here is the same aggregate data as clean, sortable
 * tables instead -- an analyst pivoting this data in Excel gets more use
 * from real cells than from a picture of a chart. */
function buildSummarySheet(wb: Workbook, input: MisReportInput) {
  const ws = wb.addWorksheet("Executive MIS Summary", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 28 }, { width: 22 }, { width: 22 }, { width: 22 }];

  styleTitleRow(ws, "CCIP — Wholesale Roaming Market Intelligence & Routing Changes MIS", 4);

  let row = 3;
  const metaLine = (label: string, value: string) => {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = { bold: true, color: { argb: argb(REPORT_COLORS.textSecondary) } };
    ws.mergeCells(row, 2, row, 4);
    ws.getCell(row, 2).value = value;
    row++;
  };
  metaLine("Generated (UTC)", input.generatedAt.toISOString().replace("T", " ").slice(0, 19));
  metaLine(
    "Filter Scope",
    `Timeframe: ${input.scope.timeframe} | Region: ${input.scope.region} | Service: ${input.scope.service} | Category: ${input.scope.changeCategory}` +
      (input.scope.provider ? ` | Provider: ${input.scope.provider}` : "") +
      (input.scope.search ? ` | Search: "${input.scope.search}"` : ""),
  );
  metaLine("Authoritative Baseline", "GSMA RAEX IR.21 Ground Truth");
  row++;

  // KPI blocks
  styleSectionHeading(ws, row, "Executive Summary KPIs", 4);
  row++;
  const s = input.summary;
  const topGainer = s?.topGainingProviders[0];
  const topLoser = s?.topLosingProviders[0];
  const kpis: [string, string][] = [
    [
      "Total Churn Events",
      s ? `${s.totalChurnEvents}  (Added: ${s.addedCount} | Replaced: ${s.replacedCount} | Removed: ${s.removedCount})` : "-",
    ],
    [
      "Top Provider Gainer",
      topGainer
        ? `${topGainer.providerName} — +${topGainer.grossGains} Service Gain across ${topGainer.uniqueOperatorsCount} MNO/Cust${topGainer.uniqueOperatorsCount === 1 ? "" : "s"}`
        : "No gains this period",
    ],
    [
      "Top Provider Loser",
      topLoser
        ? `${topLoser.providerName} — -${topLoser.grossLosses} Service Loss across ${topLoser.uniqueOperatorsCount} MNO/Cust${topLoser.uniqueOperatorsCount === 1 ? "" : "s"}`
        : "No losses recorded",
    ],
    ["Active Switching MNOs / Custs", s ? String(s.activeSwitchingOperatorCount) : "-"],
  ];
  for (const [label, value] of kpis) {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = { bold: true };
    ws.getCell(row, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(REPORT_COLORS.softGray) } };
    ws.mergeCells(row, 2, row, 4);
    ws.getCell(row, 2).value = value;
    ws.getCell(row, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(REPORT_COLORS.softGray) } };
    row++;
  }
  row++;

  // Carrier Win/Loss table
  styleSectionHeading(ws, row, "Carrier Competitive Net Movement (within current filter scope)", 4);
  row++;
  const carrierRow = ws.getRow(row);
  carrierRow.values = ["Wholesale Carrier", "Gross Gains", "Gross Losses", "Net Movement"];
  styleTableHeaderRow(carrierRow);
  row++;
  const carrierMovement = aggregateCarrierMovement(input.rows);
  if (carrierMovement.length === 0) {
    ws.getCell(row, 1).value = "No carrier gain/loss events in the current filter scope.";
    ws.getCell(row, 1).font = { italic: true, color: { argb: argb(REPORT_COLORS.textSecondary) } };
    row++;
  }
  for (const c of carrierMovement) {
    ws.getRow(row).values = [c.providerName, c.gains, c.losses, c.net];
    const netCell = ws.getCell(row, 4);
    netCell.font = { bold: true, color: { argb: argb(c.net >= 0 ? REPORT_COLORS.success : REPORT_COLORS.danger) } };
    row++;
  }
  row++;

  // Service breakdown table
  styleSectionHeading(ws, row, "Routing Changes by Service Layer", 4);
  row++;
  const svcHeaderRow = ws.getRow(row);
  svcHeaderRow.values = ["Service", "Event Count", "% of Total", ""];
  styleTableHeaderRow(svcHeaderRow);
  row++;
  for (const b of aggregateByService(input.rows)) {
    ws.getRow(row).values = [b.label, b.count, `${b.pct.toFixed(1)}%`, ""];
    row++;
  }
  row++;

  // Regional breakdown table
  styleSectionHeading(ws, row, "Regional Distribution of Carrier Switches", 4);
  row++;
  const regionHeaderRow = ws.getRow(row);
  regionHeaderRow.values = ["Region", "Event Count", "% of Total", ""];
  styleTableHeaderRow(regionHeaderRow);
  row++;
  for (const b of aggregateByRegion(input.rows)) {
    ws.getRow(row).values = [b.label, b.count, `${b.pct.toFixed(1)}%`, ""];
    row++;
  }
}

/** Builds "Routing Changes Log" -- the full ledger, one row per change
 * event, with a frozen header row and a colored Change Action badge cell
 * per row (green/amber/red/blue matching the same tokens the PDF and the
 * live app use) so a reader can scan the sheet's shape without reading
 * every cell. */
function buildLedgerSheet(wb: Workbook, input: MisReportInput) {
  const ws = wb.addWorksheet("Routing Changes Log", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Effective Date", key: "date", width: 14 },
    { header: "Region", key: "region", width: 14 },
    { header: "Country", key: "country", width: 20 },
    { header: "MNO / Customer", key: "mnoName", width: 26 },
    { header: "TADIG", key: "tadigCode", width: 10 },
    { header: "Service", key: "service", width: 10 },
    { header: "Change Action", key: "changeLabel", width: 16 },
    { header: "Carrier Movement Detail", key: "detail", width: 40 },
    { header: "Source", key: "source", width: 18 },
  ];
  styleTableHeaderRow(ws.getRow(1));

  const ledgerRows = toLedgerRows(input.rows);
  for (const r of ledgerRows) {
    const excelRow = ws.addRow(r);
    const changeCell = excelRow.getCell("changeLabel");
    const color = CHANGE_TYPE_REPORT_COLOR[r.changeType];
    changeCell.font = { bold: true, color: { argb: argb(REPORT_COLORS.white) } };
    changeCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(color) } };
    changeCell.alignment = { horizontal: "center" };
  }

  // Banded rows -- alternating soft-gray fill on every non-header row makes
  // a wide sheet's rows easier to track by eye than borders alone.
  for (let i = 2; i <= ws.rowCount; i++) {
    if (i % 2 === 0) continue;
    ws.getRow(i).eachCell((cell) => {
      if (!cell.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(REPORT_COLORS.softGray) } };
    });
  }

  ws.getRow(ws.rowCount + 2).getCell(1).value =
    "Notice: Exported from CCIP for intelligence analysis. Sourced from declared IR.21 & Reach List archives without operational warranty.";
}

export async function generateExcelReport(input: MisReportInput): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "CCIP — Connectivity Coverage Intelligence Platform";
  wb.created = input.generatedAt;

  buildSummarySheet(wb, input);
  buildLedgerSheet(wb, input);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  triggerBrowserDownload(blob, `${reportFileBaseName()}.xlsx`);
}
