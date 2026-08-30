import { PDFParse } from "pdf-parse";
import type { ServiceFamily } from "./reachlist-excel-flexible.util";

export interface PdfParsedRow {
  tadig: string;
  country: string;
  services: ServiceFamily[];
}

export interface PdfParseResult {
  rows: PdfParsedRow[];
  // Lines that clearly belong to the table (tab-structured, row-number
  // prefixed) but carried a non-standard placeholder code instead of a
  // real 5-character TADIG (e.g. "GBR_A", "CYP_3") — these operators
  // aren't safely resolvable without a real TADIG, so they're surfaced
  // for manual review rather than guessed at.
  skippedNonStandardCodeLines: number;
}

const TADIG_TOKEN = /^[A-Z0-9]{5}$/;

/** Parses the Comfone-style "IPX Service Customer List" PDF export: a
 * plain-text table, one operator per line, tab-separated fields —
 * `# \t TADIG CompanyName \t Country \t MCC \t MNC \t <service tokens>`.
 * Validated by hand against a real export before being wired in — see the
 * README-equivalent note in reachlist-zip-batch.service.ts. Not a general
 * PDF-table parser: pdf-parse's own table detection (`getTable()`) finds
 * nothing in this document (no ruled borders), so this reads the raw text
 * stream and reconstructs rows from Comfone's specific tab layout — a
 * differently-formatted vendor PDF would need its own parser, not this
 * one silently guessing at an unfamiliar layout. */
export async function parseComfonePdf(buffer: Buffer): Promise<PdfParseResult> {
  const parser = new PDFParse({ data: buffer });
  let text: string;
  try {
    const result = await parser.getText();
    text = result.text;
  } finally {
    await parser.destroy();
  }

  const rows: PdfParsedRow[] = [];
  let skippedNonStandardCodeLines = 0;

  for (const line of text.split(/\r?\n/)) {
    if (!line.includes("\t")) continue;
    // "<row#> <CODE> <Company Name>\t<Country>\t..." — the code and
    // company name are space-separated, everything after is tab-separated.
    const m = line.match(/^\s*\d*\s*([A-Za-z0-9_]{4,7})\s+([A-Za-z(].+?)\t(.+)/);
    if (!m) continue;
    const [, code, , rest] = m;
    const tadig = code.toUpperCase();
    if (!TADIG_TOKEN.test(tadig)) {
      skippedNonStandardCodeLines++;
      continue;
    }
    const fields = rest.split("\t").map((f) => f.trim());
    const country = fields[0] ?? "";
    if (!country) continue;

    const services: ServiceFamily[] = [];
    if (/\bSS7\b/.test(line)) services.push("SCCP");
    if (/\bS6a\b/.test(line)) services.push("DSX");
    if (/\bGRX\b/.test(line)) services.push("IPX");
    if (services.length === 0) continue;

    rows.push({ tadig, country, services });
  }

  return { rows, skippedNonStandardCodeLines };
}
