import type { Workbook, Row } from "exceljs";
import { REPORT_COLORS, triggerBrowserDownload } from "./misReportData";
import type { PivotProviderEntry } from "./pivotData";

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

function styleTitleRow(wsRow: Row, span: number, wsMerge: (r1: number, c1: number, r2: number, c2: number) => void, row: number, text: string) {
  wsMerge(row, 1, row, span);
  const cell = wsRow.getCell(1);
  cell.value = text;
  cell.font = { size: 16, bold: true, color: { argb: argb(REPORT_COLORS.white) } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(REPORT_COLORS.navy) } };
  cell.alignment = { vertical: "middle", horizontal: "left" };
  wsRow.height = 30;
}

function styleHeaderRow(row: Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: argb(REPORT_COLORS.white) } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(REPORT_COLORS.navy) } };
    cell.alignment = { vertical: "middle" };
  });
}

const TREND_COLOR: Record<PivotProviderEntry["trend"], string> = {
  "Capturing Market": REPORT_COLORS.success,
  Defending: REPORT_COLORS.textSecondary,
  "Losing Share": REPORT_COLORS.danger,
};

export interface PivotExcelInput {
  generatedAt: Date;
  scopeLabel: string;
  pivotData: PivotProviderEntry[];
}

function fileBaseName(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `CCIP_Market_Share_Pivot_${yyyy}${mm}${dd}`;
}

function buildSummarySheet(wb: Workbook, input: PivotExcelInput) {
  const ws = wb.addWorksheet("Executive Pivot Summary", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 30 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 20 }, { width: 20 }];

  styleTitleRow(ws.getRow(1), 6, ws.mergeCells.bind(ws), 1, "CCIP — Wholesale Carrier Market Capture & Churn Pivot");

  let row = 3;
  ws.getCell(row, 1).value = "Scope";
  ws.getCell(row, 1).font = { bold: true, color: { argb: argb(REPORT_COLORS.textSecondary) } };
  ws.mergeCells(row, 2, row, 6);
  ws.getCell(row, 2).value = input.scopeLabel;
  row++;
  ws.getCell(row, 1).value = "Generated (UTC)";
  ws.getCell(row, 1).font = { bold: true, color: { argb: argb(REPORT_COLORS.textSecondary) } };
  ws.mergeCells(row, 2, row, 6);
  ws.getCell(row, 2).value = input.generatedAt.toISOString().replace("T", " ").slice(0, 19);
  row += 2;

  const headerRow = ws.getRow(row);
  headerRow.values = ["Wholesale Provider", "Net Movement", "Service Gains (+)", "Service Losses (-)", "Impacted MNOs / Custs", "Market Share Trend"];
  styleHeaderRow(headerRow);
  row++;

  if (input.pivotData.length === 0) {
    ws.getCell(row, 1).value = "No carrier gain/loss events in the current filter scope.";
    ws.getCell(row, 1).font = { italic: true, color: { argb: argb(REPORT_COLORS.textSecondary) } };
  }

  for (const p of input.pivotData) {
    const r = ws.getRow(row);
    r.values = [p.providerName, p.net, p.gains, p.losses, p.impactedMnoCount, p.trend];
    const netCell = r.getCell(2);
    netCell.font = { bold: true, color: { argb: argb(p.net >= 0 ? REPORT_COLORS.success : REPORT_COLORS.danger) } };
    const trendCell = r.getCell(6);
    trendCell.font = { bold: true, color: { argb: argb(TREND_COLOR[p.trend]) } };
    row++;
  }
}

function buildMigrationsSheet(wb: Workbook, input: PivotExcelInput) {
  const ws = wb.addWorksheet("Detailed MNO Migrations", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Wholesale Provider", key: "provider", width: 26 },
    { header: "MNO / Customer", key: "mno", width: 26 },
    { header: "TADIG", key: "tadig", width: 10 },
    { header: "Country", key: "country", width: 20 },
    { header: "Service", key: "service", width: 10 },
    { header: "Action", key: "action", width: 14 },
    { header: "Displaced / Competing Carrier", key: "detail", width: 32 },
  ];
  styleHeaderRow(ws.getRow(1));

  const allEntries = input.pivotData.flatMap((p) =>
    p.migrations.map((m) => ({
      date: new Date(m.date).toISOString().slice(0, 10),
      provider: p.providerName,
      mno: m.mnoName,
      tadig: m.tadigCode,
      country: m.country,
      service: m.service,
      action: m.actionLabel,
      detail: m.detail,
      isGain: m.isGain,
    })),
  );
  allEntries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  for (const entry of allEntries) {
    const excelRow = ws.addRow(entry);
    const actionCell = excelRow.getCell("action");
    actionCell.font = { bold: true, color: { argb: argb(REPORT_COLORS.white) } };
    actionCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(entry.isGain ? REPORT_COLORS.success : REPORT_COLORS.danger) } };
    actionCell.alignment = { horizontal: "center" };
  }

  for (let i = 2; i <= ws.rowCount; i++) {
    if (i % 2 === 0) continue;
    ws.getRow(i).eachCell((cell) => {
      if (!cell.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(REPORT_COLORS.softGray) } };
    });
  }
}

export async function generatePivotExcelReport(input: PivotExcelInput): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "CCIP — Connectivity Coverage Intelligence Platform";
  wb.created = input.generatedAt;

  buildSummarySheet(wb, input);
  buildMigrationsSheet(wb, input);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  triggerBrowserDownload(blob, `${fileBaseName()}.xlsx`);
}
