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
  let trimmed = candidate.trim().replace(/^[("']+|[)."']+$/g, "").trim();
  // Strips a leading topic-noun phrase a non-greedy capture sometimes
  // includes ahead of the actual carrier name instead of stopping right
  // before it -- confirmed against a real file: "Remove IPX provider CITIC
  // and Add new IPX provider PCCW" captures "IPX provider CITIC" as the old
  // name, which the genericWords check below would otherwise reject
  // outright (it contains "provider") even though "CITIC" alone is a
  // perfectly good name. Covers the SCCP/IPX/GRX synonyms real files use
  // interchangeably (carrier vs. gateway, IPX vs. GRX provider).
  trimmed = trimmed.replace(/^(?:new\s+)?(?:sccp\s+(?:carrier|gateway)|(?:ipx|grx)\s+provider)\s+/i, "").trim();
  // Strips the same topic-noun phrase when it trails the name instead --
  // confirmed against a real file: "Delete CITIC and Add COMFONE carrier"
  // captures "COMFONE carrier" as the new name, which the genericWords
  // check below would otherwise reject outright for containing "carrier".
  trimmed = trimmed.replace(/\s+(?:sccp\s+)?(?:carriers?|gateways?|providers?)$/i, "").trim();
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
 * verified against the full real ChangeHistory log of two production IR.21
 * files (Dialog Axiata / LKADG, 60+ entries spanning 2013-2026; Advanced
 * Wireless Network / THAWN, 30+ entries spanning 2018-2026 -- the source of
 * the "Delete" verb synonym and the GRX/SCCP-gateway noun synonyms) rather
 * than guessed at, and a caller is still expected to resolve the returned
 * name(s) against the real ProviderMaster/alias table before trusting them
 * -- an unresolvable candidate (typos, retired brand names, non-provider
 * text this regex set didn't anticipate) is exactly what that resolution
 * step exists to filter out. */
// "Remove(d)" and "Delete(d)" are used interchangeably for the same action
// across real files (verified: Dialog Axiata/LKADG uses "Removed" almost
// exclusively; a Thai operator's THAWN file uses "Delete" for the identical
// carrier-swap shape, e.g. "Delete CITIC and Add COMFONE carrier"). Every
// pattern below that recognizes a removal accepts either verb.
const REMOVE_VERB = "(?:remov(?:e|ed)|delet(?:e|ed))";

export function interpretChangeHistoryDescription(descriptionRaw: string): InterpretedChangeHistoryEvent | null {
  const s = descriptionRaw.trim().replace(/\s+/g, " ");

  // "Removed/Deleted X [as ... carrier] and add Y [w.e.f ...]"
  let m = s.match(new RegExp(`^${REMOVE_VERB}\\s+(.+?)(?:\\s+as\\s+.+?)?\\s+and\\s+add\\s+(.+?)(?:\\s+w\\.?e\\.?f\\.?\\s.*)?$`, "i"));
  if (m) {
    const oldName = clean(m[1]);
    const newName = clean(m[2]);
    if (oldName || newName) return { oldName, newName };
  }

  // "Add [new] [IPX/GRX provider] (X) and Removed/Deleted Y"
  m = s.match(new RegExp(`^add\\s+(?:new\\s+)?(?:(?:ipx|grx)\\s+provider\\s*)?\\(?([^()]+?)\\)?\\s+and\\s+${REMOVE_VERB}\\s+(.+)$`, "i"));
  if (m) {
    const newName = clean(m[1]);
    const oldName = clean(m[2]);
    if (oldName || newName) return { oldName, newName };
  }

  // "<Section label> - Remove/Delete ... - NAME" / "<Section label> - Add ... - NAME"
  const dashParts = s.split(/\s+-\s+/);
  if (dashParts.length >= 2) {
    const last = dashParts[dashParts.length - 1];
    const middleJoined = dashParts.slice(0, -1).join(" ");
    const hasRemove = new RegExp(`\\b${REMOVE_VERB}\\b`, "i").test(middleJoined);
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

  // "Removed/Deleted ... (NAME)"
  m = s.match(new RegExp(`^${REMOVE_VERB}\\s+.*?\\(([^()]+)\\)\\s*$`, "i"));
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

  // "Removed/Deleted NAME IPX[ connectivity]" / "Removed/Deleted NAME as X carrier"
  m = s.match(new RegExp(`^${REMOVE_VERB}\\s+([A-Za-z][\\w .&-]*?)\\s+(?:ipx(?:\\s+connectivity)?|as\\s+\\S+\\s+carrier)\\s*$`, "i"));
  if (m) {
    const oldName = clean(m[1]);
    if (oldName) return { oldName, newName: null };
  }

  // "Add [new] [international] SCCP carrier/gateway NAME" / "Add IPX/GRX provider NAME"
  // -- "international" confirmed as a real qualifier a file inserts before
  // "SCCP gateway" ("Add new international SCCP gateway CITIC").
  m = s.match(/^add\s+(?:new\s+)?(?:(?:international\s+)?sccp\s+(?:carrier|gateway)|(?:ipx|grx)\s+provider)\s+([A-Za-z][\w .&-]*)$/i);
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

/** The 4 "non-carrier" buckets a <ChangeHistoryItem><Description> can
 * classify into once interpretChangeHistoryDescription has already ruled
 * out a carrier addition/removal/replacement -- 3 technical/maintenance
 * categories plus one administrative/metadata category. Matches the
 * codebase's const-object + derived-union convention (see RoutingChangeType
 * in @ccip/shared-types) so this stays structurally assignable to the
 * Prisma enum without a cast. */
export const NonCarrierChangeType = {
  IP_SUBNET_UPDATE: "IP_SUBNET_UPDATE",
  DIAMETER_REALM_UPDATE: "DIAMETER_REALM_UPDATE",
  POINT_CODE_GT_UPDATE: "POINT_CODE_GT_UPDATE",
  ADMIN_NAME_UPDATE: "ADMIN_NAME_UPDATE",
} as const;
export type NonCarrierChangeType = (typeof NonCarrierChangeType)[keyof typeof NonCarrierChangeType];

/** A non-carrier classification result, carrying which named rule matched --
 * shown verbatim in the IR.21 Change Log & Normalization Review screen's
 * "Matched Rule / Pattern" column so an admin can see exactly why an entry
 * landed in a given bucket, not just the bucket itself. */
export interface NonCarrierClassification {
  type: NonCarrierChangeType;
  matchedRule: string;
}

// Checked in most-specific-vocabulary-first order, since a description
// matching more than one list (rare, but "DEA IP address" contains both a
// Diameter term and a bare "IP") should land on the more specific technical
// category rather than the generic IP/subnet catch-all. Plural forms
// (IPs/DEAs/realms) are explicitly tolerated throughout -- a bare "\bIP\b"
// doesn't match inside "IPs" (no word boundary between the "P" and the "s"),
// which silently dropped real entries like "updated IPs" and "DEA IPs
// added" during calibration against real files.

// Strong administrative/metadata language -- corporate renames, alias
// spelling harmonization, NOC/contact-matrix edits. Checked first: this
// vocabulary is unambiguous and never legitimately describes a technical
// change. Deliberately excludes the bare word "name" (see
// ADMIN_NAME_WEAK_PATTERN below) -- "name" alone is common in genuinely
// technical descriptions too ("Add DNS name"), so it's checked last instead,
// only once every technical pattern below has had a chance to claim the
// description first.
const ADMIN_NAME_STRONG_PATTERN = {
  matchedRule: "REGEX_ADMIN_NAME",
  regex: /\b(rebranding|spelling|contact|NOC|legal|editorial)\b/i,
};

// Diameter/DEA/realm language -- LTE roaming (DSX) signaling-plane config,
// distinct from a plain IP address change. S6a? also matches a bare "S6"
// (a real file shortens the full "S6a" interface name in free text).
const DIAMETER_REALM_PATTERN = {
  matchedRule: "REGEX_DIAMETER_REALM",
  regex: /\b(realms?|DEAs?|FQDN|DRA|diameter agent|S6a?|Gy|Gx)\b/i,
};

// SS7 signaling-point language -- global titles, point codes, STPs.
const POINT_CODE_GT_PATTERN = {
  matchedRule: "REGEX_POINT_CODE_GT",
  regex: /\b(GT|global title|point code|DPC|OPC|SPC|STP)\b/i,
};

// IP/subnet/prefix language -- the broadest, most generic technical
// category (a bare "IP" matches). Also covers ASN/"autonomous system" and
// bare "DNS" -- both are genuinely non-commercial network-layer config
// (BGP peering / name resolution), not carrier or admin changes, and both
// showed up repeatedly during calibration ("ASN update", "ASN updated",
// "Update GRX ASN", bare "DNS") without matching any other category.
const IP_SUBNET_PATTERN = {
  matchedRule: "REGEX_IP_RANGE",
  regex: /\b(IPs?|range|ranges|subnet|subnets|prefix|prefixes|CIDR|pool|IPv4|IPv6|ASN|autonomous system|DNS)\b/i,
};

// Weak administrative fallback -- the bare word "name" alone, with no other
// stronger admin or technical signal present. Checked last, after every
// technical pattern above: real files use "name" constantly in technical
// contexts ("DNS name", "hostname"), and checking this first (as the
// original single ADMIN_UPDATE bucket did) misclassified "Add DNS name" as
// an administrative change instead of the network-config change it is.
const ADMIN_NAME_WEAK_PATTERN = {
  matchedRule: "REGEX_ADMIN_NAME",
  regex: /\bname\b/i,
};

const NON_CARRIER_PATTERNS: { type: NonCarrierChangeType; matchedRule: string; regex: RegExp }[] = [
  { type: "ADMIN_NAME_UPDATE", ...ADMIN_NAME_STRONG_PATTERN },
  { type: "DIAMETER_REALM_UPDATE", ...DIAMETER_REALM_PATTERN },
  { type: "POINT_CODE_GT_UPDATE", ...POINT_CODE_GT_PATTERN },
  { type: "IP_SUBNET_UPDATE", ...IP_SUBNET_PATTERN },
  { type: "ADMIN_NAME_UPDATE", ...ADMIN_NAME_WEAK_PATTERN },
];

/** Classifies a <ChangeHistoryItem><Description> that
 * interpretChangeHistoryDescription already determined isn't a carrier
 * addition/removal/replacement, into one of the 4 non-carrier buckets above
 * -- or null when it's neither (e.g. "No Change", or free text this keyword
 * set doesn't recognize), in which case the caller drops the entry entirely
 * rather than store pure noise. Deliberately keyword-based rather than
 * fuzzy: a false negative here just means an entry is silently dropped
 * (matching the existing conservative behavior for unrecognized carrier-swap
 * text), which is the safe failure direction for an audit feed. */
export function classifyNonCarrierChange(descriptionRaw: string): NonCarrierClassification | null {
  const s = descriptionRaw.trim();
  if (!s) return null;
  for (const { type, matchedRule, regex } of NON_CARRIER_PATTERNS) {
    if (regex.test(s)) return { type, matchedRule };
  }
  return null;
}
