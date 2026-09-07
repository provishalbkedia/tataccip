import type { DataBarRuleType, Row, Workbook } from "exceljs";
import { REPORT_COLORS, triggerBrowserDownload } from "./misReportData";
import {
  ExclusivityReportInput,
  aggregateCarrierExclusivity,
  computeExclusivityKpis,
  exclusivityReportFileBaseName,
  toRosterRows,
} from "./exclusivityReportData";

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

function styleTitleRow(row: Row, span: number, merge: (r1: number, c1: number, r2: number, c2: number) => void, rowNum: number, text: string) {
  merge(rowNum, 1, rowNum, span);
  const cell = row.getCell(1);
  cell.value = text;
  cell.font = { size: 16, bold: true, color: { argb: argb(REPORT_COLORS.white) } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(REPORT_COLORS.navy) } };
  cell.alignment = { vertical: "middle", horizontal: "left" };
  row.height = 30;
}

function styleHeaderRow(row: Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: argb(REPORT_COLORS.white) } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(REPORT_COLORS.navy) } };
    cell.alignment = { vertical: "middle" };
  });
}

function buildMarketShareSheet(wb: Workbook, input: ExclusivityReportInput) {
  const ws = wb.addWorksheet("Exclusivity Market Share", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 28 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }];

  styleTitleRow(ws.getRow(1), 5, ws.mergeCells.bind(ws), 1, "CCIP — Wholesale Roaming Exclusivity & Account Dominance Report");

  let row = 3;
  const metaLine = (label: string, value: string) => {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = { bold: true, color: { argb: argb(REPORT_COLORS.textSecondary) } };
    ws.mergeCells(row, 2, row, 5);
    ws.getCell(row, 2).value = value;
    row++;
  };
  metaLine("Generated (UTC)", input.generatedAt.toISOString().replace("T", " ").slice(0, 19));
  metaLine(
    "Filter Scope",
    `Dataset: ${input.scope.datasetScope} | Region: ${input.scope.region} | Exclusivity: ${input.scope.exclusivityMode} | Service: ${input.scope.serviceFilter}` +
      (input.scope.provider ? ` | Wholesale Provider: ${input.scope.provider}` : "") +
      (input.scope.search ? ` | Search: "${input.scope.search}"` : ""),
  );
  row++;

  const kpis = computeExclusivityKpis(input.rows, input.aggregationMode);
  const carrierShare = aggregateCarrierExclusivity(input.rows, input.aggregationMode);

  styleHeaderRow(ws.getRow(row));
  ws.getRow(row).values = ["Executive Summary KPIs", "", "", "", ""];
  row++;
  const kpiRows: [string, string][] = [
    ["Total MNOs / Custs in Scope", String(kpis.totalMnos)],
    ["Total Exclusive MNOs", `${kpis.totalExclusiveMnos}  (${kpis.exclusivityRatePct.toFixed(1)}% of scope)`],
    ["Exclusivity Rate %", `${kpis.exclusivityRatePct.toFixed(1)}%`],
    ["Top Dominant Carrier", kpis.topDominantCarrier ? `${kpis.topDominantCarrier} — ${kpis.topDominantCarrierCount} exclusive MNO/Custs` : "No exclusive accounts in scope"],
  ];
  for (const [label, value] of kpiRows) {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = { bold: true };
    ws.getCell(row, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(REPORT_COLORS.softGray) } };
    ws.mergeCells(row, 2, row, 5);
    ws.getCell(row, 2).value = value;
    ws.getCell(row, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(REPORT_COLORS.softGray) } };
    row++;
  }
  row++;

  const tableHeaderRow = ws.getRow(row);
  tableHeaderRow.values = ["Wholesale Carrier", "Exclusive MNOs", "% of Exclusive Assignments", "SCCP-Solo", "DSX-Solo"];
  styleHeaderRow(tableHeaderRow);
  row++;
  const carrierStartRow = row;
  if (carrierShare.length === 0) {
    ws.getCell(row, 1).value = "No exclusive service assignments in the current filter scope.";
    ws.getCell(row, 1).font = { italic: true, color: { argb: argb(REPORT_COLORS.textSecondary) } };
    row++;
  }
  for (const c of carrierShare) {
    ws.getRow(row).values = [c.providerName, c.exclusiveMnoCount, `${c.pctOfExclusiveAssignments.toFixed(1)}%`, c.sccpExclusiveCount, c.dsxExclusiveCount];
    row++;
  }
  if (carrierShare.length > 0) {
    const dataBarRule = {
      type: "dataBar",
      priority: 1,
      minLength: 0,
      maxLength: 100,
      gradient: false,
      border: false,
      color: { argb: argb(REPORT_COLORS.navy) },
      cfvo: [{ type: "autoMin" }, { type: "autoMax" }],
    } as unknown as DataBarRuleType;
    ws.addConditionalFormatting({ ref: `B${carrierStartRow}:B${row - 1}`, rules: [dataBarRule] });
  }
}

function buildRosterSheet(wb: Workbook, input: ExclusivityReportInput) {
  const ws = wb.addWorksheet("MNO Exclusivity Roster", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "MNO / Customer", key: "operatorName", width: 26 },
    { header: "TADIG", key: "tadigCode", width: 10 },
    { header: "Country", key: "country", width: 20 },
    { header: "Region", key: "region", width: 14 },
    { header: "SCCP Provider", key: "sccpProvider", width: 22 },
    { header: "DSX Provider", key: "dsxProvider", width: 22 },
    { header: "IPX Provider", key: "ipxProvider", width: 22 },
    { header: "Exclusivity", key: "exclusivityStatus", width: 16 },
  ];
  styleHeaderRow(ws.getRow(1));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 8 } };

  const roster = toRosterRows(input.rows);
  for (const r of roster) {
    const excelRow = ws.addRow(r);
    const statusCell = excelRow.getCell("exclusivityStatus");
    const isSingle = r.exclusivityStatus === "Single Provider";
    statusCell.font = { bold: true, color: { argb: argb(isSingle ? REPORT_COLORS.white : REPORT_COLORS.navy) } };
    statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(isSingle ? REPORT_COLORS.success : REPORT_COLORS.softGray) } };
    statusCell.alignment = { horizontal: "center" };
  }

  for (let i = 2; i <= ws.rowCount; i++) {
    if (i % 2 === 0) continue;
    ws.getRow(i).eachCell((cell) => {
      if (!cell.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(REPORT_COLORS.softGray) } };
    });
  }

  ws.getRow(ws.rowCount + 2).getCell(1).value =
    "Notice: Exported from CCIP for intelligence analysis. Sourced from declared IR.21 & Reach List archives without operational warranty.";
}

export async function generateExclusivityExcelReport(input: ExclusivityReportInput): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "CCIP — Connectivity Coverage Intelligence Platform";
  wb.created = input.generatedAt;

  buildMarketShareSheet(wb, input);
  buildRosterSheet(wb, input);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  triggerBrowserDownload(blob, `${exclusivityReportFileBaseName()}.xlsx`);
}
