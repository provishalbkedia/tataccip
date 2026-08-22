// Second-pass cleanup: collapses ProviderMaster down toward the ~30 seeded
// canonical Tier-1/Tier-2 carriers (see prisma/seed.ts's PROVIDERS list),
// while keeping genuinely distinct smaller/regional carriers (Beltelecom,
// Sierra Wireless, SBIN, etc.) as their own standalone rows rather than
// forcing them into the nearest Tier-1 name or deleting their connectivity
// data — Ir21Connectivity.providerId is a required (non-nullable) foreign
// key, so there is no "unassigned" bucket to fall back to without a schema
// migration.
//
// IMPORTANT: run `npx ts-node prisma/seed.ts` against the target database
// FIRST, so the 30 canonical rows exist under their exact seed.ts names —
// this script only treats rows with those exact names as valid Tier-1
// merge targets.
//
// SAFETY: dry-run by default — prints a full classification report and
// touches nothing. Composite rows are split and every token resolved
// independently: tokens matching a canonical name/alias merge there, other
// tokens become (or reuse) their own standalone provider. Only genuinely
// unparseable rows (no tokens at all) are left for manual review.
//
// Usage:
//   DATABASE_URL="..." npx ts-node scripts/cleanup-canonical-allowlist.ts              # dry run
//   DATABASE_URL="..." npx ts-node scripts/cleanup-canonical-allowlist.ts --apply       # apply

import { PrismaClient } from "@prisma/client";
import { isConfidentSubstringMatch, normalizeCarrierName, splitCompositeProviderNames } from "../src/upload/provider-normalize";

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const APPLY = process.argv.includes("--apply");

// Must match prisma/seed.ts's PROVIDERS list exactly.
const CANONICAL_NAMES = [
  "Tata Comm", "BICS", "Syniverse", "Orange", "Vodafone", "Comfone", "Telstra", "Arelion",
  "China Mobile", "China Telecom", "China Unicom", "Telefonica Global Solutions", "iBasis",
  "Sparkle", "Deutsche Telekom", "Singtel", "NTT Communications", "Bayobab", "Airtel",
  "Etisalat", "Ooredoo", "STC", "PCCW Global", "AT&T", "Verizon", "Telenor Global Services",
  "A1 Telekom Austria", "HGC", "Cable & Wireless", "CITIC Telecom CPC",
];

// Post-normalization forms — normalizeCarrierName already strips generic
// words like "carrier"/"carriers", so "SCCP Carrier" normalizes to "sccp",
// not "sccp carrier". Using the pre-strip form here would silently never
// match anything.
const KNOWN_JUNK_NAMES = new Set(["na", "n a", "sccp", "ipx", "grx", "dsx", "unknown", "tbd", "not applicable"]);

interface ProviderRow {
  id: number;
  providerName: string;
  ir21Count: number;
  reachCount: number;
}

async function main() {
  const providers = await prisma.providerMaster.findMany();
  const ir21Counts = await prisma.ir21Connectivity.groupBy({ by: ["providerId"], _count: true });
  const reachCounts = await prisma.providerReachlist.groupBy({ by: ["providerId"], _count: true });
  const ir21CountMap = new Map(ir21Counts.map((c) => [c.providerId, c._count]));
  const reachCountMap = new Map(reachCounts.map((c) => [c.providerId, c._count]));

  const rows: ProviderRow[] = providers.map((p) => ({
    id: p.id,
    providerName: p.providerName,
    ir21Count: ir21CountMap.get(p.id) ?? 0,
    reachCount: reachCountMap.get(p.id) ?? 0,
  }));

  const canonicalRows = rows.filter((r) => CANONICAL_NAMES.includes(r.providerName));
  const missing = CANONICAL_NAMES.filter((n) => !canonicalRows.some((r) => r.providerName === n));
  if (missing.length > 0) {
    console.error(`Missing canonical provider(s) — run "npx ts-node prisma/seed.ts" against this database first:\n  ${missing.join("\n  ")}`);
    process.exit(1);
  }
  const canonicalIds = new Set(canonicalRows.map((r) => r.id));

  const aliasRows = await prisma.providerAlias.findMany();
  // Only trust aliases that already point at a canonical row — aliases left
  // over from the previous cleanup pass may point at a row that's about to
  // be merged away in *this* pass; those get re-resolved via fuzzy matching
  // against the canonical rows' own names instead.
  const aliasIndex = aliasRows
    .filter((a) => canonicalIds.has(a.providerId))
    .map((a) => ({ pattern: a.aliasPattern, row: canonicalRows.find((r) => r.id === a.providerId)! }))
    .sort((a, b) => b.pattern.length - a.pattern.length);

  const canonicalIndex = canonicalRows
    .map((r) => ({ pattern: normalizeCarrierName(r.providerName), row: r }))
    .sort((a, b) => b.pattern.length - a.pattern.length);

  function resolveToCanonical(token: string): ProviderRow | null {
    const normalized = normalizeCarrierName(token);
    if (!normalized || KNOWN_JUNK_NAMES.has(normalized)) return null;
    for (const { pattern, row } of aliasIndex) if (normalized === pattern) return row;
    for (const { pattern, row } of canonicalIndex) if (normalized === pattern) return row;
    for (const { pattern, row } of aliasIndex) if (isConfidentSubstringMatch(normalized, pattern)) return row;
    for (const { pattern, row } of canonicalIndex) if (isConfidentSubstringMatch(normalized, pattern)) return row;
    return null;
  }

  // Phase A: among non-canonical *simple* rows (not composite/role-junk —
  // splitting returns the row's own name unchanged) that don't match a
  // canonical, dedupe exact-spelling-variant groups and pick one survivor
  // per group. These become the "keep as own provider" standalone tier.
  const nonCanonicalRows = rows.filter((r) => !canonicalIds.has(r.id));
  const simpleRows = nonCanonicalRows.filter((r) => {
    const tokens = splitCompositeProviderNames(r.providerName);
    return tokens.length === 1 && tokens[0] === r.providerName.trim();
  });

  const standaloneByNormalized = new Map<string, ProviderRow[]>();
  for (const r of simpleRows) {
    if (resolveToCanonical(r.providerName)) continue; // matches a Tier-1 canonical, handled in phase B
    const key = normalizeCarrierName(r.providerName);
    if (!key || KNOWN_JUNK_NAMES.has(key)) continue;
    const group = standaloneByNormalized.get(key) ?? [];
    group.push(r);
    standaloneByNormalized.set(key, group);
  }

  const standaloneOf = new Map<number, ProviderRow>();
  const standaloneIndex: { pattern: string; row: ProviderRow }[] = [];
  for (const [pattern, group] of standaloneByNormalized) {
    const survivor = group.reduce((best, r) => (r.ir21Count + r.reachCount > best.ir21Count + best.reachCount ? r : best));
    standaloneIndex.push({ pattern, row: survivor });
    for (const r of group) standaloneOf.set(r.id, survivor);
  }
  standaloneIndex.sort((a, b) => b.pattern.length - a.pattern.length);

  function resolveToken(token: string): { row: ProviderRow; isNewStandalone: false } | { row: null; isNewStandalone: true; cleanName: string } | null {
    const canonical = resolveToCanonical(token);
    if (canonical) return { row: canonical, isNewStandalone: false };

    const normalized = normalizeCarrierName(token);
    if (!normalized || KNOWN_JUNK_NAMES.has(normalized)) return null;
    for (const { pattern, row } of standaloneIndex) {
      if (isConfidentSubstringMatch(normalized, pattern)) return { row, isNewStandalone: false };
    }
    return { row: null, isNewStandalone: true, cleanName: token.trim() };
  }

  type Plan =
    | { kind: "alias"; source: ProviderRow; target: ProviderRow }
    | { kind: "resolved"; source: ProviderRow; targets: (ProviderRow | { newName: string })[] }
    | { kind: "unresolved"; source: ProviderRow };

  const plans: Plan[] = [];

  for (const r of simpleRows) {
    const canonical = resolveToCanonical(r.providerName);
    if (canonical) {
      plans.push({ kind: "alias", source: r, target: canonical });
      continue;
    }
    // Rows with no standaloneOf entry normalize to empty/junk (e.g. a lone
    // "N/A") — left completely unclassified rather than merged anywhere.
    const standalone = standaloneOf.get(r.id);
    if (standalone && standalone.id !== r.id) plans.push({ kind: "alias", source: r, target: standalone });
  }

  const compositeRows = nonCanonicalRows.filter((r) => !simpleRows.includes(r));
  const newStandaloneNames = new Map<string, { newName: string }>(); // normalized -> placeholder, dedup within this run
  for (const r of compositeRows) {
    const tokens = splitCompositeProviderNames(r.providerName);
    if (tokens.length === 0) {
      plans.push({ kind: "unresolved", source: r });
      continue;
    }
    const targets: (ProviderRow | { newName: string })[] = [];
    for (const token of tokens) {
      const resolved = resolveToken(token);
      if (!resolved) continue; // junk token (e.g. "NA"), skip it, not the whole row
      if (!resolved.isNewStandalone) {
        targets.push(resolved.row);
      } else {
        const key = normalizeCarrierName(resolved.cleanName);
        const existing = newStandaloneNames.get(key);
        if (existing) {
          targets.push(existing);
        } else {
          const placeholder = { newName: resolved.cleanName };
          newStandaloneNames.set(key, placeholder);
          targets.push(placeholder);
        }
      }
    }
    if (targets.length === 0) {
      plans.push({ kind: "unresolved", source: r });
      continue;
    }
    plans.push({ kind: "resolved", source: r, targets });
  }

  const aliasCount = plans.filter((p) => p.kind === "alias").length;
  const resolvedCount = plans.filter((p) => p.kind === "resolved").length;
  const unresolvedCount = plans.filter((p) => p.kind === "unresolved").length;
  const newStandaloneCount = newStandaloneNames.size;

  console.log(`ProviderMaster rows: ${rows.length} (${canonicalRows.length} canonical, ${nonCanonicalRows.length} non-canonical)`);
  console.log(`\nPlan:`);
  console.log(`  Simple-row alias merges: ${aliasCount}`);
  console.log(`  Composite rows split & resolved: ${resolvedCount}`);
  console.log(`  New standalone providers to create: ${newStandaloneCount}`);
  console.log(`  UNRESOLVED (no parseable tokens at all): ${unresolvedCount}`);
  console.log(`  Projected ProviderMaster rows after cleanup: ~${canonicalRows.length + standaloneIndex.length + newStandaloneCount + unresolvedCount}`);

  console.log(`\n--- Sample alias merges (first 20) ---`);
  plans.filter((p) => p.kind === "alias").slice(0, 20).forEach((p) => {
    const a = p as Extract<Plan, { kind: "alias" }>;
    console.log(`  [${a.source.id}] "${a.source.providerName}" -> [${a.target.id}] "${a.target.providerName}"`);
  });

  console.log(`\n--- Sample composite resolutions (first 20) ---`);
  plans.filter((p) => p.kind === "resolved").slice(0, 20).forEach((p) => {
    const c = p as Extract<Plan, { kind: "resolved" }>;
    const desc = c.targets.map((t) => ("newName" in t ? `NEW:"${t.newName}"` : `[${t.id}]${t.providerName}`)).join(", ");
    console.log(`  [${c.source.id}] "${c.source.providerName}" -> ${desc}`);
  });

  console.log(`\n--- UNRESOLVED (first 20) ---`);
  plans.filter((p) => p.kind === "unresolved").slice(0, 20).forEach((p) => {
    console.log(`  [${p.source.id}] "${p.source.providerName}"`);
  });

  console.log(`\n--- New standalone providers that would be created (first 40) ---`);
  Array.from(newStandaloneNames.values()).slice(0, 40).forEach((p) => console.log(`  "${p.newName}"`));

  if (!APPLY) {
    console.log(`\nDry run only — no changes made. Re-run with --apply to execute.`);
    return;
  }

  console.log(`\nAPPLYING...`);
  const createdIds = new Map<string, number>(); // cleanName -> new providerId, resolved on first use during apply
  let applied = 0;

  async function targetId(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], t: ProviderRow | { newName: string }): Promise<number> {
    if (!("newName" in t)) return t.id;
    const key = normalizeCarrierName(t.newName);
    const existing = createdIds.get(key);
    if (existing) return existing;
    const created = await tx.providerMaster.create({ data: { providerName: t.newName, providerType: "IPX Provider" } });
    createdIds.set(key, created.id);
    return created.id;
  }

  for (const plan of plans) {
    if (plan.kind === "unresolved") continue;
    const source = plan.source;

    await prisma.$transaction(async (tx) => {
      const targets = plan.kind === "alias" ? [plan.target] : plan.targets;
      const targetIds: number[] = [];
      for (const t of targets) targetIds.push(await targetId(tx, t));
      const primaryTargetId = targetIds[0];
      const distinctTargetIds = Array.from(new Set(targetIds));

      const ir21Rows = await tx.ir21Connectivity.findMany({ where: { providerId: source.id } });
      for (const row of ir21Rows) {
        const conflict = await tx.ir21Connectivity.findUnique({
          where: { mnoId_serviceId: { mnoId: row.mnoId, serviceId: row.serviceId } },
        });
        if (conflict && conflict.providerId !== source.id) {
          await tx.ir21Connectivity.delete({ where: { id: row.id } });
        } else {
          await tx.ir21Connectivity.update({ where: { id: row.id }, data: { providerId: primaryTargetId } });
        }
      }

      const reachRows = await tx.providerReachlist.findMany({ where: { providerId: source.id } });
      for (const row of reachRows) {
        for (const tid of distinctTargetIds) {
          const conflict = await tx.providerReachlist.findUnique({
            where: { mnoId_providerId_serviceId: { mnoId: row.mnoId, providerId: tid, serviceId: row.serviceId } },
          });
          if (!conflict) {
            await tx.providerReachlist.create({
              data: { mnoId: row.mnoId, providerId: tid, serviceId: row.serviceId, sourceFile: row.sourceFile, effectiveDate: row.effectiveDate },
            });
          }
        }
        await tx.providerReachlist.delete({ where: { id: row.id } });
      }

      await tx.dataDiscrepancy.updateMany({ where: { providerId: source.id }, data: { providerId: primaryTargetId } });
      await tx.unmappedProviderVariant.updateMany({ where: { resolvedProviderId: source.id }, data: { resolvedProviderId: primaryTargetId } });
      await tx.providerAlias.updateMany({ where: { providerId: source.id }, data: { providerId: primaryTargetId } });

      if (plan.kind === "alias") {
        const pattern = normalizeCarrierName(source.providerName);
        if (pattern) {
          await tx.providerAlias.upsert({
            where: { aliasPattern: pattern },
            update: { providerId: primaryTargetId },
            create: { aliasPattern: pattern, providerId: primaryTargetId },
          });
        }
      }

      await tx.providerMaster.delete({ where: { id: source.id } });
    }, { maxWait: 20000, timeout: 60000 });

    applied++;
    if (applied % 25 === 0) console.log(`  ...${applied} done`);
  }

  console.log(`Applied ${applied} merges/splits. Created ${createdIds.size} new standalone providers. ${unresolvedCount} rows left untouched.`);
  console.log(`Run POST /api/comparison/run afterward to recompute discrepancies.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
