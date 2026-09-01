import * as countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";

countries.registerLocale(enLocale);

// GSMA TADIG country values include a handful of pseudo/non-ISO codes for
// networks with no fixed territory, plus Kosovo (no official ISO3
// assignment) — see region-mapper.ts. These must pass through unchanged
// rather than being rejected as "unknown".
const NON_ISO_CODES = new Set(["K00", "AAA", "AAM", "AAQ", "UNKNOWN"]);

// i18n-iso-countries' English locale keys names on its own registered form
// (frequently the "X, Qualifier of" order, e.g. "Korea, Republic of",
// "Virgin Islands, British"), which doesn't match either the UN long-form
// name ("Bolivia (Plurinational State of)") or the everyday common name
// ("British Virgin Islands", "Burma") a spreadsheet is likely to use.
// getAlpha3Code() doesn't fuzzy-match across these, so the gaps actually
// observed in production uploads are covered here directly rather than
// hand-rolling a full name-equivalence engine.
const NAME_ALIASES: Record<string, string> = {
  "bolivia (plurinational state of)": "BOL",
  "venezuela (bolivarian republic of)": "VEN",
  "iran (islamic republic of)": "IRN",
  "tanzania, united republic of": "TZA",
  "tanzania (united republic of)": "TZA",
  "north korea": "PRK",
  "south korea": "KOR",
  "british virgin islands": "VGB",
  "us virgin islands": "VIR",
  "u.s. virgin islands": "VIR",
  "syria": "SYR",
  "syrian arab republic": "SYR",
  "moldova": "MDA",
  "republic of moldova": "MDA",
  "laos": "LAO",
  "lao people's democratic republic": "LAO",
  "brunei": "BRN",
  "brunei darussalam": "BRN",
  "micronesia": "FSM",
  "micronesia (federated states of)": "FSM",
  "democratic republic of congo": "COD",
  "dr congo": "COD",
  "congo-kinshasa": "COD",
  "republic of congo": "COG",
  "congo-brazzaville": "COG",
  "swaziland": "SWZ",
  "burma": "MMR",
  "east timor": "TLS",
  "vatican": "VAT",
  "vatican city": "VAT",
  // "SAR China" (Special Administrative Region) qualifiers — a common
  // reach-list-source phrasing the library's own registered name ("Hong
  // Kong", "Macao") doesn't carry, so it falls through to the raw-string
  // fallback below and never matches its real ISO3 code without these.
  "hong kong, sar china": "HKG",
  "hong kong sar": "HKG",
  "hong kong sar china": "HKG",
  "macau, sar china": "MAC",
  "macao, sar china": "MAC",
  "macau sar": "MAC",
  "macao sar": "MAC",
};

/** Normalizes a country value (ISO3 code, ISO2 code, or full English name —
 * common, official UN long-form, or i18n-iso-countries' own registered
 * form) to its canonical ISO 3166-1 alpha-3 code, so a Reach List upload
 * writing "Afghanistan" or "Bolivia (Plurinational State of)" isn't flagged
 * as a mismatch against an MnoMaster.country of "AFG"/"BOL". Falls back to
 * the trimmed/uppercased input for values that don't resolve to a known
 * country (GSMA pseudo-codes, "UNKNOWN", typos) — the comparison this feeds
 * still works, it just can't correct those cases. */
export function normalizeCountryToIso3(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();

  if (NON_ISO_CODES.has(upper)) return upper;
  if (upper.length === 3 && countries.isValid(upper)) return upper;
  if (upper.length === 2 && countries.isValid(upper)) return countries.alpha2ToAlpha3(upper) ?? upper;

  const lower = trimmed.toLowerCase();
  if (NAME_ALIASES[lower]) return NAME_ALIASES[lower];

  const byName = countries.getAlpha3Code(trimmed, "en");
  if (byName) return byName.toUpperCase();

  // Strip a trailing UN-style qualifier — "Bolivia (Plurinational State
  // of)" -> "Bolivia" — and retry both the alias map and the library.
  const stripped = trimmed.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (stripped && stripped !== trimmed) {
    const strippedLower = stripped.toLowerCase();
    if (NAME_ALIASES[strippedLower]) return NAME_ALIASES[strippedLower];
    const strippedMatch = countries.getAlpha3Code(stripped, "en");
    if (strippedMatch) return strippedMatch.toUpperCase();
  }

  return upper;
}
