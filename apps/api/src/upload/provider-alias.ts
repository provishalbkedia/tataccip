// Common name variants seen in vendor-supplied Excel files, mapped to the
// canonical ProviderMaster.providerName they should upsert against.
export const PROVIDER_ALIASES: Record<string, string> = {
  "tata communications": "Tata Comm",
  "tata communications ltd": "Tata Comm",
  "tatacomm": "Tata Comm",
  "tata": "Tata Comm",
  "syniverse technologies": "Syniverse",
  "orange ic": "Orange International Carriers",
  "orange international carrier": "Orange International Carriers",
  "orange carrier services": "Orange International Carriers",
  "telefonica": "Telefonica Global Solutions",
  "telefonica global solutions sa": "Telefonica Global Solutions",
  "ibasis inc": "iBasis",
  "ibasis inc.": "iBasis",
};

export function normalizeProviderName(raw: string): string {
  const trimmed = raw.trim();
  const canonical = PROVIDER_ALIASES[trimmed.toLowerCase()];
  return canonical ?? trimmed;
}
