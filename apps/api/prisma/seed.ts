import "dotenv/config";
import { PrismaClient, ServiceName, Role } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

const SERVICES: ServiceName[] = ["SCCP", "DSX", "IPX"];

const PROVIDERS = [
  { providerName: "Tata Comm", providerType: "IPX Provider", headquarters: "Mumbai, India", website: "https://www.tatacommunications.com" },
  { providerName: "Syniverse", providerType: "IPX Provider", headquarters: "Tampa, USA", website: "https://www.syniverse.com" },
  { providerName: "BICS", providerType: "IPX Provider", headquarters: "Brussels, Belgium", website: "https://www.bics.com" },
  { providerName: "Comfone", providerType: "IPX Provider", headquarters: "Bern, Switzerland", website: "https://www.comfone.com" },
  { providerName: "Orange International Carriers", providerType: "IPX Provider", headquarters: "Paris, France", website: "https://www.orange-ic.com" },
  { providerName: "Telefonica Global Solutions", providerType: "IPX Provider", headquarters: "Madrid, Spain", website: "https://www.telefonica.com" },
  { providerName: "Arelion", providerType: "IPX Provider", headquarters: "Stockholm, Sweden", website: "https://www.arelion.com" },
  { providerName: "iBasis", providerType: "IPX Provider", headquarters: "Massachusetts, USA", website: "https://www.ibasis.com" },
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
  { tadig: "GBRVF", service: "IPX", provider: "Orange International Carriers" },

  { tadig: "GBRO2", service: "SCCP", provider: "Tata Comm" },
  { tadig: "GBRO2", service: "DSX", provider: "Telefonica Global Solutions" },
  { tadig: "GBRO2", service: "IPX", provider: "Tata Comm" },

  { tadig: "DEUDT", service: "SCCP", provider: "BICS" },
  { tadig: "DEUDT", service: "DSX", provider: "BICS" },
  { tadig: "DEUDT", service: "IPX", provider: "Arelion" },

  { tadig: "DEUVD", service: "SCCP", provider: "Tata Comm" },
  { tadig: "DEUVD", service: "DSX", provider: "Syniverse" },
  { tadig: "DEUVD", service: "IPX", provider: "Syniverse" },

  { tadig: "FRAOR", service: "SCCP", provider: "Orange International Carriers" },
  { tadig: "FRAOR", service: "DSX", provider: "Orange International Carriers" },
  { tadig: "FRAOR", service: "IPX", provider: "Orange International Carriers" },

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
  { tadig: "GBRVF", service: "IPX", provider: "Orange International Carriers" },

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

  { tadig: "FRAOR", service: "SCCP", provider: "Orange International Carriers" },
  { tadig: "FRAOR", service: "DSX", provider: "Orange International Carriers" },
  { tadig: "FRAOR", service: "IPX", provider: "Orange International Carriers" },

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
  for (const p of PROVIDERS) {
    const rec = await prisma.providerMaster.upsert({
      where: { providerName: p.providerName },
      update: {},
      create: p,
    });
    providerRecords.set(p.providerName, rec);
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
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: Role.ADMIN,
    },
  });
  await prisma.user.upsert({
    where: { email: "analyst@ccip.local" },
    update: {},
    create: {
      email: "analyst@ccip.local",
      passwordHash: await bcrypt.hash("Analyst@12345", 10),
      role: Role.ANALYST,
    },
  });
  await prisma.user.upsert({
    where: { email: "viewer@ccip.local" },
    update: {},
    create: {
      email: "viewer@ccip.local",
      passwordHash: await bcrypt.hash("Viewer@12345", 10),
      role: Role.VIEWER,
    },
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
