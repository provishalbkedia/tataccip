import { isConfidentSubstringMatch, normalizeCarrierName } from "./provider-normalize";
import { normalizeCountryToIso3 } from "./country-normalize";

// Wholesale providers that appear as their own column in the "wide"
// Competitor Coverage matrix format (one column per carrier, one row per
// MNO) rather than the standard one-row-per-(Provider,MNO,Service) format.
// Display casing here is what gets fed into the existing provider-alias
// resolver as the raw "Provider" token — see upload.service.ts.
export const MATRIX_PROVIDER_COLUMNS = [
  "A1", "Syniverse", "BICS", "TATAComms", "Vodafone", "CMI", "Arelion",
  "TIS", "Comfone", "DT", "iBASIS", "Orange", "TNS", "Telefonica",
];

const MATRIX_PROVIDER_KEYS = new Set(MATRIX_PROVIDER_COLUMNS.map((p) => p.toLowerCase()));

export type ReachlistFormat = "STANDARD" | "MATRIX" | "EMPTY";

/** Distinguishes the standard one-row-per-record format (has Provider +
 * TADIG columns) from the wide Competitor Coverage matrix (one column per
 * wholesale provider, no TADIG column at all — TADIG has to be resolved
 * from MnoMaster by (Country, MNO) instead). Row keys are already
 * normalized (trimmed, lowercased) by readFirstSheetAsRows. */
export function detectReachlistFormat(rowKeys: string[]): ReachlistFormat {
  if (rowKeys.length === 0) return "EMPTY";
  const keys = new Set(rowKeys);
  if (keys.has("provider") && (keys.has("tadig") || keys.has("tadig code"))) return "STANDARD";
  if (keys.has("mno") && keys.has("country") && [...keys].some((k) => MATRIX_PROVIDER_KEYS.has(k))) {
    return "MATRIX";
  }
  return "STANDARD"; // fall through to the existing (and existing error messages) for anything unrecognized
}

/** The matrix format's provider columns actually present in this file,
 * paired with their canonical display name (used as the raw "Provider"
 * token downstream) and the lowercased row key to read from. */
export function matrixProviderColumns(rowKeys: string[]): { display: string; key: string }[] {
  const present = new Set(rowKeys);
  return MATRIX_PROVIDER_COLUMNS.filter((p) => present.has(p.toLowerCase())).map((p) => ({
    display: p,
    key: p.toLowerCase(),
  }));
}

/** Resolves a matrix row's (Country, MNO) against existing MnoMaster
 * operators within that same country, so a wide competitor-coverage file
 * can be ingested without a TADIG column of its own.
 *
 * Two passes, both scoped to candidates already in the same ISO3 country
 * (keeps the candidate pool small and avoids cross-country false
 * matches): first an exact match on the legal-suffix-stripped name
 * (handles "Telecom Development Company Afghanistan" vs "...Afghanistan
 * Limited"); if that's not unique, a confident substring match (handles
 * MnoMaster's shorter IR.21 brand name, e.g. "Movistar" vs the matrix's
 * "Movistar Argentina" — see provider-normalize.ts's
 * isConfidentSubstringMatch, which already refuses anything under 4
 * characters specifically to avoid this kind of short-code false
 * positive, e.g. "A1" would never be trusted to substring-match on its
 * own). Either pass returning more than one candidate is reported as
 * ambiguous rather than guessed at — same principle as a straight miss:
 * an operator this platform doesn't clearly already know is left for an
 * admin to resolve (via secondaryTadigs or a fresh IR.21 upload), not
 * silently attached to the wrong existing MnoMaster row. */
export function buildMnoResolver(
  mnos: { operatorName: string; country: string; tadigCode: string }[],
): (country: string, mnoName: string) => { status: "resolved"; tadigCode: string } | { status: "not-found" | "ambiguous" } {
  const byCountry = new Map<string, { tadigCode: string; normalizedName: string }[]>();
  for (const m of mnos) {
    const iso3 = normalizeCountryToIso3(m.country);
    if (!iso3) continue;
    if (!byCountry.has(iso3)) byCountry.set(iso3, []);
    byCountry.get(iso3)!.push({ tadigCode: m.tadigCode, normalizedName: normalizeCarrierName(m.operatorName) });
  }

  return (country, mnoName) => {
    const iso3 = normalizeCountryToIso3(country);
    const candidates = iso3 ? byCountry.get(iso3) : undefined;
    if (!candidates) return { status: "not-found" };

    const normalized = normalizeCarrierName(mnoName);
    const exact = candidates.filter((c) => c.normalizedName === normalized);
    if (exact.length === 1) return { status: "resolved", tadigCode: exact[0].tadigCode };
    if (exact.length > 1) return { status: "ambiguous" };

    const fuzzy = candidates.filter((c) => isConfidentSubstringMatch(normalized, c.normalizedName));
    if (fuzzy.length === 1) return { status: "resolved", tadigCode: fuzzy[0].tadigCode };
    if (fuzzy.length > 1) return { status: "ambiguous" };

    return { status: "not-found" };
  };
}

/** Same matching principle as buildMnoResolver, but without a country to
 * scope the candidate pool — for sources that give only a free-text name
 * (e.g. a plain bullet list of partner names pasted into an email body,
 * with no per-line country). Searches the *entire* MnoMaster roster, so
 * it's inherently higher-collision-risk than the country-scoped resolver;
 * still only trusts an exact or confident-substring match (never picks
 * among multiple candidates), but callers should prefer the country-
 * scoped resolver whenever a country is actually available. */
export function buildGlobalNameResolver(
  mnos: { operatorName: string; tadigCode: string }[],
): (name: string) => { status: "resolved"; tadigCode: string } | { status: "not-found" | "ambiguous" } {
  const candidates = mnos.map((m) => ({ tadigCode: m.tadigCode, normalizedName: normalizeCarrierName(m.operatorName) }));

  return (name) => {
    const normalized = normalizeCarrierName(name);
    if (!normalized) return { status: "not-found" };
    const exact = candidates.filter((c) => c.normalizedName === normalized);
    if (exact.length === 1) return { status: "resolved", tadigCode: exact[0].tadigCode };
    if (exact.length > 1) return { status: "ambiguous" };

    const fuzzy = candidates.filter((c) => isConfidentSubstringMatch(normalized, c.normalizedName));
    if (fuzzy.length === 1) return { status: "resolved", tadigCode: fuzzy[0].tadigCode };
    if (fuzzy.length > 1) return { status: "ambiguous" };

    return { status: "not-found" };
  };
}

// Filler words that repeat across real filenames/folder-naming conventions
// but never denote the provider itself — stripped when inferring which
// carrier a single-provider file belongs to from its own name.
const FILENAME_STOP_WORDS = new Set([
  "sccp", "dsx", "grx", "lte", "ss7", "sigtran", "ipx", "reach", "reachlist",
  "list", "coverage", "old", "full", "destination", "external", "signaling",
  "signalling", "diameter", "data", "customer", "on-net", "onnet", "and",
  "new", "updated", "update", "report", "export", "roaming", "service",
  "matrix", "batch", "2g", "3g", "4g", "5g", "gsm",
]);

/** A single-provider reach-list file is identified by carrier, not by a
 * "Provider" column of its own (real examples: "A1 SCCP DSX GRX.xlsx",
 * "BICS External LTE Destination List.xlsx") — the provider name is the
 * leading run of filename tokens up to the first one that's a generic
 * service/descriptor word, a bare year, or a bare number. */
export function inferProviderNameFromFilename(filename: string): string {
  return inferProviderNameCandidatesFromFilename(filename)[0];
}

/** Same extraction, but also tries the *trailing* run of tokens before a
 * bare year — a forwarded-email subject line names the carrier last, not
 * first (e.g. "RE Request for Latest On-Net RP List Routing Audit.
 * Telstra 2026.msg"), unlike the provider-first convention every Excel/
 * PDF filename in real reach-list archives actually follows. Returns
 * leading first (the common case), then trailing, so a caller trying
 * candidates in order favors the usual convention. */
export function inferProviderNameCandidatesFromFilename(filename: string): string[] {
  const base = filename.replace(/\.(xlsx|xls|pdf|msg)$/i, "");
  const tokens = base.split(/[\s_\-.]+/).filter(Boolean);

  const leading: string[] = [];
  for (const t of tokens) {
    if (FILENAME_STOP_WORDS.has(t.toLowerCase()) || /^\d+$/.test(t)) break;
    leading.push(t);
  }
  const leadingName = leading.join(" ").trim();

  let end = tokens.length;
  while (end > 0 && /^\d+$/.test(tokens[end - 1])) end--; // drop trailing bare year(s)
  let start = end;
  while (start > 0 && !FILENAME_STOP_WORDS.has(tokens[start - 1].toLowerCase()) && !/^\d+$/.test(tokens[start - 1])) start--;
  const trailingName = tokens.slice(start, end).join(" ").trim();

  const candidates = [leadingName || base.trim()];
  if (trailingName && trailingName !== leadingName) candidates.push(trailingName);
  return candidates;
}
