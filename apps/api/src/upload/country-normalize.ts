import * as countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";

countries.registerLocale(enLocale);

// GSMA TADIG country values include a handful of pseudo/non-ISO codes for
// networks with no fixed territory, plus Kosovo (no official ISO3
// assignment) — see region-mapper.ts. These must pass through unchanged
// rather than being rejected as "unknown".
const NON_ISO_CODES = new Set(["K00", "AAA", "AAM", "AAQ", "UNKNOWN"]);

/** Normalizes a country value (ISO3 code, ISO2 code, or full English name)
 * to its canonical ISO 3166-1 alpha-3 code, so a Reach List upload writing
 * "Afghanistan" isn't flagged as a mismatch against an MnoMaster.country of
 * "AFG". Falls back to the trimmed/uppercased input for values that don't
 * resolve to a known country (GSMA pseudo-codes, "UNKNOWN", typos) — the
 * comparison this feeds still works, it just can't correct those cases. */
export function normalizeCountryToIso3(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();

  if (NON_ISO_CODES.has(upper)) return upper;
  if (upper.length === 3 && countries.isValid(upper)) return upper;
  if (upper.length === 2 && countries.isValid(upper)) return countries.alpha2ToAlpha3(upper) ?? upper;

  const byName = countries.getAlpha3Code(trimmed, "en");
  if (byName) return byName.toUpperCase();

  return upper;
}
