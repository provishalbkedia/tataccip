import { Injectable } from "@nestjs/common";
import { XMLParser } from "fast-xml-parser";
import { splitCompositeProviderNames } from "./provider-normalize";

/** One IR.21 XML file's worth of extracted data, keyed by the exporting
 * MNO's own TADIG (GSMA IR.21 files are self-published: each file is one
 * MNO's declaration of its own connectivity). */
export interface ParsedIr21Document {
  senderTadig: string;
  schemaVersion: string | null;
  fileCreationTimestamp: string | null;
  organisationName: string | null;
  countryInitials: string | null;
  networkType: string | null;
  mccMncPairs: string[];
  primarySccpCarrier: string | null;
  backupSccpCarriers: string[];
  sccpPointCodes: string[];
  grxIpxProviders: string[];
  lteIpxProviders: string[];
  interPmnIpRanges: string[];
  diameterEdgeAgentFqdn: string | null;
  authoritativeDnsIps: string[];
  epcRealms: string[];
  roamingCoordinatorEmail: string | null;
  ts24x7Email: string | null;
  distributionEmail: string | null;
}

function isLeaf(v: unknown): v is string | number {
  return typeof v === "string" || typeof v === "number";
}

function textOf(v: unknown): string | null {
  if (isLeaf(v)) {
    const s = String(v).trim();
    return s || null;
  }
  if (v && typeof v === "object" && "#text" in (v as Record<string, unknown>)) {
    return textOf((v as Record<string, unknown>)["#text"]);
  }
  return null;
}

function walk(node: unknown, cb: (key: string, value: unknown) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, cb);
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key.startsWith("@_") || key === "#text") continue;
      cb(key, value);
      walk(value, cb);
    }
  }
}

/** Every direct child object of `node`'s own key/value pairs, one level
 * down only — used to iterate a *Item/*Entry list without descending into
 * their own nested children (so e.g. collecting SCCPCarrierItem blocks
 * doesn't also pick up nested DPCItem blocks as if they were carriers). */
function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function collectByKey(root: unknown, patterns: RegExp[]): { key: string; value: unknown }[] {
  const results: { key: string; value: unknown }[] = [];
  walk(root, (key, value) => {
    if (patterns.some((p) => p.test(key))) results.push({ key, value });
  });
  return results;
}

function collectTexts(root: unknown, patterns: RegExp[]): string[] {
  const out: string[] = [];
  for (const { value } of collectByKey(root, patterns)) {
    for (const item of asArray(value)) {
      const t = textOf(item);
      if (t) out.push(t);
    }
  }
  return Array.from(new Set(out));
}

function firstText(root: unknown, patterns: RegExp[]): string | null {
  const all = collectTexts(root, patterns);
  return all.length > 0 ? all[0] : null;
}

/** Some IR.21 XML exports leave <NetworkName> as an unfilled MCC-MNC
 * placeholder (e.g. "(440-50)") instead of the operator's actual trade
 * name, while a real name sits in <OrganisationName>. Recognizing and
 * skipping this placeholder pattern stops it from winning over the real
 * name below. */
function looksLikeMccMncPlaceholder(value: string): boolean {
  return /^\(?\d{3}[- ]?\d{1,3}\)?$/.test(value.trim());
}

/** Like collectTexts, but for fields known to hold carrier/provider names —
 * splits any composite value (e.g. one <ProviderName> element containing
 * "BICS, Orange") into individual candidate names before returning, so a
 * single messy source string never becomes one bogus multi-name provider. */
function collectProviderNames(root: unknown, patterns: RegExp[]): string[] {
  const out = collectTexts(root, patterns).flatMap(splitCompositeProviderNames);
  return Array.from(new Set(out));
}

/** First matching section/list subtree, or `undefined` if absent (e.g. a
 * "SectionNA" placeholder section, or a schema version that omits it) — lets
 * callers degrade to empty results instead of falling back to the whole
 * document and picking up unrelated matches. */
function scopeTo(root: unknown, patterns: RegExp[]): unknown {
  return collectByKey(root, patterns)[0]?.value;
}

/** GSMA RAEX IR.21 XML extractor, built against real sample files (schema
 * versions 8.2-18.0) spanning ROAMSYS and other vendor tooling. Uses a
 * recursive tag-name search (not raw XPath) so it tolerates the nesting
 * differences actually observed between versions — e.g. MCC/MNC lives
 * under TADIGSummaryItem/NetworkProperties in 18.0 but the CCITT_E212
 * series directly under RoutingInfoSection in 8.2 — without needing a
 * separate code path per version. Still worth spot-checking against new
 * files as they're encountered; GSMA doesn't publish a single canonical
 * XSD covering every version in the wild. */
@Injectable()
export class Ir21XmlParserService {
  private parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
    // Every field this parser extracts is treated as text (schema version
    // "18.0", DPCs, IPs, emails, etc.) — leaving numeric parsing on turns
    // "18.0" into the float 18 and loses the trailing zero.
    parseTagValue: false,
    parseAttributeValue: false,
  });

  parse(buffer: Buffer, filename: string): ParsedIr21Document {
    const doc = this.parser.parse(buffer.toString("utf-8"));

    const senderTadig =
      firstText(doc, [/^sendertadig$/i]) ?? firstText(doc, [/^tadigcode$/i]) ?? this.tadigFromFilename(filename);
    if (!senderTadig) {
      throw new Error(`Could not determine sender TADIG from "${filename}" (no SenderTADIG/TADIGCode element and filename doesn't contain one)`);
    }

    const sccpScope = scopeTo(doc, [/^internationalsccpgatewaysection$/i]);
    const grxScope = scopeTo(doc, [/^grxipxroutingfordataroamingsection$/i]);
    const lteScope = scopeTo(doc, [/^lteinfosection$/i]);
    const signallingScope = scopeTo(doc, [/^signallinginfosection$/i]);
    const contactScope = scopeTo(doc, [/^contactinfosection$/i]);

    const sccp = this.extractSccpCarriers(sccpScope);
    const dnsScope = grxScope; // PMNLocalDNSIPList / PMNAuthoritativeDNSIPList both live in this section

    return {
      senderTadig: senderTadig.trim().toUpperCase(),
      schemaVersion: firstText(doc, [/tadigraexir21schemaversion/i, /^schemaversion$/i]),
      fileCreationTimestamp: firstText(doc, [/filecreationtimestamp/i]),
      organisationName: this.resolveOrganisationName(doc),
      countryInitials: firstText(doc, [/^countryinitials$/i]),
      networkType: firstText(doc, [/^networktype$/i]),
      mccMncPairs: this.extractMccMncPairs(doc),
      primarySccpCarrier: sccp.primary,
      backupSccpCarriers: sccp.backups,
      sccpPointCodes: sccp.pointCodes,
      grxIpxProviders: collectProviderNames(grxScope, [/^providername$/i]),
      lteIpxProviders: this.extractDsxDiameterProviders(lteScope, signallingScope),
      interPmnIpRanges: collectTexts(grxScope, [/^ipaddressrange$/i]),
      diameterEdgeAgentFqdn:
        firstText(lteScope, [/^fqdn$/i]) ?? firstText(lteScope, [/diameteredgeagent/i, /deahostname/i]),
      authoritativeDnsIps: collectTexts(dnsScope, [/^ipaddress$/i]),
      epcRealms: collectTexts(lteScope, [/^epcrealmsforroaming$/i]),
      ...this.extractContactEmails(contactScope, doc),
    };
  }

  /** Pairs MCC with MNC from whichever block they're found in
   * (NetworkProperties in newer schemas, CCITT_E212_NumberSeries in older
   * ones, E212E214Translation in others) — each block is scanned
   * independently so unrelated MCC/MNC pairs elsewhere in the document
   * (e.g. IMSI translation tables) aren't cross-matched. */
  private extractMccMncPairs(doc: unknown): string[] {
    const blocks = collectByKey(doc, [
      /^networkproperties$/i,
      /^ccitt_e212_numberseries$/i,
      /^e212e214translation$/i,
    ]).map((b) => b.value);

    const pairs: string[] = [];
    for (const block of blocks) {
      const mcc = firstText(block, [/^mcc$/i]);
      const mnc = firstText(block, [/^mnc$/i]);
      if (mcc && mnc) pairs.push(`${mcc}-${mnc}`);
    }
    return Array.from(new Set(pairs));
  }

  /** Each SCCPCarrierItem carries its own SCCPConnectivityInformation
   * ("Primary" / "Backup" / "Load Sharing" etc.) — classifies by that
   * sibling rather than assuming document order, splits any composite
   * carrier-name string before classifying, and collects DPCs from every
   * carrier's DPCList regardless of primary/backup status. */
  private extractSccpCarriers(sccpScope: unknown): {
    primary: string | null;
    backups: string[];
    pointCodes: string[];
  } {
    const carrierListScope = scopeTo(sccpScope, [/^internationalsccpcarrierlist$/i]) ?? sccpScope;
    const carrierItems = collectByKey(carrierListScope, [/^sccpcarrieritem$/i]).flatMap((m) => asArray(m.value));

    let primary: string | null = null;
    const backups: string[] = [];
    const pointCodes: string[] = [];

    for (const item of carrierItems) {
      const rawName = firstText(item, [/^sccpcarriername$/i]);
      const role = firstText(item, [/^sccpconnectivityinformation$/i]);
      pointCodes.push(...collectTexts(item, [/^dpc$/i]));
      if (!rawName) continue;
      // A single carrier item can itself contain a composite string (e.g.
      // "Arelion, CMI, BBIS") — split before classifying; if marked
      // Primary, only the first split token takes the primary slot, the
      // rest fall through to backups same as any other carrier item would.
      const tokens = splitCompositeProviderNames(rawName);
      if (tokens.length === 0) continue;
      if (role && /primary/i.test(role) && !primary) {
        primary = tokens[0];
        backups.push(...tokens.slice(1));
      } else {
        backups.push(...tokens);
      }
    }

    return { primary, backups: Array.from(new Set(backups)), pointCodes: Array.from(new Set(pointCodes)) };
  }

  /** Diameter Signaling Exchange (DSX/LTE) carrier extraction. GSMA IR.21
   * versions 8.x-18.x scatter this under several different tag names rather
   * than one canonical "DSX" element — collects explicit provider/carrier
   * name tags from LTEInfoSection (IPX interconnect lists, DRA/edge-agent
   * lists, Diameter provider lists) and SignallingInfoSection's Diameter
   * block, plus best-effort brand names inferred from Diameter Edge Agent
   * FQDNs (e.g. "*.dra.bics3gppnetwork.org" -> "bics") since some files only
   * ever declare the carrier as a hostname, never as a named element. */
  private extractDsxDiameterProviders(lteScope: unknown, signallingScope: unknown): string[] {
    const named = collectProviderNames(lteScope, [
      /^ipxprovidername$/i,
      /^providername$/i,
      /^carriername$/i,
      /^diameterprovidername$/i,
    ]);
    const diameterInfoScope = scopeTo(signallingScope, [/^diameterinfo$/i]) ?? signallingScope;
    const signalling = collectProviderNames(diameterInfoScope, [/^carriername$/i, /^signallingcarriername$/i]);
    const fqdns = collectTexts(lteScope, [/^fqdn$/i, /diameteredgeagent/i, /deahostname/i]);
    const fromFqdns = fqdns.map((f) => this.inferProviderFromFqdn(f)).filter((v): v is string => !!v);

    return Array.from(new Set([...named, ...signalling, ...fromFqdns]));
  }

  /** Pulls a brand-like token out of a Diameter Edge Agent hostname, e.g.
   * "dra1.dra.bics3gppnetwork.org" -> "bics" after dropping generic infra
   * labels ("dra", "dea", ...) and stripping the "3gppnetwork" realm suffix
   * IR.21 files consistently append to the carrier brand. Returned as a raw
   * candidate string fed through the same alias-resolution pipeline as any
   * other declared carrier name — an unrecognized host just routes to
   * Others/Unassigned like any other unmatched string, rather than needing
   * a hand-maintained FQDN-to-brand table. */
  private inferProviderFromFqdn(fqdn: string): string | null {
    const host = fqdn.trim().toLowerCase().replace(/\.$/, "");
    if (!host || !host.includes(".")) return null;
    const labels = host.split(".");
    const genericLabel = /^(dra\d*|dea\d*|diameter|edge|agent|gw|www)$/;
    const genericWord = /^(3gppnetwork|gprs|epc|org|com|net|[a-z]{2,3}\d{2,3})$/;
    const candidate = labels.find((l) => !genericLabel.test(l) && !genericWord.test(l));
    if (!candidate) return null;
    const brand = candidate.replace(/3gppnetwork$/, "").replace(/^-+|-+$/g, "");
    return brand.length >= 3 ? brand : null;
  }

  /** The three operational contact channels IR.21 tracks separately:
   * the named roaming coordinator (RoamingCoordinator/*Person), the 24x7
   * support team (TS24x7Contact, falling back to MainContact — some files
   * only staff one team for both), and the distribution-list address every
   * IR.21 update is broadcast to. */
  private extractContactEmails(
    contactScope: unknown,
    doc: unknown,
  ): { roamingCoordinatorEmail: string | null; ts24x7Email: string | null; distributionEmail: string | null } {
    const coordinator = scopeTo(contactScope, [/^roamingcoordinator$/i]);
    const ts247 = scopeTo(contactScope, [/^ts24x7contact$/i]);
    const main = scopeTo(contactScope, [/^maincontact$/i]);

    return {
      roamingCoordinatorEmail: firstText(coordinator, [/^email$/i]),
      ts24x7Email: firstText(ts247, [/^email$/i]) ?? firstText(main, [/^email$/i]),
      distributionEmail: firstText(doc, [/^ir21distributionemailaddress$/i]),
    };
  }

  /** Fallback when a file has no SenderTADIG/TADIGCode element at all:
   * vendor exports are commonly named "IR21_<TADIG>_<Operator>_<date>.xml". */
  private tadigFromFilename(filename: string): string | null {
    const match = filename.match(/IR21_([A-Z0-9]{5})_/i) ?? filename.match(/[A-Z0-9]{5}/i);
    return match ? match[1] ?? match[0] : null;
  }

  /** <NetworkName> is preferred over <OrganisationName> when both are
   * present (it's usually the commercial brand vs. a legal-entity name),
   * but some exports leave NetworkName as an unfilled MCC-MNC placeholder
   * (e.g. "(440-50)") — in that case OrganisationName is the real name. */
  private resolveOrganisationName(doc: unknown): string | null {
    const networkName = firstText(doc, [/^networkname$/i]);
    if (networkName && !looksLikeMccMncPlaceholder(networkName)) return networkName;
    return firstText(doc, [/^organisationname$/i]) ?? networkName;
  }
}
