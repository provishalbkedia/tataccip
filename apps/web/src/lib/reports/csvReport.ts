import { Ir21RoutingChangeRow } from "@ccip/shared-types";
import { reportFileBaseName, toLedgerRows, triggerBrowserDownload } from "./misReportData";

const LEDGER_HEADERS = [
  "Effective Date",
  "Region",
  "Country",
  "MNO / Customer",
  "TADIG",
  "Service",
  "Change Action",
  "Carrier Movement Detail",
  "Source",
];

/** One field, CSV-quoted only when it actually needs it (contains a comma,
 * quote, or newline) -- keeps the common case readable in a plain-text
 * diff/preview instead of quoting every cell unconditionally. */
function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Raw, unformatted export of exactly the rows currently on screen -- for
 * data pipelines and spreadsheet power users, not a presentation document.
 * No dynamic imports needed here (unlike the PDF/Excel generators): this
 * is plain string-building, so there's no heavy library to code-split out
 * of the initial bundle. */
export function generateCsvExport(rows: Ir21RoutingChangeRow[]): void {
  const ledgerRows = toLedgerRows(rows);
  const lines = [
    LEDGER_HEADERS.join(","),
    ...ledgerRows.map((r) =>
      [r.date, r.region, r.country, r.mnoName, r.tadigCode, r.service, r.changeLabel, r.detail, r.source].map(csvField).join(","),
    ),
  ];
  lines.push("");
  lines.push(
    csvField(
      "Notice: Exported from CCIP for intelligence analysis. Sourced from declared IR.21 & Reach List archives without operational warranty.",
    ),
  );
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  triggerBrowserDownload(blob, `${reportFileBaseName()}.csv`);
}
