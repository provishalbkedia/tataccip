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
