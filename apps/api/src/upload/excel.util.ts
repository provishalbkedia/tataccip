import * as ExcelJS from "exceljs";

// Some source spreadsheets (seen in a Reach List export) carry HTML-escaped
// text in plain cells — "AT&amp;T Mobility" instead of "AT&T Mobility" —
// most likely from an upstream pipeline that rendered the data through HTML
// at some point without unescaping it before writing the sheet. Decoded
// here so every Excel-based ingestion path gets clean text, not just Reach
// List. `&amp;` must run last since decoding any other entity first can
// introduce a literal `&` that a subsequent `&amp;` pass would corrupt.
const HTML_ENTITIES: [RegExp, string][] = [
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&#39;|&apos;/g, "'"],
  [/&nbsp;/g, " "],
  [/&amp;/g, "&"],
];

// ExcelJS represents non-plain cells (formula, hyperlink, rich text) as
// objects rather than primitives, and none of them override toString() —
// so a bare String(cell.value) on any of them silently produces the
// literal text "[object Object]". Unwrap each shape to its actual text
// before falling through to String() for genuine primitives/dates.
function cellValueToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const obj = value as unknown as Record<string, unknown>;
    if (Array.isArray(obj.richText)) {
      return (obj.richText as { text?: string }[]).map((span) => span.text ?? "").join("");
    }
    if ("result" in obj) {
      return String(obj.result ?? "");
    }
    if ("text" in obj) {
      // Hyperlink cells: { text, hyperlink }.
      return String(obj.text ?? "");
    }
    return JSON.stringify(obj);
  }
  return String(value);
}

function decodeHtmlEntities(value: string): string {
  let out = value;
  for (const [pattern, replacement] of HTML_ENTITIES) {
    out = out.replace(pattern, replacement);
  }
  // Numeric entities (&#65; / &#x41;) — handled separately since their
  // replacement value depends on the matched digits.
  out = out.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return out;
}

/** Reads the first worksheet of a workbook buffer into row objects keyed by
 * normalized (trimmed, lowercased) header text, so column order/casing in
 * the uploaded file doesn't matter. */
export async function readFirstSheetAsRows(buffer: Buffer): Promise<Record<string, string>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return [];
  }

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = cellValueToString(cell.value).trim().toLowerCase();
  });

  const rows: Record<string, string>[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    if (row.cellCount === 0) continue;

    const obj: Record<string, string> = {};
    let hasValue = false;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (!header) return;
      const value = decodeHtmlEntities(cellValueToString(cell.value).trim());
      obj[header] = value;
      if (value) hasValue = true;
    });

    if (hasValue) {
      rows.push(obj);
    }
  }

  return rows;
}

export function col(row: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (row[key] !== undefined && row[key] !== "") {
      return row[key];
    }
  }
  return "";
}
