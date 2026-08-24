import JSZip from "jszip";

// Cloud Run enforces a hard 32 MiB request-body cap for HTTP/1.1 (which is
// what this API runs as — see Dockerfile notes). 25MB per batch leaves
// comfortable headroom for multipart overhead while still packing a lot of
// files per request.
const MAX_BATCH_BYTES = 25 * 1024 * 1024;

// Mirrors the server's TADIG-from-filename heuristics (ir21-xml-parser
// .service.ts's tadigFromFilename / upload.service.ts's matchPdfForTadig) —
// doesn't need to be byte-identical, just consistent enough to keep an
// XML and its paired PDF together across the split. The server only pairs
// XML+PDF within a single upload request, so splitting a pair across two
// batches would silently lose the PDF pairing.
const TADIG_PATTERNS = [/IR21_([A-Z0-9]{5})_/i, /([A-Z0-9]{5})/i];

function tadigFromFilename(name: string): string | null {
  for (const re of TADIG_PATTERNS) {
    const m = name.match(re);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

type Item = { name: string; data: Blob; size: number };

async function readEntries(zip: JSZip): Promise<{ xmlEntries: Item[]; pdfEntries: Item[] }> {
  const xmlEntries: Item[] = [];
  const pdfEntries: Item[] = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const lower = entry.name.toLowerCase();
    if (!lower.endsWith(".xml") && !lower.endsWith(".pdf")) continue;
    const data = await entry.async("blob");
    const item: Item = { name: entry.name, data, size: data.size };
    (lower.endsWith(".xml") ? xmlEntries : pdfEntries).push(item);
  }
  return { xmlEntries, pdfEntries };
}

/** Repacks one large ZIP (XML + paired PDFs) into several smaller ZIPs,
 * each under MAX_BATCH_BYTES, keeping every XML with its matched PDF in
 * the same batch. Bin-packs by size (first-fit) rather than splitting
 * evenly by count, so batches with more/larger PDFs still stay under the
 * cap. A single XML+PDF pair larger than MAX_BATCH_BYTES on its own can't
 * be split further and ships as an over-size batch of one — rare for real
 * GSMA documents, but nothing smaller is possible without breaking the
 * file. */
export async function splitZipForUpload(file: File): Promise<Blob[]> {
  const zip = await JSZip.loadAsync(file);
  const { xmlEntries, pdfEntries } = await readEntries(zip);

  const usedPdfNames = new Set<string>();
  const groups: Item[][] = xmlEntries.map((xml) => {
    const tadig = tadigFromFilename(xml.name);
    const pdf = tadig
      ? pdfEntries.find((p) => !usedPdfNames.has(p.name) && p.name.toUpperCase().includes(tadig))
      : undefined;
    if (pdf) usedPdfNames.add(pdf.name);
    return pdf ? [xml, pdf] : [xml];
  });
  for (const pdf of pdfEntries) {
    if (!usedPdfNames.has(pdf.name)) groups.push([pdf]);
  }

  const batches: Item[][] = [];
  let current: Item[] = [];
  let currentSize = 0;
  for (const group of groups) {
    const groupSize = group.reduce((s, i) => s + i.size, 0);
    if (current.length > 0 && currentSize + groupSize > MAX_BATCH_BYTES) {
      batches.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(...group);
    currentSize += groupSize;
  }
  if (current.length > 0) batches.push(current);

  return Promise.all(
    batches.map(async (items) => {
      const out = new JSZip();
      for (const item of items) out.file(item.name, item.data);
      return out.generateAsync({ type: "blob", compression: "DEFLATE" });
    }),
  );
}
