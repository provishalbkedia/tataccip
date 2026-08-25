import { Region } from "@ccip/shared-types";

export const ALL_REGIONS: Region[] = [
  Region.AMERICAS,
  Region.MEA,
  Region.EUROPE,
  Region.APAC,
  Region.NON_TERRESTRIAL,
];

// GSMA TADIG country codes are mostly ISO 3166-1 alpha-3, plus a handful of
// non-country pseudo-codes for networks with no fixed territory (aircraft,
// maritime, satellite — see NON_TERRESTRIAL_CODES below) and "K00" for
// Kosovo (no official ISO3 assignment). Grouped per the platform's 4-region
// + Non-Terrestrial convention: Americas = North America + Latin America/
// Caribbean; MEA = Middle East + Africa; Europe = Europe + CIS/Central Asia;
// APAC = Asia-Pacific + Oceania (including South Asia).
const AMERICAS_CODES = [
  "USA", "CAN", "MEX", "GTM", "BLZ", "SLV", "HND", "NIC", "CRI", "PAN",
  "CUB", "JAM", "HTI", "DOM", "BHS", "TTO", "BRB", "GRD", "VCT", "LCA",
  "DMA", "ATG", "KNA", "VGB", "VIR", "PRI", "TCA", "CYM", "AIA", "MSR",
  "GLP", "MTQ", "ABW", "ANT", "CUW", "SXM", "BES", "SUR", "GUY", "VEN",
  "COL", "ECU", "PER", "BOL", "CHL", "ARG", "PRY", "URY", "BRA", "FLK",
  "GRL", "BMU", "SPM",
];

const MEA_CODES = [
  // Middle East
  "ARE", "SAU", "QAT", "KWT", "OMN", "BHR", "ISR", "JOR", "LBN", "SYR",
  "IRQ", "IRN", "YEM", "PSE",
  // Africa
  "EGY", "LBY", "TUN", "DZA", "MAR", "ESH", "SDN", "SSD", "ETH", "ERI",
  "DJI", "SOM", "KEN", "UGA", "TZA", "RWA", "BDI", "COD", "COG", "CAF",
  "CMR", "GAB", "GNQ", "STP", "TCD", "NER", "NGA", "BEN", "TGO", "GHA",
  "CIV", "LBR", "SLE", "GIN", "GNB", "SEN", "GMB", "MLI", "BFA", "MRT",
  "CPV", "ZAF", "NAM", "BWA", "ZWE", "ZMB", "MWI", "MOZ", "SWZ", "LSO",
  "MDG", "MUS", "SYC", "COM", "AGO", "REU", "SHN",
];

const EUROPE_CODES = [
  "GBR", "IRL", "FRA", "DEU", "ITA", "ESP", "PRT", "NLD", "BEL", "LUX",
  "CHE", "AUT", "DNK", "NOR", "SWE", "FIN", "ISL", "POL", "CZE", "SVK",
  "HUN", "ROU", "BGR", "GRC", "HRV", "SVN", "BIH", "SRB", "MNE", "MKD",
  "ALB", "MLT", "CYP", "EST", "LVA", "LTU", "UKR", "BLR", "MDA", "RUS",
  "GEO", "ARM", "AZE", "KAZ", "UZB", "TKM", "TJK", "KGZ", "TUR", "AND",
  "MCO", "SMR", "LIE", "GIB", "FRO", "K00",
];

const APAC_CODES = [
  "CHN", "HKG", "MAC", "TWN", "JPN", "KOR", "PRK", "MNG", "IND", "PAK", "AFG",
  "BGD", "LKA", "NPL", "BTN", "MDV", "MMR", "THA", "LAO", "KHM", "VNM",
  "MYS", "SGP", "IDN", "PHL", "BRN", "TLS", "AUS", "NZL", "PNG", "FJI",
  "SLB", "VUT", "NCL", "PYF", "WSM", "TON", "KIR", "TUV", "NRU", "PLW",
  "FSM", "MHL", "GUM", "ASM", "COK", "NIU", "WLF",
];

// Aircraft, maritime, and satellite operators — GSMA assigns these a
// pseudo "country" code since they have no fixed territory. Confirmed
// against production data: AAA = aeronautical (AeroMobile, SITA FOR
// AIRCRAFT), AAM = maritime (Telenor Maritime, Wireless Maritime
// Services), AAQ = satellite (Inmarsat, Iridium, Skylo, Sateliot).
const NON_TERRESTRIAL_CODES = ["AAA", "AAM", "AAQ"];

const CODE_TO_REGION = new Map<string, Region>();
for (const c of AMERICAS_CODES) CODE_TO_REGION.set(c, "Americas");
for (const c of MEA_CODES) CODE_TO_REGION.set(c, "MEA");
for (const c of EUROPE_CODES) CODE_TO_REGION.set(c, "Europe");
for (const c of APAC_CODES) CODE_TO_REGION.set(c, "APAC");
for (const c of NON_TERRESTRIAL_CODES) CODE_TO_REGION.set(c, "Non-Terrestrial");

// A handful of ingested MnoMaster.country values are full country names
// rather than the ISO3 code (data-quality artifacts from non-XML sources,
// e.g. Reach List uploads) — normalize the ones actually observed in
// production rather than silently misclassifying them.
const NAME_TO_REGION = new Map<string, Region>([
  ["australia", "APAC"],
  ["brazil", "Americas"],
  ["france", "Europe"],
  ["germany", "Europe"],
  ["india", "APAC"],
  ["pakistan", "APAC"],
  ["united kingdom", "Europe"],
  ["united states", "Americas"],
]);

/** Maps an MnoMaster.country value (usually a GSMA/ISO3 code, occasionally
 * a full country name — see NAME_TO_REGION) to one of the platform's 4
 * regions or "Non-Terrestrial". Returns `null` for values that can't be
 * classified (e.g. "UNKNOWN") rather than guessing — callers should treat
 * that as "no region", not silently sort it into an arbitrary bucket. */
export function getRegionByCountry(country: string | null | undefined): Region | null {
  if (!country) return null;
  const trimmed = country.trim();
  const byCode = CODE_TO_REGION.get(trimmed.toUpperCase());
  if (byCode) return byCode;
  return NAME_TO_REGION.get(trimmed.toLowerCase()) ?? null;
}
