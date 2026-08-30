import * as ExcelJS from "exceljs";
import * as XLSX from "xlsx";

// A "flexible" reader for the single-provider reach list files real
// carriers actually send — one file per provider, filename-identified,
// with wildly inconsistent header position, column naming, and per-row
// service indication (a marker column per service, a single value column,
// or none at all — see PROVIDER-per-file inference and SERVICE fallback
// below). Validated by hand against 22 real files spanning every shape
// found in production reach-list submissions before being wired in here —
// see this module's row-extraction logic for the specific quirks each
// branch exists to handle.

export type ServiceFamily = "SCCP" | "DSX" | "IPX";

export interface FlexibleExcelRow {
  country: string;
  operator: string;
  tadigs: string[]; // one row can carry more than one valid TADIG (e.g. "TADIG 1".."TADIG 26" columns)
  services: ServiceFamily[];
  // Raw text of a "Connection Type" / "Route Type" / "Direct/Peering"
  // style column, when the sheet has one — undefined when it doesn't
  // (several real carrier exports, e.g. Deutsche Telekom's, carry no such
  // column at all). Consumed by carrier-specific row filtering in
  // reachlist-zip-batch.service.ts, not by anything in this file.
  connectionType?: string;
}

export interface FlexibleExcelResult {
  headerFound: boolean;
  rows: FlexibleExcelRow[];
  usedFilenameServiceFallback: boolean;
  filenameFallbackFamilies: ServiceFamily[];
}

const COUNTRY_KW = ["country"];
const OPERATOR_KW = ["operator", "customer name", "commercial name", "provider name", "mno", "network name"];
const TADIG_KW = ["tadig"];
const MCC_KW = ["mcc"];
const MNC_KW = ["mnc"];

function normKey(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}
function tight(s: string): string {
  return normKey(s).replace(/\s+/g, "");
}

/** Priority-ordered — used for header text and per-row service *values*,
 * where picking the single most-specific family matters (e.g. "Customer
 * LTE Signaling" must resolve to DSX, not SCCP, despite containing
 * "signal"). */
export function classifyServiceFamily(text: string): ServiceFamily | null {
  const t = text.toLowerCase();
  if (/\b(lte|diameter|s6a|dsx)\b/.test(t)) return "DSX";
  if (/\b(grx|ipx|data\s*roaming|gp\/?s8|data)\b/.test(t)) return "IPX";
  if (/\b(ss7|sigtran|sccp|signal)/.test(t)) return "SCCP";
  return null;
}

/** All matching families, not just the most specific — for filename
 * fallback, where a title like "iBASIS 2G-3G-4G Signaling and Data reach
 * list" genuinely covers two services for every row and picking only one
 * would silently drop the other. */
export function classifyAllServiceFamilies(text: string): ServiceFamily[] {
  const t = text.toLowerCase();
  const out: ServiceFamily[] = [];
  if (/\b(lte|diameter|s6a|dsx)\b/.test(t)) out.push("DSX");
  if (/\b(grx|ipx|data\s*roaming|gp\/?s8|data)\b/.test(t)) out.push("IPX");
  if (/\b(ss7|sigtran|sccp|signal)/.test(t)) out.push("SCCP");
  return out;
}

interface DetectedColumns {
  country: number;
  operator: number;
  tadig: number;
  extraTadigCols: number[];
  connectionType: number;
  presenceCols: { idx: number; family: ServiceFamily }[];
  valueCols: number[];
}

function headerScore(cells: string[]): number {
  let country = false, operator = false, tadig = false, mccMnc = false, service = false;
  for (const raw of cells) {
    const c = normKey(raw);
    const ct = tight(raw);
    if (!c) continue;
    const isTadig = TADIG_KW.some((k) => c.includes(k));
    if (COUNTRY_KW.some((k) => c.includes(k))) country = true;
    if (!isTadig && OPERATOR_KW.some((k) => c.includes(k) || ct.includes(k.replace(/\s+/g, "")))) operator = true;
    if (isTadig) tadig = true;
    if (MCC_KW.some((k) => c.includes(k)) || MNC_KW.some((k) => c.includes(k))) mccMnc = true;
    if (classifyServiceFamily(c) || c.includes("service") || c.includes("protocol")) service = true;
  }
  return (country ? 1 : 0) + (operator ? 1 : 0) + (tadig ? 1 : 0) + (mccMnc ? 1 : 0) + (service ? 1 : 0);
}

/** Real reach-list exports routinely bury the header several rows down
 * (title rows, contact blocks, merged "Confidential" banners) — scans up
 * to 40 rows and scores each as a header candidate rather than assuming
 * row 1. A score below 2 (needs at least two distinct roles — e.g.
 * country + operator, or tadig + service) means nothing in the sheet
 * looks like a real header, and the file is reported unparseable rather
 * than guessed at. */
function detectHeaderAndColumns(matrix: string[][]): { headerRowIdx: number; cols: DetectedColumns } | null {
  let best = { idx: -1, score: 0 };
  for (let r = 0; r < Math.min(40, matrix.length); r++) {
    const score = headerScore(matrix[r] ?? []);
    if (score > best.score) best = { idx: r, score };
  }
  if (best.score < 2) return null;

  const headerRow = matrix[best.idx];
  const cols: DetectedColumns = { country: -1, operator: -1, tadig: -1, extraTadigCols: [], connectionType: -1, presenceCols: [], valueCols: [] };
  const tadigCandidates: { idx: number; bare: boolean; numbered: boolean }[] = [];

  headerRow.forEach((raw, idx) => {
    const c = normKey(raw);
    const ct = tight(raw);
    if (!c) return;
    const isTadig = TADIG_KW.some((k) => c.includes(k));
    if (cols.country === -1 && COUNTRY_KW.some((k) => c.includes(k))) cols.country = idx;
    if (!isTadig && cols.operator === -1 && OPERATOR_KW.some((k) => c.includes(k) || ct.includes(k.replace(/\s+/g, "")))) {
      cols.operator = idx;
    }
    if (isTadig) tadigCandidates.push({ idx, bare: c.replace(/[^a-z]/g, "") === "tadig", numbered: /^tadig\s*\d+$/.test(c) });
    if (cols.connectionType === -1 && (c.includes("connection type") || c.includes("route type") || c.includes("direct/peering") || c.includes("direct / peering") || (c.includes("route") && c.length < 12))) {
      cols.connectionType = idx;
    }
    const fam = classifyServiceFamily(c);
    if (fam) cols.presenceCols.push({ idx, family: fam });
    else if (c.includes("service") || c.includes("protocol")) cols.valueCols.push(idx);
  });

  if (tadigCandidates.length > 0) {
    // "TADIG 1".."TADIG N" (seen in BICS's GRX export): one operator can
    // carry several valid TADIGs on one row — every one is a real record.
    const numbered = tadigCandidates.filter((t) => t.numbered);
    if (numbered.length > 1) {
      cols.tadig = numbered[0].idx;
      cols.extraTadigCols = numbered.slice(1).map((t) => t.idx);
    } else {
      const bare = tadigCandidates.find((t) => t.bare);
      cols.tadig = (bare ?? tadigCandidates[0]).idx;
    }
  }
  return { headerRowIdx: best.idx, cols };
}

function cellValueToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const obj = value as unknown as Record<string, unknown>;
    if (Array.isArray(obj.richText)) return (obj.richText as { text?: string }[]).map((s) => s.text ?? "").join("");
    if ("result" in obj) return String(obj.result ?? "");
    if ("text" in obj) return String(obj.text ?? "");
    return JSON.stringify(obj);
  }
  return String(value);
}

async function loadXlsxMatrix(buffer: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const matrix: string[][] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    let maxCol = 0;
    row.eachCell({ includeEmpty: false }, (_cell, col) => { maxCol = Math.max(maxCol, col); });
    const vals: string[] = [];
    for (let c = 1; c <= maxCol; c++) vals[c - 1] = cellValueToString(row.getCell(c).value);
    matrix.push(vals);
  }
  return matrix;
}

// Legacy binary .xls (pre-2007 OLE2 format) — ExcelJS only reads the
// zip-based .xlsx format and throws on this; SheetJS (the `xlsx` package)
// reads both, used here only for the legacy case to keep ExcelJS as the
// one true reader everywhere else in the app.
function loadXlsMatrix(buffer: Buffer): string[][] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "", raw: false });
  return rows.map((row) => (Array.isArray(row) ? row.map((c) => String(c ?? "")) : []));
}

const TADIG_TOKEN = /^[A-Z0-9]{5}$/;

/** Parses one single-provider Excel/xls file into normalized rows.
 * `filenameForFallback` supplies the service family when no column in the
 * sheet indicates it per-row (common — many real files are already scoped
 * to one service by their own filename and never say so again inside). */
export async function parseFlexibleExcel(buffer: Buffer, isXls: boolean, filenameForFallback: string): Promise<FlexibleExcelResult> {
  const matrix = isXls ? loadXlsMatrix(buffer) : await loadXlsxMatrix(buffer);
  const detected = detectHeaderAndColumns(matrix);
  if (!detected) {
    return { headerFound: false, rows: [], usedFilenameServiceFallback: false, filenameFallbackFamilies: [] };
  }
  const { headerRowIdx, cols } = detected;

  const rows: FlexibleExcelRow[] = [];
  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || row.every((c) => !c?.trim())) continue;

    const country = cols.country >= 0 ? (row[cols.country] ?? "").trim() : "";
    const operator = cols.operator >= 0 ? (row[cols.operator] ?? "").trim() : "";
    if (!country && !operator) continue;

    const tadigs: string[] = [];
    const primaryTadig = cols.tadig >= 0 ? (row[cols.tadig] ?? "").trim().toUpperCase() : "";
    if (TADIG_TOKEN.test(primaryTadig)) tadigs.push(primaryTadig);
    for (const idx of cols.extraTadigCols) {
      const t = (row[idx] ?? "").trim().toUpperCase();
      if (TADIG_TOKEN.test(t) && !tadigs.includes(t)) tadigs.push(t);
    }
    if (tadigs.length === 0 && !operator) continue; // nothing to key this row on at all

    const services = new Set<ServiceFamily>();
    for (const { idx, family } of cols.presenceCols) {
      if ((row[idx] ?? "").trim()) services.add(family);
    }
    for (const idx of cols.valueCols) {
      const fam = classifyServiceFamily(row[idx] ?? "");
      if (fam) services.add(fam);
    }

    const connectionType = cols.connectionType >= 0 ? (row[cols.connectionType] ?? "").trim() : undefined;
    rows.push({ country, operator, tadigs, services: [...services], connectionType: connectionType || undefined });
  }

  // No row anywhere in the file carried its own service signal — fall
  // back to the filename once, applied uniformly (may be more than one
  // family — see classifyAllServiceFamilies).
  const anyRowHasService = rows.some((r) => r.services.length > 0);
  let filenameFallbackFamilies: ServiceFamily[] = [];
  if (!anyRowHasService) {
    filenameFallbackFamilies = classifyAllServiceFamilies(filenameForFallback);
    if (filenameFallbackFamilies.length > 0) {
      for (const r of rows) r.services = filenameFallbackFamilies;
    }
  }

  return {
    headerFound: true,
    rows,
    usedFilenameServiceFallback: !anyRowHasService,
    filenameFallbackFamilies,
  };
}
