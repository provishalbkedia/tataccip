// One-off cleanup for ProviderMaster rows created before ingestion split
// composite carrier strings (see provider-normalize.ts) — merges spelling
// variants into their canonical provider and splits/re-links composite rows
// like "Arelion, CMI, BBIX" into their individual canonical providers.
//
// SAFETY: dry-run by default — prints a full classification report and
// touches nothing. Real-world provider names turned out messier than any
// regex heuristic can fully resolve (8-way composites, protocol annotations,
// typos), so rows where any split token doesn't confidently match an
// existing canonical provider are classified UNRESOLVED and are NEVER
// auto-applied, even in --apply mode — they're listed for manual review.
//
// Usage:
//   DATABASE_URL="..." npx ts-node scripts/cleanup-provider-master.ts              # dry run
//   DATABASE_URL="..." npx ts-node scripts/cleanup-provider-master.ts --apply       # apply RESOLVED cases only

import { PrismaClient } from "@prisma/client";
import { isConfidentSubstringMatch, normalizeCarrierName, splitCompositeProviderNames } from "../src/upload/provider-normalize";

// Rows seen in production that are clearly not real carrier names — generic
// placeholders, blank-value artifacts, or free-text notes that ended up
// stored as a "provider" — never valid resolution targets, and reported as
// unresolved instead of silently absorbing tokens into them.
// Post-normalization forms — normalizeCarrierName already strips generic
// words like "carrier"/"carriers", so "SCCP Carrier" normalizes to "sccp",
// not "sccp carrier". Using the pre-strip form here would silently never
// match anything.
const KNOWN_JUNK_NAMES = new Set(["na", "n a", "sccp", "ipx", "grx", "dsx", "unknown", "tbd", "not applicable"]);

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const APPLY = process.argv.includes("--apply");

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

  // "Simple" rows: splitting produces exactly the original name back — not
  // composite, not role-qualifier junk. These are the only candidates to
  // become canonical providers; everything else must resolve TO one of them
  // (or an existing seeded ProviderAlias) or be left UNRESOLVED.
  const simpleRows = rows.filter((r) => {
    const tokens = splitCompositeProviderNames(r.providerName);
    return tokens.length === 1 && tokens[0] === r.providerName.trim();
  });
  const compositeRows = rows.filter((r) => !simpleRows.includes(r));

  // Group simple rows by normalized name; the one with the most existing
  // relationships in each group becomes canonical, the rest become aliases.
  const byNormalized = new Map<string, ProviderRow[]>();
  for (const r of simpleRows) {
    const key = normalizeCarrierName(r.providerName);
    if (!key) continue;
    const group = byNormalized.get(key) ?? [];
    group.push(r);
    byNormalized.set(key, group);
  }

  const canonicalOf = new Map<number, ProviderRow>(); // sourceId -> canonical row (identity map for canonicals themselves)
  const canonicalIndex: { pattern: string; row: ProviderRow }[] = [];
  for (const [pattern, group] of byNormalized) {
    if (KNOWN_JUNK_NAMES.has(pattern)) continue; // never a valid merge target
    const canonical = group.reduce((best, r) =>
      r.ir21Count + r.reachCount > best.ir21Count + best.reachCount ? r : best,
    );
    canonicalIndex.push({ pattern, row: canonical });
    for (const r of group) canonicalOf.set(r.id, canonical);
  }
  // Longest pattern first, so "belgacom international carrier services"
  // matches before the shorter "belgacom" when both are present.
  canonicalIndex.sort((a, b) => b.pattern.length - a.pattern.length);

  const existingAliases = await prisma.providerAlias.findMany({ include: { provider: true } });
  const aliasIndex = existingAliases
    .map((a) => ({ pattern: a.aliasPattern, row: rows.find((r) => r.id === a.providerId)! }))
    .filter((a) => a.row && !KNOWN_JUNK_NAMES.has(a.pattern))
    .sort((a, b) => b.pattern.length - a.pattern.length);

  function resolveToken(token: string): ProviderRow | null {
    const normalized = normalizeCarrierName(token);
    if (!normalized || KNOWN_JUNK_NAMES.has(normalized)) return null;
    for (const { pattern, row } of aliasIndex) {
      if (normalized === pattern) return row;
    }
    for (const { pattern, row } of canonicalIndex) {
      if (normalized === pattern) return row;
    }
    for (const { pattern, row } of aliasIndex) {
      if (isConfidentSubstringMatch(normalized, pattern)) return row;
    }
    for (const { pattern, row } of canonicalIndex) {
      if (isConfidentSubstringMatch(normalized, pattern)) return row;
    }
    return null;
  }

  type Plan =
    | { kind: "alias"; source: ProviderRow; target: ProviderRow }
    | { kind: "composite-resolved"; source: ProviderRow; targets: ProviderRow[] }
    | { kind: "unresolved"; source: ProviderRow; tokens: string[]; unresolvedTokens: string[] };

  const plans: Plan[] = [];

  // Simple rows that turned out to be aliases of a *different* row's canonical.
  // (Rows whose own name normalizes to a known-junk pattern, e.g. "NA" or
  // "SCCP Carrier", have no canonicalOf entry — left unclassified rather
  // than merged into anything.)
  for (const r of simpleRows) {
    const canonical = canonicalOf.get(r.id);
    if (canonical && canonical.id !== r.id) {
      plans.push({ kind: "alias", source: r, target: canonical });
    }
  }

  // Composite/role-junk rows: resolve every split token.
  for (const r of compositeRows) {
    const tokens = splitCompositeProviderNames(r.providerName);
    if (tokens.length === 0) {
      plans.push({ kind: "unresolved", source: r, tokens, unresolvedTokens: [r.providerName] });
      continue;
    }
    const resolved = tokens.map((t) => ({ token: t, row: resolveToken(t) }));
    const unresolvedTokens = resolved.filter((x) => !x.row).map((x) => x.token);
    if (unresolvedTokens.length > 0) {
      plans.push({ kind: "unresolved", source: r, tokens, unresolvedTokens });
      continue;
    }
    const targets = Array.from(new Set(resolved.map((x) => x.row!.id))).map((id) => resolved.find((x) => x.row!.id === id)!.row!);
    if (targets.length === 1 && targets[0].id === r.id) continue; // resolves to itself, nothing to do
    plans.push({ kind: "composite-resolved", source: r, targets });
  }

  // A plan's target was captured before any deletions happen, but that same
  // target row might itself be a `source` in a different plan (e.g. it's a
  // simple duplicate of some other row) and so won't exist by the time this
  // plan actually runs. Follow each target through the source->target chain
  // to whatever it ultimately resolves to, so every target used at apply
  // time is guaranteed to still exist.
  const sourceToPrimaryTarget = new Map<number, ProviderRow>();
  for (const p of plans) {
    if (p.kind === "alias") sourceToPrimaryTarget.set(p.source.id, p.target);
    else if (p.kind === "composite-resolved") sourceToPrimaryTarget.set(p.source.id, p.targets[0]);
  }
  function finalize(row: ProviderRow, seen = new Set<number>()): ProviderRow {
    if (seen.has(row.id)) return row; // cycle guard
    const next = sourceToPrimaryTarget.get(row.id);
    if (!next || next.id === row.id) return row;
    seen.add(row.id);
    return finalize(next, seen);
  }
  for (const p of plans) {
    if (p.kind === "alias") {
      p.target = finalize(p.target);
    } else if (p.kind === "composite-resolved") {
      const finalTargets = p.targets.map((t) => finalize(t));
      const dedupedIds = Array.from(new Set(finalTargets.map((t) => t.id)));
      p.targets = dedupedIds.map((id) => finalTargets.find((t) => t.id === id)!);
    }
  }
  // Chain resolution can collapse a plan into a no-op (target now equals
  // source, or a composite's only surviving target is itself) — drop those.
  const resolvedPlans = plans.filter((p) => {
    if (p.kind === "alias") return p.target.id !== p.source.id;
    if (p.kind === "composite-resolved") return !(p.targets.length === 1 && p.targets[0].id === p.source.id);
    return true;
  });
  plans.length = 0;
  plans.push(...resolvedPlans);

  const aliasCount = plans.filter((p) => p.kind === "alias").length;
  const compositeResolvedCount = plans.filter((p) => p.kind === "composite-resolved").length;
  const unresolvedCount = plans.filter((p) => p.kind === "unresolved").length;

  console.log(`ProviderMaster rows: ${rows.length}`);
  console.log(`  Simple (canonical candidates): ${simpleRows.length}`);
  console.log(`  Composite/role-qualified: ${compositeRows.length}`);
  console.log(`\nPlan:`);
  console.log(`  Alias merges (duplicate spelling of another row): ${aliasCount}`);
  console.log(`  Composite rows fully resolved (safe to split+relink): ${compositeResolvedCount}`);
  console.log(`  UNRESOLVED — needs a human decision, never auto-applied: ${unresolvedCount}`);
  console.log(`  Canonical providers remaining after cleanup: ~${rows.length - aliasCount - compositeResolvedCount}`);

  console.log(`\n--- Alias merges (sample, first 25) ---`);
  plans.filter((p) => p.kind === "alias").slice(0, 25).forEach((p) => {
    const a = p as Extract<Plan, { kind: "alias" }>;
    console.log(`  [${a.source.id}] "${a.source.providerName}" -> [${a.target.id}] "${a.target.providerName}"`);
  });

  console.log(`\n--- Composite resolved (sample, first 25) ---`);
  plans.filter((p) => p.kind === "composite-resolved").slice(0, 25).forEach((p) => {
    const c = p as Extract<Plan, { kind: "composite-resolved" }>;
    console.log(
      `  [${c.source.id}] "${c.source.providerName}" -> [${c.targets.map((t) => `${t.id}:${t.providerName}`).join(", ")}]`,
    );
  });

  console.log(`\n--- UNRESOLVED, needs manual review (sample, first 40) ---`);
  plans.filter((p) => p.kind === "unresolved").slice(0, 40).forEach((p) => {
    const u = p as Extract<Plan, { kind: "unresolved" }>;
    console.log(`  [${u.source.id}] "${u.source.providerName}" — no match for: ${u.unresolvedTokens.join(" | ")}`);
  });

  if (!APPLY) {
    console.log(`\nDry run only — no changes made. Re-run with --apply to execute the ${aliasCount + compositeResolvedCount} RESOLVED merges above (unresolved rows are always left untouched).`);
    return;
  }

  console.log(`\nAPPLYING ${aliasCount + compositeResolvedCount} resolved merges...`);
  let applied = 0;
  for (const plan of plans) {
    if (plan.kind === "unresolved") continue;
    const source = plan.source;
    const targets = plan.kind === "alias" ? [plan.target] : plan.targets;
    const primaryTarget = targets[0];

    await prisma.$transaction(async (tx) => {
      // Ir21Connectivity: one row per (mno, service) — can only point at one
      // provider, so composites collapse to the first resolved target;
      // never overwrite a target that already has that (mno, service).
      const ir21Rows = await tx.ir21Connectivity.findMany({ where: { providerId: source.id } });
      for (const row of ir21Rows) {
        const conflict = await tx.ir21Connectivity.findUnique({
          where: { mnoId_serviceId: { mnoId: row.mnoId, serviceId: row.serviceId } },
        });
        if (conflict && conflict.providerId !== source.id) {
          await tx.ir21Connectivity.delete({ where: { id: row.id } });
        } else {
          await tx.ir21Connectivity.update({ where: { id: row.id }, data: { providerId: primaryTarget.id } });
        }
      }

      // ProviderReachlist: fan out to every resolved target for composite
      // rows (it natively supports multiple providers per mno+service).
      const reachRows = await tx.providerReachlist.findMany({ where: { providerId: source.id } });
      for (const row of reachRows) {
        for (const target of targets) {
          const conflict = await tx.providerReachlist.findUnique({
            where: { mnoId_providerId_serviceId: { mnoId: row.mnoId, providerId: target.id, serviceId: row.serviceId } },
          });
          if (!conflict) {
            await tx.providerReachlist.create({
              data: { mnoId: row.mnoId, providerId: target.id, serviceId: row.serviceId, sourceFile: row.sourceFile, effectiveDate: row.effectiveDate },
            });
          }
        }
        await tx.providerReachlist.delete({ where: { id: row.id } });
      }

      // DataDiscrepancy is fully recomputed by the comparison engine — just
      // repoint to the primary target so nothing dangles until the next run.
      await tx.dataDiscrepancy.updateMany({ where: { providerId: source.id }, data: { providerId: primaryTarget.id } });
      await tx.unmappedProviderVariant.updateMany({ where: { resolvedProviderId: source.id }, data: { resolvedProviderId: primaryTarget.id } });

      // The source row may itself already be the target of an existing
      // alias (from earlier ingestion, before this row was identified as a
      // duplicate) — repoint those too, or the FK blocks the delete below.
      await tx.providerAlias.updateMany({ where: { providerId: source.id }, data: { providerId: primaryTarget.id } });

      // Record the alias so future ingestion resolves this exact wording
      // automatically — only for true 1:1 merges, not multi-target composites.
      if (plan.kind === "alias") {
        const pattern = normalizeCarrierName(source.providerName);
        if (pattern) {
          await tx.providerAlias.upsert({
            where: { aliasPattern: pattern },
            update: { providerId: primaryTarget.id },
            create: { aliasPattern: pattern, providerId: primaryTarget.id },
          });
        }
      }

      await tx.providerMaster.delete({ where: { id: source.id } });
    }, { maxWait: 20000, timeout: 60000 });

    applied++;
    if (applied % 25 === 0) console.log(`  ...${applied} done`);
  }

  console.log(`Applied ${applied} merges. ${unresolvedCount} rows left untouched for manual review.`);
  console.log(`Run POST /api/comparison/run afterward to recompute discrepancies against the cleaned-up providers.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
