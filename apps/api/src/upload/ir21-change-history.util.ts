/** One historical routing event recovered from an IR.21 XML's own
 * free-text <ChangeHistoryItem><Description>, e.g. "Removed BICS as SCCP
 * carrier and add TATA w.e.f 21st December 2022" -> { oldName: "BICS",
 * newName: "TATA" }. Either side may be null (a pure addition or a pure
 * removal); both are only ever null when interpretChangeHistoryDescription
 * itself returns null (nothing recognizable to extract). */
export interface InterpretedChangeHistoryEvent {
  oldName: string | null;
  newName: string | null;
}

/** Rejects a captured candidate that isn't plausibly a carrier brand name:
 * contains a digit (IP addresses, dates, point codes routinely appear in
 * these free-text logs and must never be mistaken for a provider), is
 * absurdly long/short, or contains one of the generic filler words that
 * show up when a regex over-captures into the next clause of the sentence
 * (e.g. "and update IPX details" following a genuine "Add new IPX
 * provider"). Real provider names (TATA, BICS, Orange, Syniverse, PCCW,
 * ...) are short, plain brand tokens and never contain these words. */
function clean(candidate: string | undefined): string | null {
  if (!candidate) return null;
  const trimmed = candidate.trim().replace(/^[("']+|[)."']+$/g, "").trim();
  if (!trimmed) return null;
  if (/\d/.test(trimmed)) return null;
  if (trimmed.length > 40 || trimmed.length < 2) return null;
  const genericWords =
    /\b(and|update|updated|details|the|provider|providers|carrier|carriers|interconnection|realm|network|new|section|list|to|for|of|information|profile|profiles|address|addresses|ip|ips|gw|gateway)\b/i;
  if (genericWords.test(trimmed)) return null;
  return trimmed;
}

/** Interprets a GSMA IR.21 <ChangeHistoryItem><Description> free-text
 * string into an old/new carrier name pair, or null when the entry doesn't
 * describe a provider addition/removal at all (the large majority of real
 * entries are administrative notes -- "ASN update", "No Change", "DNS
 * server IP addresses", IP/point-code corrections -- and must be left
 * alone). Deliberately conservative: every pattern here was built and
 * verified against the full real ChangeHistory log of a production IR.21
 * file (Dialog Axiata / LKADG, 60+ entries spanning 2013-2026) rather than
 * guessed at, and a caller is still expected to resolve the returned
 * name(s) against the real ProviderMaster/alias table before trusting them
 * -- an unresolvable candidate (typos, retired brand names, non-provider
 * text this regex set didn't anticipate) is exactly what that resolution
 * step exists to filter out. */
export function interpretChangeHistoryDescription(descriptionRaw: string): InterpretedChangeHistoryEvent | null {
  const s = descriptionRaw.trim().replace(/\s+/g, " ");

  // "Removed X [as ... carrier] and add Y [w.e.f ...]"
  let m = s.match(/^remov(?:e|ed)\s+(.+?)(?:\s+as\s+.+?)?\s+and\s+add\s+(.+?)(?:\s+w\.?e\.?f\.?\s.*)?$/i);
  if (m) {
    const oldName = clean(m[1]);
    const newName = clean(m[2]);
    if (oldName || newName) return { oldName, newName };
  }

  // "Add [new] [IPX provider] (X) and Removed Y"
  m = s.match(/^add\s+(?:new\s+)?(?:ipx\s+provider\s*)?\(?([^()]+?)\)?\s+and\s+remov(?:e|ed)\s+(.+)$/i);
  if (m) {
    const newName = clean(m[1]);
    const oldName = clean(m[2]);
    if (oldName || newName) return { oldName, newName };
  }

  // "<Section label> - Remove ... - NAME" / "<Section label> - Add ... - NAME"
  const dashParts = s.split(/\s+-\s+/);
  if (dashParts.length >= 2) {
    const last = dashParts[dashParts.length - 1];
    const middleJoined = dashParts.slice(0, -1).join(" ");
    const hasRemove = /\bremov(?:e|ed)\b/i.test(middleJoined);
    const hasAdd = /\badd\b/i.test(middleJoined);
    if (hasRemove && !hasAdd) {
      const oldName = clean(last);
      if (oldName) return { oldName, newName: null };
    }
    if (hasAdd && !hasRemove) {
      const newName = clean(last);
      if (newName) return { oldName: null, newName };
    }
  }

  // "Removed ... (NAME)"
  m = s.match(/^remov(?:e|ed)\s+.*?\(([^()]+)\)\s*$/i);
  if (m) {
    const oldName = clean(m[1]);
    if (oldName) return { oldName, newName: null };
  }

  // "Add ... (NAME)"
  m = s.match(/^add\s+.*?\(([^()]+)\)\s*$/i);
  if (m) {
    const newName = clean(m[1]);
    if (newName) return { oldName: null, newName };
  }

  // "Removed NAME IPX[ connectivity]" / "Removed NAME as X carrier"
  m = s.match(/^remov(?:e|ed)\s+([A-Za-z][\w .&-]*?)\s+(?:ipx(?:\s+connectivity)?|as\s+\S+\s+carrier)\s*$/i);
  if (m) {
    const oldName = clean(m[1]);
    if (oldName) return { oldName, newName: null };
  }

  // "Add [new] SCCP carrier NAME" / "Add IPX provider NAME"
  m = s.match(/^add\s+(?:new\s+)?(?:sccp\s+carrier|ipx\s+provider)\s+([A-Za-z][\w .&-]*)$/i);
  if (m) {
    const newName = clean(m[1]);
    if (newName) return { oldName: null, newName };
  }
  // "Add NAME IPX[ Realm]"
  m = s.match(/^add\s+([A-Za-z][\w .&-]*?)\s+ipx(?:\s+realm)?\s*$/i);
  if (m) {
    const newName = clean(m[1]);
    if (newName) return { oldName: null, newName };
  }

  return null;
}
