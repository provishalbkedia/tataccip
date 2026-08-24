// Legal-entity suffixes and generic filler words commonly seen appended to
// carrier names in vendor-supplied IR.21 XML exports (e.g. "Belgacom
// International Carrier Services SA" vs. "BICS"). Stripped before matching
// so aliasing only needs to cover the meaningful part of the name.
const LEGAL_SUFFIXES = new Set([
  "ltd", "limited", "inc", "incorporated", "llc", "plc", "gmbh", "corp",
  "corporation", "co", "company", "ag", "sa", "srl", "sarl", "bv", "nv",
  "pty", "pte", "the", "group", "holdings", "international", "global",
  "solutions", "services", "carrier", "carriers",
]);

/** Lowercase, strip punctuation, drop legal-entity/filler words, collapse
 * whitespace — e.g. "Belgacom International Carrier Services SA" -> "belgacom".
 * Diacritics are stripped to their base letter *before* the punctuation
 * strip (Unicode NFD decomposition splits "ó" into "o" + a combining accent
 * mark, which the punctuation regex below then discards). Without this,
 * "Telefónica" mangles into "telef nica" (the accent treated as punctuation
 * and replaced with a space) instead of matching "telefonica", silently
 * missing real duplicates. Shared by ProviderResolverService (ingestion-time
 * lookups) and the seed script (baseline alias data), so both always agree
 * on the same patterns. */
export function normalizeCarrierName(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !LEGAL_SUFFIXES.has(word));
  return cleaned.join(" ").trim();
}

// Placeholder text, protocol tokens, and other non-carrier strings — seen
// verbatim in both IR.21 XML free-text fields and Reach List Excel cells.
// Left unfiltered, each of these would otherwise resolve to nothing, miss
// the alias cache, and get auto-created as its own bogus ProviderMaster row
// (this is literally how "None"/"NA"/"Not applicable" ended up as real rows
// in production). Callers route a junk match to the "Others / Unassigned"
// system provider (see ProviderResolverService) rather than creating
// anything or silently dropping the data point.
const JUNK_PROVIDER_NAMES = new Set([
  "none", "na", "n a", "not applicable", "not available", "not declared",
  "unknown", "tbd", "3g", "3grx", "itu", "ansi",
]);

// Sentence-length protocol/boilerplate text rather than a carrier name —
// checked as substrings of the *normalized* string (already lowercased,
// punctuation stripped to spaces), so these patterns are written in that
// same plain-word form.
const JUNK_PHRASE_PATTERNS = [
  /^international sccp gateway/,
  /roaming with itu/,
  /for ansi conversion/,
  /for ansi networks/,
  /for itu networks/,
];

/** True if a *normalized* name is placeholder text, a protocol token, a
 * sentence-length boilerplate note, or a bare number/IP address — not a
 * real carrier name. Numbers and dotted IPs both reduce, after
 * normalization, to a name made entirely of all-digit words ("19440" stays
 * one word; "0.0.0.0" becomes four "0" words since normalizeCarrierName
 * turns "." into a space) — checking "every word is digits" catches both
 * without needing the pre-normalization raw string. */
export function isJunkProviderName(normalized: string): boolean {
  if (!normalized) return true;
  if (JUNK_PROVIDER_NAMES.has(normalized)) return true;
  if (JUNK_PHRASE_PATTERNS.some((re) => re.test(normalized))) return true;
  const words = normalized.split(" ");
  if (words.every((w) => /^\d+$/.test(w))) return true;
  return false;
}

// A raw string like "SCCP Carrier" or "IPX Carrier" loses its only
// distinguishing word here — "carrier" is a LEGAL_SUFFIXES filler word, so
// normalizeCarrierName reduces it to a bare "sccp"/"ipx"/"dsx"/"grx" with no
// brand content left at all. That residual isn't junk (it's exactly the
// kind of placeholder ProviderResolverService.resolve() should still queue
// for admin review — see ProviderOverrideService/"Map Per Operator"), but it
// must never be treated as if it identified a real provider: fuzzy-matching
// a bare service-type word against the alias cache would match ANY alias
// that happens to contain it as a qualifier word (e.g. "belgacom sccp"),
// silently misattributing every MNO using this placeholder to whichever
// provider's alias happens to iterate first.
const GENERIC_SERVICE_TOKENS = new Set(["sccp", "dsx", "ipx", "grx"]);

export function isGenericServiceToken(normalized: string): boolean {
  return GENERIC_SERVICE_TOKENS.has(normalized);
}

// Words that mark a parenthetical as descriptive annotation ("(for selected
// operators only)", "(ANSI - new)", "(former Telia Carrier)") rather than an
// alternate name for the carrier — such parens get stripped outright instead
// of being split out as if they were a second provider.
const PAREN_ANNOTATION_WORDS = new Set([
  "for", "only", "selected", "operators", "new", "old", "former", "current",
  "ansi", "etsi", "itu", "sccp", "ipx", "grx", "asn", "effective", "main",
  "first", "second", "primary", "backup", "secondary",
]);

// A parenthetical containing a comma is almost always a descriptive note
// ("Effective from 22 March, 2021"), not "name, name" — a real second
// carrier name in parens virtually never has an internal comma. Splitting
// it further would fragment the note into garbage ("2021", "22 March").
function isAnnotationParen(content: string): boolean {
  if (content.includes(",")) return true;
  if (/\b\d{4}\b/.test(content)) return true; // years read as annotation, not a name
  const words = content.toLowerCase().split(/[\s/]+/).filter(Boolean);
  return words.some((w) => PAREN_ANNOTATION_WORDS.has(w));
}

// US-style company names routinely put the corporate suffix after a comma
// ("Syniverse Technologies, Inc", "Transaction Network Services, Inc.") —
// a bare word from this set immediately after a split point gets rejoined
// to the token before it instead of standing alone as a bogus "provider".
const BARE_SUFFIX_WORDS = new Set([
  "inc", "incorporated", "ltd", "limited", "llc", "plc", "gmbh", "corp",
  "corporation", "co", "sa", "ag", "srl", "sarl", "bv", "nv", "pty", "pte",
  "slu", "s.l.u", "sl",
]);

/** Some source data (both IR.21 XML free-text fields and reach-list Excel
 * cells) lists more than one carrier in a single string — e.g.
 * "Arelion, CMI, BBIS", "A1 Telekom Austria - primary provider", or
 * "Belgacom (BICS)" (a name/brand pair for the *same* carrier, which is
 * harmless to split since both halves resolve to the same canonical
 * provider via aliasing anyway). Splits on comma/semicolon/slash, " and "/
 * " & " as whole words (so "AT&T" and similar fused names are left alone),
 * strips role qualifiers like "- primary provider"/"backup carrier", and
 * treats parenthetical content as a second name candidate UNLESS it looks
 * like descriptive annotation ("(for selected operators only)", "(ANSI -
 * new)") rather than an alias — those get stripped, not split out. Every
 * resulting token still needs to go through provider resolution
 * individually — this only prevents composite strings from ever reaching
 * ProviderMaster as one row. Real-world source data is messy enough that
 * this is a best-effort heuristic, not a guarantee — see
 * scripts/cleanup-provider-master.ts's dry-run report for cases worth a
 * human look before trusting the automated split. */
export function splitCompositeProviderNames(raw: string): string[] {
  const cleaned = raw
    .replace(/\bn\s*\/\s*a\b/gi, " ") // "N/A" would otherwise slash-split into bogus "N" and "A" tokens
    .replace(/\/?\s*for\s+(ansi|itu)\s+conversion\b/gi, "") // recurring GSMA-format-conversion annotation, not a carrier name
    .replace(/[[(]([^\])]*)[\])]/g, (_match, content: string) => (isAnnotationParen(content) ? " " : `, ${content},`))
    .replace(/\*/g, "")
    .replace(/[-–—]\s*(primary|backup|secondary|main|first|second|load\s*sharing)\s*(provider|carrier)?/gi, "")
    .replace(/\b(primary|backup|secondary|main|first|second)\s+(provider|carrier)\b/gi, "")
    .replace(/\s+&\s+/g, ",")
    .replace(/\s+and\s+/gi, ",");

  const rawTokens = cleaned
    .split(/[,;/]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const tokens: string[] = [];
  for (const tok of rawTokens) {
    const bare = tok.replace(/\.+$/, "").toLowerCase();
    if (tokens.length > 0 && BARE_SUFFIX_WORDS.has(bare)) {
      tokens[tokens.length - 1] = `${tokens[tokens.length - 1]}, ${tok}`;
    } else {
      tokens.push(tok);
    }
  }
  return tokens;
}

/** Guards ProviderResolverService/cleanup scripts' fuzzy matching against
 * both false positives and false negatives. Matches on whole *words*, not
 * raw characters — "na" (as its own word) matching inside "telecom
 * personal" would be a raw-character false positive ("persoNAl" contains
 * "na") but never happens here since "na" isn't one of "personal"'s words.
 * Conversely "china mobile" correctly matches inside "china mobile
 * international limited" as a contiguous word sequence, which a
 * length-ratio check would reject even though it's a legitimate short-
 * brand-name-vs-long-official-name match. Exact matches always pass
 * regardless of length (deliberate, curated aliases can be short); fuzzy
 * word-sequence matches require the shorter side to be at least 4
 * characters, so stray short tokens don't match too eagerly. */
export function isConfidentSubstringMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length < 4) return false;

  const shortWords = shorter.split(" ").filter(Boolean);
  const longWords = longer.split(" ").filter(Boolean);
  if (shortWords.length === 0 || shortWords.length > longWords.length) return false;

  for (let i = 0; i + shortWords.length <= longWords.length; i++) {
    if (longWords.slice(i, i + shortWords.length).join(" ") === shorter) return true;
  }
  return false;
}
