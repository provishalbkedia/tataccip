import MsgReader from "@kenjiuno/msgreader";
import { normalizeCountryToIso3 } from "./country-normalize";
import { classifyAllServiceFamilies, type ServiceFamily } from "./reachlist-excel-flexible.util";

export interface MsgTadigRow {
  tadig: string;
  country: string;
  services: ServiceFamily[];
}

export interface MsgNameRow {
  operatorNameCandidate: string;
  services: ServiceFamily[];
}

export interface MsgParseResult {
  tadigRows: MsgTadigRow[];
  nameOnlyRows: MsgNameRow[];
  senderEmail: string | null;
  senderName: string | null;
  subject: string | null;
}

const TADIG_TOKEN = /^[A-Z0-9]{5}$/;
// A .msg body's TADIG-shaped tokens are mixed in with plain numeric MCC/
// MNC/IMSI-prefix figures that also happen to match 5 alphanumeric chars
// — a real TADIG always has at least one letter (3-letter country prefix
// at minimum), which a bare number never does.
function looksLikeTadig(token: string): boolean {
  return TADIG_TOKEN.test(token) && /[A-Z]/.test(token);
}

const SIGNOFF_MARKERS = /^(thanks|best regards|regards|kind regards|sincerely|cheers|dear|hello|hi\b)/i;
// Email envelope/quote-header lines ("From: LTE Request [x@y.com]", "Sent:
// 14.07.2026") can accidentally contain a service keyword (a sender's own
// display name, a quoted subject) — excluded from both heading detection
// and candidate collection so a quoted "From:" line never gets mistaken
// for a data section.
const EMAIL_HEADER_MARKER = /^(from|to|cc|bcc|sent|subject|date)\s*:/i;

/** Real reach-list emails carry no structural markup this library can see
 * (plain text only — no HTML body on the messages actually received),
 * so this is two independent heuristics rather than a real parser:
 *
 * 1. TADIG-anchored: scans line by line, tracking the most recently seen
 *    recognizable country name and service-family heading, and pairs
 *    every TADIG-shaped token found with whichever of each it last saw —
 *    handles a message that pastes a structured table as line-per-cell
 *    plain text (Outlook's HTML→plaintext conversion of a pasted table).
 * 2. Plain name list: under a line naming a service family (e.g. "IPX
 *    Carrier Name"), collects the short lines that follow as operator-name
 *    candidates until a blank run or a signoff — handles a message that's
 *    just prose plus a bullet list of partner names, with no codes at all.
 *
 * A message with neither (pure correspondence, no data — the common case
 * for a request that's still being clarified) yields two empty arrays;
 * the caller reports that plainly rather than treating it as a failure. */
export function parseReachlistMsg(buffer: Buffer): MsgParseResult {
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  const reader = new MsgReader(arrayBuffer);
  const fd = reader.getFileData();
  const body: string = fd.body ?? "";
  const lines = body.split(/\r?\n/).map((l: string) => l.trim());

  const tadigRows: MsgTadigRow[] = [];
  let lastCountry: string | null = null;
  let lastServices: ServiceFamily[] = [];

  for (const line of lines) {
    if (!line) continue;
    if (looksLikeTadig(line)) {
      if (lastCountry) tadigRows.push({ tadig: line, country: lastCountry, services: lastServices.length > 0 ? lastServices : [] });
      continue;
    }
    // Only trust this as "the current country" if it actually resolved to
    // a real code — normalizeCountryToIso3 falls back to the uppercased
    // input verbatim for anything unrecognized (e.g. "Live", "ITU"), so a
    // genuine match is always a case where the output differs from the
    // input, not just a coincidental pass-through.
    const iso3 = normalizeCountryToIso3(line);
    if (iso3 && iso3 !== line.trim().toUpperCase()) {
      lastCountry = line;
      continue;
    }
    const families = classifyAllServiceFamilies(line);
    if (families.length > 0 && line.split(/\s+/).length <= 4) {
      lastServices = families;
    }
  }

  // Strategy 2: a heading line naming a service, followed by a run of
  // short plain-text lines (no codes, no obvious structure) — a bullet
  // list of partner names pasted straight into the email body.
  const nameOnlyRows: MsgNameRow[] = [];
  if (tadigRows.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || EMAIL_HEADER_MARKER.test(line) || line.includes("@")) continue;
      const families = classifyAllServiceFamilies(line);
      if (families.length === 0 || line.split(/\s+/).length > 5) continue;
      // Found a heading like "IPX Carrier Name" — collect what follows.
      let j = i + 1;
      let blanks = 0;
      while (j < lines.length && blanks < 2) {
        const candidate = lines[j];
        j++;
        if (!candidate) { blanks++; continue; }
        blanks = 0;
        if (SIGNOFF_MARKERS.test(candidate) || EMAIL_HEADER_MARKER.test(candidate) || candidate.includes("@") || candidate.length > 60) break;
        if (looksLikeTadig(candidate)) continue;
        nameOnlyRows.push({ operatorNameCandidate: candidate, services: families });
      }
    }
  }

  return {
    tadigRows,
    nameOnlyRows,
    senderEmail: fd.senderEmail ?? fd.senderSmtpAddress ?? null,
    senderName: fd.senderName ?? null,
    subject: fd.subject ?? null,
  };
}
