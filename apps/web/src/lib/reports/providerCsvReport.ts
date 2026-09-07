import { ProviderReportInput, providerReportFileBaseName, toProviderRosterRows } from "./providerReportData";
import { triggerBrowserDownload } from "./misReportData";

const HEADERS = ["Rank", "Provider Name", "Type", "Headquarters", "Total MNOs", "Countries", "SCCP", "DSX", "IPX"];

/** One field, CSV-quoted only when it actually needs it (contains a comma,
 * quote, or newline) -- keeps the common case readable in a plain-text
 * diff/preview instead of quoting every cell unconditionally. */
function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Raw, unformatted export of exactly the ranked provider list currently on
 * screen -- for data pipelines and spreadsheet power users, not a
 * presentation document. No dynamic import needed here (unlike the PDF/
 * Excel generators): this is plain string-building, so there's no heavy
 * library to code-split out of the initial bundle. */
export function generateProviderCsvExport(input: ProviderReportInput): void {
  const roster = toProviderRosterRows(input.rankedProviders);
  const lines = [
    HEADERS.join(","),
    ...roster.map((r) =>
      [
        String(r.rank),
        r.providerName,
        r.providerType,
        r.headquarters,
        String(r.totalMnos),
        String(r.totalCountries),
        String(r.sccpCount),
        String(r.dsxCount),
        String(r.ipxCount),
      ]
        .map(csvField)
        .join(","),
    ),
  ];
  lines.push("");
  lines.push(
    csvField(
      "Notice: Exported from CCIP for intelligence analysis. Sourced from declared IR.21 & Reach List archives without operational warranty.",
    ),
  );
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  triggerBrowserDownload(blob, `${providerReportFileBaseName()}.csv`);
}
