import * as ExcelJS from "exceljs";

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
    headers[colNumber] = String(cell.value ?? "").trim().toLowerCase();
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
      const value = cell.value == null ? "" : String(cell.value).trim();
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
