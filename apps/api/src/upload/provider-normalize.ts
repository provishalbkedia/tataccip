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
 * Shared by ProviderResolverService (ingestion-time lookups) and the seed
 * script (baseline alias data), so both always agree on the same patterns. */
export function normalizeCarrierName(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !LEGAL_SUFFIXES.has(word));
  return cleaned.join(" ").trim();
}

// Words that mark a parenthetical as descriptive annotation ("(for selected
// operators only)", "(ANSI - new)", "(former Telia Carrier)") rather than an
// alternate name for the carrier — such parens get stripped outright instead
// of being split out as if they were a second provider.
const PAREN_ANNOTATION_WORDS = new Set([
  "for", "only", "selected", "operators", "new", "old", "former", "current",
  "ansi", "etsi", "itu", "sccp", "ipx", "grx", "asn",
]);

function isAnnotationParen(content: string): boolean {
  const words = content.toLowerCase().split(/\s+/).filter(Boolean);
  return words.some((w) => PAREN_ANNOTATION_WORDS.has(w));
}

// US-style company names routinely put the corporate suffix after a comma
// ("Syniverse Technologies, Inc", "Transaction Network Services, Inc.") —
// a bare word from this set immediately after a split point gets rejoined
// to the token before it instead of standing alone as a bogus "provider".
const BARE_SUFFIX_WORDS = new Set([
  "inc", "incorporated", "ltd", "limited", "llc", "plc", "gmbh", "corp",
  "corporation", "co", "sa", "ag", "srl", "sarl", "bv", "nv", "pty", "pte",
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
    .replace(/[[(]([^\])]*)[\])]/g, (_match, content: string) => (isAnnotationParen(content) ? " " : `, ${content},`))
    .replace(/\*/g, "")
    .replace(/[-–—]\s*(primary|backup|secondary|load\s*sharing)\s*(provider|carrier)?/gi, "")
    .replace(/\b(primary|backup|secondary)\s+(provider|carrier)\b/gi, "")
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

/** Guards ProviderResolverService/cleanup-provider-master's substring
 * matching against short, low-signal patterns (e.g. a junk row literally
 * named "NA") swallowing unrelated names that merely contain the same
 * letters — "personal" contains "na", "china" contains "na", etc. Both
 * sides must be reasonably long relative to each other for a substring
 * match to count as a real alias relationship. */
export function isConfidentSubstringMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length < 4) return false;
  if (!longer.includes(shorter)) return false;
  return shorter.length / longer.length >= 0.4;
}
