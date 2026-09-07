import type { DataBarRuleType, Row, Workbook } from "exceljs";
import { REPORT_COLORS, triggerBrowserDownload } from "./misReportData";
import {
  ProviderReportInput,
  computeProviderReportKpis,
  providerReportFileBaseName,
  scopeLineFor,
  toProviderRosterRows,
} from "./providerReportData";

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

function buildExecutiveSummarySheet(wb: Workbook, input: ProviderReportInput) {
  const ws = wb.addWorksheet("Executive Summary", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 28 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }];

  styleTitleRow(ws.getRow(1), 5, ws.mergeCells.bind(ws), 1, "CCIP — Wholesale Provider Footprint & Reach Benchmark Report");

  let row = 3;
  const metaLine = (label: string, value: string) => {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = { bold: true, color: { argb: argb(REPORT_COLORS.textSecondary) } };
    ws.mergeCells(row, 2, row, 5);
    ws.getCell(row, 2).value = value;
    row++;
  };
  metaLine("Generated (UTC)", input.generatedAt.toISOString().replace("T", " ").slice(0, 19));
  metaLine("Filter Scope", scopeLineFor(input));
  row++;

  const kpis = computeProviderReportKpis(input.rankedProviders);

  styleHeaderRow(ws.getRow(row));
  ws.getRow(row).values = ["Executive Summary KPIs", "", "", "", ""];
  row++;
  const kpiRows: [string, string][] = [
    ["Providers in Scope", String(kpis.totalProviders)],
    ["Total MNO Relationships", String(kpis.totalMnoRelationships)],
    ["Broadest Reach Provider", kpis.broadestReachProvider ? `${kpis.broadestReachProvider} — ${kpis.broadestReachCount} MNOs` : "-"],
    ["Tata Comm Standing", kpis.homeCarrierRank ? `Rank #${kpis.homeCarrierRank} of ${kpis.totalProviders} — ${kpis.homeCarrierMnoCount} MNOs covered` : "Not in scope"],
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
  tableHeaderRow.values = ["Rank", "Provider Name", "Total MNOs", "Countries", "Type"];
  styleHeaderRow(tableHeaderRow);
  row++;
  const rankingStartRow = row;
  const roster = toProviderRosterRows(input.rankedProviders);
  if (roster.length === 0) {
    ws.getCell(row, 1).value = "No providers in the current filter scope.";
    ws.getCell(row, 1).font = { italic: true, color: { argb: argb(REPORT_COLORS.textSecondary) } };
    row++;
  }
  for (const r of roster) {
    ws.getRow(row).values = [r.rank, r.providerName, r.totalMnos, r.totalCountries, r.providerType];
    row++;
  }
  if (roster.length > 0) {
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
    ws.addConditionalFormatting({ ref: `C${rankingStartRow}:C${row - 1}`, rules: [dataBarRule] });
  }
}

function buildProviderDirectorySheet(wb: Workbook, input: ProviderReportInput) {
  const ws = wb.addWorksheet("Provider Directory", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Rank", key: "rank", width: 8 },
    { header: "Provider Name", key: "providerName", width: 28 },
    { header: "Type", key: "providerType", width: 18 },
    { header: "Headquarters", key: "headquarters", width: 24 },
    { header: "Total MNOs", key: "totalMnos", width: 14 },
    { header: "Countries", key: "totalCountries", width: 12 },
    { header: "SCCP", key: "sccpCount", width: 10 },
    { header: "DSX", key: "dsxCount", width: 10 },
    { header: "IPX", key: "ipxCount", width: 10 },
  ];
  styleHeaderRow(ws.getRow(1));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 9 } };

  const roster = toProviderRosterRows(input.rankedProviders);
  for (const r of roster) {
    const excelRow = ws.addRow(r);
    if (r.providerName === "Tata Comm") {
      excelRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: argb(REPORT_COLORS.navy) } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(REPORT_COLORS.teal) } };
      });
    }
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

export async function generateProviderExcelReport(input: ProviderReportInput): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "CCIP — Connectivity Coverage Intelligence Platform";
  wb.created = input.generatedAt;

  buildExecutiveSummarySheet(wb, input);
  buildProviderDirectorySheet(wb, input);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  triggerBrowserDownload(blob, `${providerReportFileBaseName()}.xlsx`);
}
