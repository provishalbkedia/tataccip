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
