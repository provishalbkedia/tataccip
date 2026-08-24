import "dotenv/config";
import { PrismaClient, ServiceName, Role } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { normalizeCarrierName } from "../src/upload/provider-normalize";

const prisma = new PrismaClient();

const SERVICES: ServiceName[] = ["SCCP", "DSX", "IPX"];

// The ~30 canonical Tier-1/Tier-2 international wholesale roaming carriers
// this platform recognizes. Provider Search shows only these (plus any
// genuinely distinct smaller/regional carrier an admin has separately
// approved via the Unmapped Providers queue) — everything else observed in
// source data is either an alias of one of these (see PROVIDER_ALIAS_SEED)
// or a composite string that gets split at ingestion time before it ever
// reaches ProviderMaster. Renaming an entry here changes what
// cleanup-canonical-allowlist.ts treats as a merge target on its next run —
// keep names in sync with that script's expectations.
const PROVIDERS = [
  { providerName: "Tata Comm", providerType: "IPX Provider", headquarters: "Mumbai, India", website: "https://www.tatacommunications.com" },
  { providerName: "BICS", providerType: "IPX Provider", headquarters: "Brussels, Belgium", website: "https://www.bics.com" },
  { providerName: "Syniverse", providerType: "IPX Provider", headquarters: "Tampa, USA", website: "https://www.syniverse.com" },
  { providerName: "Orange", providerType: "IPX Provider", headquarters: "Paris, France", website: "https://www.orange-ic.com" },
  { providerName: "Vodafone", providerType: "IPX Provider", headquarters: "Newbury, UK", website: "https://www.vodafone.com" },
  { providerName: "Comfone", providerType: "IPX Provider", headquarters: "Bern, Switzerland", website: "https://www.comfone.com" },
  { providerName: "Telstra", providerType: "IPX Provider", headquarters: "Melbourne, Australia", website: "https://www.telstra.com" },
  { providerName: "Arelion", providerType: "IPX Provider", headquarters: "Stockholm, Sweden", website: "https://www.arelion.com" },
  { providerName: "China Mobile", providerType: "IPX Provider", headquarters: "Hong Kong", website: "https://cmi.chinamobile.com" },
  { providerName: "China Telecom", providerType: "IPX Provider", headquarters: "Hong Kong", website: "https://www.chinatelecomglobal.com" },
  { providerName: "China Unicom", providerType: "IPX Provider", headquarters: "Hong Kong", website: "https://www.chinaunicomglobal.com" },
  { providerName: "Telefonica Global Solutions", providerType: "IPX Provider", headquarters: "Madrid, Spain", website: "https://www.telefonica.com" },
  { providerName: "iBasis", providerType: "IPX Provider", headquarters: "Massachusetts, USA", website: "https://www.ibasis.com" },
  { providerName: "Sparkle", providerType: "IPX Provider", headquarters: "Rome, Italy", website: "https://www.tisparkle.com" },
  { providerName: "Deutsche Telekom", providerType: "IPX Provider", headquarters: "Bonn, Germany", website: "https://www.telekom.com" },
  { providerName: "Singtel", providerType: "IPX Provider", headquarters: "Singapore", website: "https://www.singtel.com" },
  { providerName: "NTT Communications", providerType: "IPX Provider", headquarters: "Tokyo, Japan", website: "https://www.ntt.com" },
  { providerName: "Bayobab", providerType: "IPX Provider", headquarters: "Johannesburg, South Africa", website: "https://www.bayobab.com" },
  { providerName: "Airtel", providerType: "IPX Provider", headquarters: "New Delhi, India", website: "https://www.airtel.in" },
  { providerName: "Etisalat", providerType: "IPX Provider", headquarters: "Abu Dhabi, UAE", website: "https://www.eand.com" },
  { providerName: "Ooredoo", providerType: "IPX Provider", headquarters: "Doha, Qatar", website: "https://www.ooredoo.com" },
  { providerName: "STC", providerType: "IPX Provider", headquarters: "Riyadh, Saudi Arabia", website: "https://www.stc.com.sa" },
  { providerName: "PCCW Global", providerType: "IPX Provider", headquarters: "Hong Kong", website: "https://www.pccwglobal.com" },
  { providerName: "AT&T", providerType: "IPX Provider", headquarters: "Dallas, USA", website: "https://www.att.com" },
  { providerName: "Verizon", providerType: "IPX Provider", headquarters: "New Jersey, USA", website: "https://www.verizon.com" },
  { providerName: "Telenor Global Services", providerType: "IPX Provider", headquarters: "Oslo, Norway", website: "https://www.telenor.com" },
  { providerName: "A1 Telekom Austria", providerType: "IPX Provider", headquarters: "Vienna, Austria", website: "https://www.a1.group" },
  { providerName: "HGC", providerType: "IPX Provider", headquarters: "Hong Kong", website: "https://www.hgc.com.hk" },
  { providerName: "Cable & Wireless", providerType: "IPX Provider", headquarters: "London, UK", website: "https://www.cwc.com" },
  { providerName: "CITIC Telecom CPC", providerType: "IPX Provider", headquarters: "Hong Kong", website: "https://www.citictel-cpc.com" },
  { providerName: "Tele2", providerType: "IPX Provider", headquarters: "Stockholm, Sweden", website: "https://www.tele2.com" },
];

// Permanent system catch-all — NOT a real carrier. Junk/placeholder/protocol
// text encountered during ingestion (see isJunkProviderName in
// provider-normalize.ts) routes here automatically instead of either
// spawning a bogus ProviderMaster row or being silently dropped, so there's
// still an auditable record of "this MNO declared something unusable for
// this service" rather than a gap that looks like missing data.
const OTHERS_PROVIDER = {
  providerName: "Others / Unassigned",
  providerType: "Generic / Protocol Note",
  headquarters: "N/A",
  website: null as string | null,
};

// Baseline Tier-1/Tier-2 carrier aliases for the IR.21 XML provider-
// resolution engine — raw name variants actually seen in production source
// data, mapped to the canonical ProviderMaster row they should resolve to.
// Stored normalized (via normalizeCarrierName, the same function ingestion
// uses) so lookups at resolve-time always agree with what's seeded here.
// Deliberately excludes short, ambiguous abbreviations shared by more than
// one real company (e.g. bare "TGS" collides between Telefonica Global
// Solutions and Telenor Global Services) — those stay unresolved rather
// than guessed.
const PROVIDER_ALIAS_SEED: { providerName: string; variants: string[] }[] = [
  { providerName: "BICS", variants: ["BICS", "BIC", "Belgacom", "Belgacom BICS", "Belgacom International Carrier Services", "Belgacon International Carrier Services"] },
  { providerName: "Tata Comm", variants: ["Tata", "TataComm", "Tata Communications", "Tata Communications Ltd", "Tata Canada", "Tata India", "TCL", "Teleglobe"] },
  { providerName: "Syniverse", variants: ["Syniverse", "Synverse", "Syniverse ANSI", "Syniverse Technologies Inc", "Aicent"] },
  { providerName: "Orange", variants: ["Orange International Carriers", "Orange IC", "Orange Wholesale International", "FT", "France Telecom", "Orange INIS", "Orange International Networks Infrastructures and Services"] },
  { providerName: "Vodafone", variants: ["Vodafone IPX", "Vodafone Roaming Services", "Vodafone Carrier Services", "VRS", "VRS Hub", "International SCCP Gateway VRS Hub", "Vodafone Roaming Services S.a r.l"] },
  { providerName: "Comfone", variants: ["Comfone AG", "Comfone Switzerland"] },
  { providerName: "Telstra", variants: ["Telstra Global", "Telstra International", "Telstra International (Reach)", "Telstra Corporation Ltd"] },
  { providerName: "Arelion", variants: ["Telia", "TeliaSonera", "Telia Sonera", "Telia Carrier", "Arelion Ltd", "Arelion Carrier"] },
  { providerName: "China Mobile", variants: ["China Mobile International", "China Mobile International Limited", "CMI", "China Mobile IPX"] },
  { providerName: "China Telecom", variants: ["China Telecom Global", "CTG", "China Telecom Macau"] },
  { providerName: "China Unicom", variants: ["China Unicom Global"] },
  { providerName: "Telefonica Global Solutions", variants: ["Telefonica", "Telefónica", "Telefonica Global Solutions SLU", "Telefonica Business Solutions", "Telefonica Moviles Espana"] },
  { providerName: "iBasis", variants: ["iBasis GRX", "iBASIS TOFANE", "KPN iBasis", "IBNF"] },
  { providerName: "Sparkle", variants: ["Telecom Italia Sparkle", "TIS", "TI Sparkle", "Telecom Italy Sparkle"] },
  { providerName: "Deutsche Telekom", variants: ["Deutsche Telekom AG", "Deutsche Telekom Global Carrier", "T-Systems", "DT", "T-COM", "DTAG", "DTAG Global Network"] },
  { providerName: "NTT Communications", variants: ["NTT Com", "NTT"] },
  { providerName: "Bayobab", variants: ["Bayobab Africa", "MTN GlobalConnect"] },
  { providerName: "Airtel", variants: ["Bharti Airtel", "Airtel India", "Bharti Airtel International"] },
  { providerName: "Etisalat", variants: ["e&", "e and", "Emirates Telecommunications Corporation", "Etisalat IPX"] },
  { providerName: "STC", variants: ["Saudi Telecom", "Saudi Telecom Company", "stc KSA"] },
  { providerName: "PCCW Global", variants: ["PCCW", "PCCW Global HK Ltd", "Console Connect"] },
  { providerName: "AT&T", variants: ["AT and T", "AT&T Mobility"] },
  { providerName: "Verizon", variants: ["Verizon Partner Solutions"] },
  { providerName: "Telenor Global Services", variants: ["Telenor", "Telenor Linx", "Telenor Global Wholesale", "Telenor Global Service"] },
  { providerName: "A1 Telekom Austria", variants: ["A1 Telecom Austria", "A1 Telekom Austria AG", "A1 Group", "A1", "Telekom Austria"] },
  { providerName: "HGC", variants: ["Hutchison Global Communication", "HGC Global Communications Limited", "Hong Kong Telecommunications", "HKT"] },
  { providerName: "Cable & Wireless", variants: ["C&W", "C and W", "Liberty Latin America"] },
  { providerName: "CITIC Telecom CPC", variants: ["CITIC", "CITIC Telecom", "CITIC Telecom International Ltd", "Citicel HK", "Citicel"] },
  { providerName: "Tele2", variants: ["Tele2", "Tele2 AB", "Tele2 Sweden", "Tele2 International Carrier Services", "Tele2 Group"] },
];

// Sample/synthetic reference data — not sourced from any real GSMA IR.21 filing.
const MNOS = [
  { operatorName: "Vodafone Idea", country: "India", mcc: "404", mnc: "01", countryCode: "IN", tadigCode: "INDVI" },
  { operatorName: "Bharti Airtel", country: "India", mcc: "404", mnc: "45", countryCode: "IN", tadigCode: "INDAI" },
  { operatorName: "Reliance Jio", country: "India", mcc: "405", mnc: "857", countryCode: "IN", tadigCode: "INDRC" },
  { operatorName: "Jazz (Mobilink)", country: "Pakistan", mcc: "410", mnc: "01", countryCode: "PK", tadigCode: "PAKMO" },
  { operatorName: "Ufone", country: "Pakistan", mcc: "410", mnc: "03", countryCode: "PK", tadigCode: "PAKUF" },
  { operatorName: "Vodafone UK", country: "United Kingdom", mcc: "234", mnc: "15", countryCode: "GB", tadigCode: "GBRVF" },
  { operatorName: "O2 UK", country: "United Kingdom", mcc: "234", mnc: "10", countryCode: "GB", tadigCode: "GBRO2" },
  { operatorName: "Deutsche Telekom", country: "Germany", mcc: "262", mnc: "01", countryCode: "DE", tadigCode: "DEUDT" },
  { operatorName: "Vodafone Germany", country: "Germany", mcc: "262", mnc: "02", countryCode: "DE", tadigCode: "DEUVD" },
  { operatorName: "Orange France", country: "France", mcc: "208", mnc: "01", countryCode: "FR", tadigCode: "FRAOR" },
  { operatorName: "SFR France", country: "France", mcc: "208", mnc: "10", countryCode: "FR", tadigCode: "FRASF" },
  { operatorName: "AT&T Mobility", country: "United States", mcc: "310", mnc: "410", countryCode: "US", tadigCode: "USAAT" },
  { operatorName: "Verizon Wireless", country: "United States", mcc: "311", mnc: "480", countryCode: "US", tadigCode: "USAVZ" },
  { operatorName: "Vivo Brazil", country: "Brazil", mcc: "724", mnc: "06", countryCode: "BR", tadigCode: "BRAVV" },
  { operatorName: "Telstra", country: "Australia", mcc: "505", mnc: "01", countryCode: "AU", tadigCode: "AUSTL" },
];

type Ir21Row = { tadig: string; service: ServiceName; provider: string };
type ReachRow = { tadig: string; service: ServiceName; provider: string };

// IR.21-declared provider per (MNO, service) — the MNO's single published truth.
const IR21_ROWS: Ir21Row[] = [
  { tadig: "INDVI", service: "SCCP", provider: "Tata Comm" },
  { tadig: "INDVI", service: "DSX", provider: "Tata Comm" },
  { tadig: "INDVI", service: "IPX", provider: "Tata Comm" },

  { tadig: "INDAI", service: "SCCP", provider: "Syniverse" },
  { tadig: "INDAI", service: "DSX", provider: "BICS" },
  { tadig: "INDAI", service: "IPX", provider: "Tata Comm" },

  { tadig: "INDRC", service: "SCCP", provider: "Tata Comm" },
  { tadig: "INDRC", service: "DSX", provider: "Tata Comm" },
  { tadig: "INDRC", service: "IPX", provider: "Comfone" },

  { tadig: "PAKMO", service: "SCCP", provider: "BICS" },
  { tadig: "PAKMO", service: "DSX", provider: "BICS" },
  { tadig: "PAKMO", service: "IPX", provider: "BICS" },

  { tadig: "PAKUF", service: "DSX", provider: "Syniverse" },
  // PAKUF has no IR21 SCCP/IPX provider on file — IPX is claimed only in a reachlist below.

  { tadig: "GBRVF", service: "SCCP", provider: "Comfone" },
  { tadig: "GBRVF", service: "DSX", provider: "Comfone" },
  { tadig: "GBRVF", service: "IPX", provider: "Orange" },

  { tadig: "GBRO2", service: "SCCP", provider: "Tata Comm" },
  { tadig: "GBRO2", service: "DSX", provider: "Telefonica Global Solutions" },
  { tadig: "GBRO2", service: "IPX", provider: "Tata Comm" },

  { tadig: "DEUDT", service: "SCCP", provider: "BICS" },
  { tadig: "DEUDT", service: "DSX", provider: "BICS" },
  { tadig: "DEUDT", service: "IPX", provider: "Arelion" },

  { tadig: "DEUVD", service: "SCCP", provider: "Tata Comm" },
  { tadig: "DEUVD", service: "DSX", provider: "Syniverse" },
  { tadig: "DEUVD", service: "IPX", provider: "Syniverse" },

  { tadig: "FRAOR", service: "SCCP", provider: "Orange" },
  { tadig: "FRAOR", service: "DSX", provider: "Orange" },
  { tadig: "FRAOR", service: "IPX", provider: "Orange" },

  { tadig: "FRASF", service: "SCCP", provider: "Comfone" },
  { tadig: "FRASF", service: "DSX", provider: "Tata Comm" },
  { tadig: "FRASF", service: "IPX", provider: "BICS" },

  { tadig: "USAAT", service: "SCCP", provider: "Syniverse" },
  { tadig: "USAAT", service: "DSX", provider: "Syniverse" },
  { tadig: "USAAT", service: "IPX", provider: "Syniverse" },

  { tadig: "USAVZ", service: "SCCP", provider: "BICS" },
  { tadig: "USAVZ", service: "DSX", provider: "Comfone" },
  { tadig: "USAVZ", service: "IPX", provider: "Tata Comm" },

  { tadig: "BRAVV", service: "SCCP", provider: "iBasis" },
  { tadig: "BRAVV", service: "DSX", provider: "iBasis" },
  { tadig: "BRAVV", service: "IPX", provider: "iBasis" },
  // AUSTL has no IR21 rows on file at all.
];

// Reach-list rows, as if each provider published its own file independently —
// deliberately diverges from IR21 in several places to seed discrepancies.
const REACHLIST_ROWS: ReachRow[] = [
  { tadig: "INDVI", service: "SCCP", provider: "Tata Comm" },
  { tadig: "INDVI", service: "DSX", provider: "Tata Comm" },
  { tadig: "INDVI", service: "IPX", provider: "Tata Comm" },

  { tadig: "INDAI", service: "IPX", provider: "Tata Comm" },
  { tadig: "INDAI", service: "DSX", provider: "BICS" },
  // Syniverse's own reachlist omits INDAI/SCCP -> MISSING_IN_REACHLIST

  { tadig: "INDRC", service: "IPX", provider: "Comfone" },
  // Tata Comm's reachlist omits INDRC entirely -> two MISSING_IN_REACHLIST (SCCP, DSX)

  { tadig: "PAKMO", service: "SCCP", provider: "BICS" },
  { tadig: "PAKMO", service: "DSX", provider: "BICS" },
  { tadig: "PAKMO", service: "IPX", provider: "BICS" },

  { tadig: "PAKUF", service: "DSX", provider: "Syniverse" },
  { tadig: "PAKUF", service: "IPX", provider: "Tata Comm" },
  // Tata Comm reachlist claims PAKUF/IPX but IR21 has no IPX provider -> MISSING_IN_IR21 (opportunity)

  { tadig: "GBRVF", service: "SCCP", provider: "Comfone" },
  // Comfone reachlist omits GBRVF/DSX -> MISSING_IN_REACHLIST
  { tadig: "GBRVF", service: "IPX", provider: "Orange" },

  { tadig: "GBRO2", service: "SCCP", provider: "Tata Comm" },
  { tadig: "GBRO2", service: "IPX", provider: "Tata Comm" },
  // Telefonica reachlist omits GBRO2/DSX -> MISSING_IN_REACHLIST (Tata Comm displacement opportunity)

  { tadig: "DEUDT", service: "SCCP", provider: "BICS" },
  { tadig: "DEUDT", service: "DSX", provider: "BICS" },
  { tadig: "DEUDT", service: "IPX", provider: "Arelion" },

  { tadig: "DEUVD", service: "SCCP", provider: "Tata Comm" },
  { tadig: "DEUVD", service: "IPX", provider: "Syniverse" },
  { tadig: "DEUVD", service: "IPX", provider: "BICS" },
  // BICS independently claims DEUVD/IPX while IR21 says Syniverse -> PROVIDER_MISMATCH
  // Syniverse reachlist omits DEUVD/DSX -> MISSING_IN_REACHLIST

  { tadig: "FRAOR", service: "SCCP", provider: "Orange" },
  { tadig: "FRAOR", service: "DSX", provider: "Orange" },
  { tadig: "FRAOR", service: "IPX", provider: "Orange" },

  { tadig: "FRASF", service: "SCCP", provider: "Comfone" },
  { tadig: "FRASF", service: "IPX", provider: "BICS" },
  // Tata Comm reachlist omits FRASF/DSX -> MISSING_IN_REACHLIST (opportunity)

  { tadig: "USAAT", service: "SCCP", provider: "Syniverse" },
  { tadig: "USAAT", service: "DSX", provider: "Syniverse" },
  { tadig: "USAAT", service: "IPX", provider: "Syniverse" },

  { tadig: "USAVZ", service: "SCCP", provider: "BICS" },
  { tadig: "USAVZ", service: "SCCP", provider: "Tata Comm" },
  // Tata Comm independently claims USAVZ/SCCP while IR21 says BICS -> PROVIDER_MISMATCH
  { tadig: "USAVZ", service: "DSX", provider: "Comfone" },
  { tadig: "USAVZ", service: "IPX", provider: "Tata Comm" },

  { tadig: "BRAVV", service: "SCCP", provider: "iBasis" },
  { tadig: "BRAVV", service: "IPX", provider: "iBasis" },
  // iBasis reachlist omits BRAVV/DSX -> MISSING_IN_REACHLIST

  { tadig: "AUSTL", service: "IPX", provider: "Tata Comm" },
  // Tata Comm reachlist claims AUSTL/IPX but MNO has no IR21 on file at all -> MISSING_IN_IR21 (white-space opportunity)
];

async function main() {
  console.log("Seeding services...");
  const serviceRecords = new Map<ServiceName, { id: number }>();
  for (const name of SERVICES) {
    const svc = await prisma.service.upsert({
      where: { serviceName: name },
      update: {},
      create: { serviceName: name },
    });
    serviceRecords.set(name, svc);
  }

  console.log("Seeding providers...");
  const providerRecords = new Map<string, { id: number }>();
  for (const p of [...PROVIDERS, OTHERS_PROVIDER]) {
    const rec = await prisma.providerMaster.upsert({
      where: { providerName: p.providerName },
      update: {},
      create: p,
    });
    providerRecords.set(p.providerName, rec);
  }

  console.log("Seeding provider aliases...");
  for (const { providerName, variants } of PROVIDER_ALIAS_SEED) {
    const provider = providerRecords.get(providerName);
    if (!provider) continue;
    for (const variant of variants) {
      const aliasPattern = normalizeCarrierName(variant);
      if (!aliasPattern) continue;
      await prisma.providerAlias.upsert({
        where: { aliasPattern },
        update: { providerId: provider.id },
        create: { providerId: provider.id, aliasPattern },
      });
    }
  }

  console.log("Seeding MNOs...");
  const mnoRecords = new Map<string, { id: number }>();
  for (const m of MNOS) {
    const rec = await prisma.mnoMaster.upsert({
      where: { tadigCode: m.tadigCode },
      update: {},
      create: { ...m, status: "ACTIVE" },
    });
    mnoRecords.set(m.tadigCode, rec);
  }

  console.log("Seeding IR21 connectivity...");
  const effectiveDate = new Date();
  for (const row of IR21_ROWS) {
    await prisma.ir21Connectivity.upsert({
      where: {
        mnoId_serviceId: {
          mnoId: mnoRecords.get(row.tadig)!.id,
          serviceId: serviceRecords.get(row.service)!.id,
        },
      },
      update: {},
      create: {
        mnoId: mnoRecords.get(row.tadig)!.id,
        providerId: providerRecords.get(row.provider)!.id,
        serviceId: serviceRecords.get(row.service)!.id,
        sourceFile: "seed-sample-ir21.xlsx",
        effectiveDate,
      },
    });
  }

  console.log("Seeding reach list entries...");
  for (const row of REACHLIST_ROWS) {
    await prisma.providerReachlist.upsert({
      where: {
        mnoId_providerId_serviceId: {
          mnoId: mnoRecords.get(row.tadig)!.id,
          providerId: providerRecords.get(row.provider)!.id,
          serviceId: serviceRecords.get(row.service)!.id,
        },
      },
      update: {},
      create: {
        mnoId: mnoRecords.get(row.tadig)!.id,
        providerId: providerRecords.get(row.provider)!.id,
        serviceId: serviceRecords.get(row.service)!.id,
        sourceFile: `seed-sample-reachlist-${row.provider.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.xlsx`,
        effectiveDate,
      },
    });
  }

  console.log("Seeding users...");
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@ccip.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "Admin@12345";
  // update (not `{}`) so re-running always converges the password/role to
  // whatever's currently configured, instead of silently keeping whatever
  // was set on a prior (possibly broken) deploy's first-ever seed run.
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash: adminPasswordHash, role: Role.ADMIN },
    create: { email: adminEmail, passwordHash: adminPasswordHash, role: Role.ADMIN },
  });
  const analystPasswordHash = await bcrypt.hash("Analyst@12345", 10);
  await prisma.user.upsert({
    where: { email: "analyst@ccip.local" },
    update: { passwordHash: analystPasswordHash, role: Role.ANALYST },
    create: { email: "analyst@ccip.local", passwordHash: analystPasswordHash, role: Role.ANALYST },
  });
  const viewerPasswordHash = await bcrypt.hash("Viewer@12345", 10);
  await prisma.user.upsert({
    where: { email: "viewer@ccip.local" },
    update: { passwordHash: viewerPasswordHash, role: Role.VIEWER },
    create: { email: "viewer@ccip.local", passwordHash: viewerPasswordHash, role: Role.VIEWER },
  });

  console.log("Seed complete.");
  console.log(`Admin login: ${adminEmail} / ${adminPassword}`);
  console.log("Analyst login: analyst@ccip.local / Analyst@12345");
  console.log("Viewer login: viewer@ccip.local / Viewer@12345");
  console.log("Run POST /api/comparison/run after seeding to populate discrepancies.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
