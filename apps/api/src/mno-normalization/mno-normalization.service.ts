import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ServiceName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeCountryToIso3 } from "../upload/country-normalize";
import {
  BulkResolveAction,
  BulkResolveResult,
  CreateMnoFromAuditResult,
  MnoNormalizationAuditRow,
  ResolveMnoNormalizationResult,
} from "@ccip/shared-types";

const TADIG_REGEX = /^[A-Z0-9]{5}$/;

// The interactive-transaction callback's own client -- every query inside
// createOneMnoFromGroup/resolveOrSynthesizeTadig/bulkResolve's action
// branches must run through this (not `this.prisma` directly) so they
// share one transaction instead of each opening/committing its own.
type PrismaTx = Prisma.TransactionClient;
type MnoNormalizationAuditRecord = Prisma.MnoNormalizationAuditGetPayload<Record<string, never>>;

// Candidate 2-character TADIG operator-code suffixes for a synthesized
// placeholder, in preference order -- "90".."99" first (the original,
// most recognizably-synthetic block), then a much larger reserve so a
// single busy country (real production case: the UK alone needed more
// than 10 placeholder MNOs) never runs out. Collision safety doesn't
// actually depend on avoiding "real" GSMA-assigned codes -- the caller
// always checks each candidate against this platform's own MnoMaster
// before using it, so a value here only ever gets used if nothing already
// claims it. First-letter X/Y/Z keeps the widened pool visually
// distinguishable from typical low/sequential real allocations (which
// GSMA typically assigns starting from "01"/"AA"), rather than working
// backward through "89", "88", ... which would look indistinguishable
// from a real code to anyone auditing the data later.
const SYNTHETIC_TADIG_SUFFIXES: string[] = (() => {
  const suffixes: string[] = [];
  for (let n = 90; n <= 99; n++) suffixes.push(String(n));
  const alnum = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  for (const first of ["Z", "Y", "X"]) {
    for (const second of alnum) suffixes.push(`${first}${second}`);
  }
  return suffixes;
})();

/** Admin resolution for MnoNormalizationAudit — the queue Reach List
 * ingestion writes to instead of auto-creating a new MnoMaster row (see
 * UploadService.recordNormalizationAudit). GSMA IR.21 stays the sole
 * source for an "IR.21 Verified" MNO record — resolve() only ever maps a
 * pending row onto an *existing* MnoMaster id, never invents one.
 *
 * createFromAudits() is the deliberate, narrow exception: many Reach List
 * rows (SMS/A2P aggregators, SS7 signaling hubs, MVNOs) are never going to
 * have a GSMA IR.21 filing at all — they aren't roaming MNOs in that
 * sense — so requiring one before they can appear anywhere in the
 * platform would keep them permanently invisible. This creates a
 * MnoMaster row with no MnoMasterConnectivity (no XML snapshot), which is
 * exactly what already makes an operator show up under the "Reach List
 * Only" dataset scope instead of "IR.21 Verified" — the same bucket a
 * handful of legacy pre-normalization rows already live in. */
@Injectable()
export class MnoNormalizationService {
  constructor(private prisma: PrismaService) {}

  async listPending(): Promise<MnoNormalizationAuditRow[]> {
    const rows = await this.prisma.mnoNormalizationAudit.findMany({
      where: { matchStatus: { in: ["PENDING_REVIEW", "ALIAS_MATCHED"] } },
      orderBy: [{ matchStatus: "asc" }, { occurrenceCount: "desc" }, { updatedAt: "desc" }],
      include: {
        provider: { select: { providerName: true } },
        canonicalMno: { select: { operatorName: true, tadigCode: true } },
      },
    });
    return rows.map((r) => this.toRow(r));
  }

  /** Maps a pending/alias-matched audit row onto an existing MnoMaster,
   * marks it MANUALLY_OVERRIDDEN, and retroactively creates the
   * ProviderReachlist rows for every service the row accumulated across
   * every upload that hit this same unresolved combination — not just the
   * most recent one. */
  async resolve(auditId: string, mnoId: number, updatedBy: string): Promise<ResolveMnoNormalizationResult> {
    const audit = await this.prisma.mnoNormalizationAudit.findUnique({ where: { id: auditId } });
    if (!audit) throw new NotFoundException("Normalization audit entry not found");
    if (audit.matchStatus === "MANUALLY_OVERRIDDEN") {
      throw new BadRequestException("This entry has already been resolved");
    }

    const mno = await this.prisma.mnoMaster.findUnique({ where: { id: mnoId } });
    if (!mno) throw new NotFoundException(`MnoMaster id ${mnoId} not found`);

    const serviceRows = await this.prisma.service.findMany();
    const serviceIdByName = new Map(serviceRows.map((s) => [s.serviceName, s.id]));
    const sourceFile = audit.affectedFiles[audit.affectedFiles.length - 1] ?? "Resolved from MnoNormalizationAudit";

    let recordsCreated = 0;
    for (const serviceNameRaw of audit.affectedServices) {
      const serviceId = serviceIdByName.get(serviceNameRaw as ServiceName);
      if (!serviceId) continue;
      await this.prisma.providerReachlist.upsert({
        where: {
          mnoId_providerId_serviceId: { mnoId: mno.id, providerId: audit.providerId, serviceId },
        },
        update: { sourceFile, effectiveDate: new Date() },
        create: { mnoId: mno.id, providerId: audit.providerId, serviceId, sourceFile, effectiveDate: new Date() },
      });
      recordsCreated++;
    }

    const updated = await this.prisma.mnoNormalizationAudit.update({
      where: { id: auditId },
      data: { matchStatus: "MANUALLY_OVERRIDDEN", canonicalMnoId: mno.id, updatedBy },
      include: {
        provider: { select: { providerName: true } },
        canonicalMno: { select: { operatorName: true, tadigCode: true } },
      },
    });

    return { audit: this.toRow(updated), recordsCreated };
  }

  /** Creates a new "Reach List Only" MnoMaster row (no MnoMasterConnectivity
   * — see class docstring) from one or more pending audit rows that all
   * refer to the same real-world operator, then attaches every one of
   * their accumulated (provider, service) declarations to it and marks
   * each MANUALLY_OVERRIDDEN. Grouping several audit ids together handles
   * the common case where the same unresolved operator was declared by
   * more than one wholesale provider (each becomes its own audit row,
   * keyed on (providerId, rawTadigCode, rawOperatorName) — see
   * UploadService.recordNormalizationAudit) but should still resolve onto
   * one single new MNO, not one per provider.
   *
   * TADIG: the group's own rawTadigCode is used directly when it's already
   * valid GSMA format (5 alphanumeric chars) — several Reach List rows
   * carry a real, if unusual, TADIG (hub/non-standard prefixes included)
   * even though they never matched an existing MnoMaster. Otherwise a
   * synthetic placeholder is minted: the country's real ISO3 prefix (so it
   * still groups/searches sensibly by country) plus a suffix from
   * SYNTHETIC_TADIG_SUFFIXES, checked against this platform's own
   * MnoMaster for collisions (not against real-world GSMA allocations,
   * which this platform has no visibility into) — see that constant's own
   * comment for why the pool is sized the way it is. */
  async createFromAudits(auditIds: string[], updatedBy: string): Promise<CreateMnoFromAuditResult> {
    if (auditIds.length === 0) throw new BadRequestException("At least one audit id is required");

    return this.prisma.$transaction(async (tx) => {
      const audits = await tx.mnoNormalizationAudit.findMany({ where: { id: { in: auditIds } } });
      if (audits.length !== auditIds.length) throw new NotFoundException("One or more normalization audit entries not found");
      if (audits.some((a) => a.matchStatus === "MANUALLY_OVERRIDDEN")) {
        throw new BadRequestException("One or more of these entries has already been resolved");
      }
      return this.createOneMnoFromGroup(tx, audits, updatedBy);
    });
  }

  /** Shared by createFromAudits() (one group, its own transaction) and
   * bulkResolve()'s CREATE_NEW_MNO action (many groups, one shared
   * transaction) -- creates a single new MnoMaster from a group of audit
   * rows that all refer to the same real-world operator (same raw name +
   * TADIG + country) and attaches every one of their accumulated
   * (provider, service) declarations to it. See createFromAudits' own
   * docstring above for the TADIG resolution/synthesis rationale. */
  private async createOneMnoFromGroup(
    tx: PrismaTx,
    audits: MnoNormalizationAuditRecord[],
    updatedBy: string,
  ): Promise<CreateMnoFromAuditResult> {
    const primary = audits[0];
    const tadigCode = await this.resolveOrSynthesizeTadig(tx, primary.rawTadigCode, primary.country);

    const mno = await tx.mnoMaster.create({
      data: {
        operatorName: primary.rawOperatorName,
        country: primary.country || "UNKNOWN",
        mcc: "",
        mnc: "",
        countryCode: normalizeCountryToIso3(primary.country) ?? "",
        tadigCode,
        status: "ACTIVE",
      },
    });

    const serviceRows = await tx.service.findMany();
    const serviceIdByName = new Map(serviceRows.map((s) => [s.serviceName, s.id]));

    let recordsCreated = 0;
    for (const audit of audits) {
      const sourceFile = audit.affectedFiles[audit.affectedFiles.length - 1] ?? "Resolved from MnoNormalizationAudit";
      for (const serviceNameRaw of audit.affectedServices) {
        const serviceId = serviceIdByName.get(serviceNameRaw as ServiceName);
        if (!serviceId) continue;
        await tx.providerReachlist.upsert({
          where: { mnoId_providerId_serviceId: { mnoId: mno.id, providerId: audit.providerId, serviceId } },
          update: { sourceFile, effectiveDate: new Date() },
          create: { mnoId: mno.id, providerId: audit.providerId, serviceId, sourceFile, effectiveDate: new Date() },
        });
        recordsCreated++;
      }
      await tx.mnoNormalizationAudit.update({
        where: { id: audit.id },
        data: { matchStatus: "MANUALLY_OVERRIDDEN", canonicalMnoId: mno.id, updatedBy },
      });
    }

    return {
      mnoId: mno.id,
      operatorName: mno.operatorName,
      tadigCode: mno.tadigCode,
      auditIdsResolved: audits.map((a) => a.id),
      recordsCreated,
    };
  }

  /** One transaction, five possible bulk actions -- powers the admin
   * table's multi-select action bar so hundreds of pending rows don't
   * have to be resolved one at a time. Silently skips (counted in
   * skippedCount, never an error) whatever isn't applicable to a given
   * row instead of failing the whole batch over a few stragglers: an id
   * that no longer exists (resolved by someone else meanwhile), an
   * ACCEPT_SUGGESTIONS row with no existing suggestion, or a
   * MAP_TO_CANONICAL/ACCEPT_SUGGESTIONS/CREATE_NEW_MNO row that's already
   * MANUALLY_OVERRIDDEN. DELETE is the one exception -- it removes
   * whatever's selected unconditionally, matching "dismiss this" being a
   * deliberate per-row choice regardless of current status. */
  async bulkResolve(
    action: BulkResolveAction,
    auditIds: string[],
    targetMnoId: number | undefined,
    updatedBy: string,
  ): Promise<BulkResolveResult> {
    if (auditIds.length === 0) throw new BadRequestException("At least one audit id is required");
    if (action === "MAP_TO_CANONICAL" && !targetMnoId) {
      throw new BadRequestException("targetMnoId is required for MAP_TO_CANONICAL");
    }

    return this.prisma.$transaction(
      async (tx) => {
        const audits = await tx.mnoNormalizationAudit.findMany({ where: { id: { in: auditIds } } });

        if (action === "DELETE") {
          const deleted = await tx.mnoNormalizationAudit.deleteMany({ where: { id: { in: audits.map((a) => a.id) } } });
          return { success: true as const, updatedCount: deleted.count, skippedCount: auditIds.length - deleted.count, recordsCreated: 0 };
        }

        const serviceRows = await tx.service.findMany();
        const serviceIdByName = new Map(serviceRows.map((s) => [s.serviceName, s.id]));
        let updatedCount = 0;
        let skippedCount = 0;
        let recordsCreated = 0;

        const applyMapping = async (audit: (typeof audits)[number], mnoId: number) => {
          const sourceFile = audit.affectedFiles[audit.affectedFiles.length - 1] ?? "Resolved from MnoNormalizationAudit (bulk)";
          for (const serviceNameRaw of audit.affectedServices) {
            const serviceId = serviceIdByName.get(serviceNameRaw as ServiceName);
            if (!serviceId) continue;
            await tx.providerReachlist.upsert({
              where: { mnoId_providerId_serviceId: { mnoId, providerId: audit.providerId, serviceId } },
              update: { sourceFile, effectiveDate: new Date() },
              create: { mnoId, providerId: audit.providerId, serviceId, sourceFile, effectiveDate: new Date() },
            });
            recordsCreated++;
          }
          await tx.mnoNormalizationAudit.update({
            where: { id: audit.id },
            data: { matchStatus: "MANUALLY_OVERRIDDEN", canonicalMnoId: mnoId, updatedBy },
          });
          updatedCount++;
        };

        if (action === "CREATE_NEW_MNO") {
          // Selected rows are grouped by real-world operator identity
          // first (same key MnoNormalizationAudit is unique on) -- the
          // same operator declared by 3 different providers is 3 audit
          // rows but must become one new MNO, not three. See
          // createOneMnoFromGroup.
          const groups = new Map<string, MnoNormalizationAuditRecord[]>();
          for (const audit of audits) {
            if (audit.matchStatus === "MANUALLY_OVERRIDDEN") {
              skippedCount++;
              continue;
            }
            const key = `${audit.rawOperatorName}|${audit.rawTadigCode}|${audit.country}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(audit);
          }
          let mnosCreated = 0;
          for (const groupAudits of groups.values()) {
            const result = await this.createOneMnoFromGroup(tx, groupAudits, updatedBy);
            updatedCount += result.auditIdsResolved.length;
            recordsCreated += result.recordsCreated;
            mnosCreated++;
          }
          skippedCount += auditIds.length - audits.length;
          return { success: true as const, updatedCount, skippedCount, recordsCreated, mnosCreated };
        } else if (action === "MAP_TO_CANONICAL") {
          const mno = await tx.mnoMaster.findUnique({ where: { id: targetMnoId! } });
          if (!mno) throw new NotFoundException(`MnoMaster id ${targetMnoId} not found`);
          for (const audit of audits) {
            if (audit.matchStatus === "MANUALLY_OVERRIDDEN") {
              skippedCount++;
              continue;
            }
            await applyMapping(audit, mno.id);
          }
        } else if (action === "ACCEPT_SUGGESTIONS") {
          for (const audit of audits) {
            if (audit.matchStatus !== "ALIAS_MATCHED" || !audit.canonicalMnoId) {
              skippedCount++;
              continue;
            }
            await applyMapping(audit, audit.canonicalMnoId);
          }
        } else if (action === "IGNORE") {
          for (const audit of audits) {
            if (audit.matchStatus === "MANUALLY_OVERRIDDEN") {
              skippedCount++;
              continue;
            }
            await tx.mnoNormalizationAudit.update({ where: { id: audit.id }, data: { matchStatus: "IGNORED", updatedBy } });
            updatedCount++;
          }
        }

        skippedCount += auditIds.length - audits.length;
        return { success: true as const, updatedCount, skippedCount, recordsCreated };
      },
      { timeout: 30000 },
    );
  }

  private async resolveOrSynthesizeTadig(tx: PrismaTx, rawTadigCode: string, country: string): Promise<string> {
    const candidate = rawTadigCode.trim().toUpperCase();
    if (TADIG_REGEX.test(candidate)) {
      const clash = await tx.mnoMaster.findUnique({ where: { tadigCode: candidate } });
      if (!clash) return candidate;
      // Fall through to synthesis on the rare chance another row grabbed
      // this exact code between the audit being queued and this call.
    }

    // normalizeCountryToIso3 falls back to the raw uppercased input (not
    // null) for anything it can't resolve, which could be far longer than
    // 3 characters — only a real 3-letter-shaped result is safe to use as
    // a TADIG prefix; anything else (or a genuinely empty country) gets
    // the same "ZZZ" catch-all.
    const iso3Raw = normalizeCountryToIso3(country);
    const iso3 = iso3Raw && /^[A-Z]{3}$/.test(iso3Raw) ? iso3Raw : "ZZZ";
    for (const suffix of SYNTHETIC_TADIG_SUFFIXES) {
      const synthetic = `${iso3}${suffix}`;
      const clash = await tx.mnoMaster.findUnique({ where: { tadigCode: synthetic } });
      if (!clash) return synthetic;
    }
    throw new BadRequestException(
      `Could not mint a unique placeholder TADIG for country "${country}" — all ${SYNTHETIC_TADIG_SUFFIXES.length} reserved ${iso3}xx codes are taken. This means ${iso3} has an unusually large number of placeholder MNOs already; contact engineering to widen the reserved range further.`,
    );
  }

  private toRow(
    r: Awaited<ReturnType<typeof this.prisma.mnoNormalizationAudit.findMany>>[number] & {
      provider: { providerName: string };
      canonicalMno: { operatorName: string; tadigCode: string } | null;
    },
  ): MnoNormalizationAuditRow {
    return {
      id: r.id,
      rawOperatorName: r.rawOperatorName,
      rawTadigCode: r.rawTadigCode,
      country: r.country,
      providerId: r.providerId,
      providerName: r.provider.providerName,
      affectedServices: r.affectedServices,
      affectedFiles: r.affectedFiles,
      occurrenceCount: r.occurrenceCount,
      matchStatus: r.matchStatus,
      canonicalMnoId: r.canonicalMnoId,
      canonicalMnoName: r.canonicalMno?.operatorName ?? null,
      canonicalMnoTadig: r.canonicalMno?.tadigCode ?? null,
      updatedBy: r.updatedBy,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
