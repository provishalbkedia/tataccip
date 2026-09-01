import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ServiceName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeCountryToIso3 } from "../upload/country-normalize";
import { CreateMnoFromAuditResult, MnoNormalizationAuditRow, ResolveMnoNormalizationResult } from "@ccip/shared-types";

const TADIG_REGEX = /^[A-Z0-9]{5}$/;

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
   * still groups/searches sensibly by country) plus a 90-99 suffix chosen
   * to never collide with a real GSMA-assigned code — GSMA's own 2-char
   * operator codes for real networks don't reach that range in practice,
   * and it reads unambiguously as "not a real assigned TADIG" to anyone
   * who notices the pattern. */
  async createFromAudits(auditIds: string[], updatedBy: string): Promise<CreateMnoFromAuditResult> {
    if (auditIds.length === 0) throw new BadRequestException("At least one audit id is required");

    const audits = await this.prisma.mnoNormalizationAudit.findMany({ where: { id: { in: auditIds } } });
    if (audits.length !== auditIds.length) throw new NotFoundException("One or more normalization audit entries not found");
    if (audits.some((a) => a.matchStatus === "MANUALLY_OVERRIDDEN")) {
      throw new BadRequestException("One or more of these entries has already been resolved");
    }

    const primary = audits[0];
    const tadigCode = await this.resolveOrSynthesizeTadig(primary.rawTadigCode, primary.country);

    const mno = await this.prisma.mnoMaster.create({
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

    const serviceRows = await this.prisma.service.findMany();
    const serviceIdByName = new Map(serviceRows.map((s) => [s.serviceName, s.id]));

    let recordsCreated = 0;
    for (const audit of audits) {
      const sourceFile = audit.affectedFiles[audit.affectedFiles.length - 1] ?? "Resolved from MnoNormalizationAudit";
      for (const serviceNameRaw of audit.affectedServices) {
        const serviceId = serviceIdByName.get(serviceNameRaw as ServiceName);
        if (!serviceId) continue;
        await this.prisma.providerReachlist.upsert({
          where: { mnoId_providerId_serviceId: { mnoId: mno.id, providerId: audit.providerId, serviceId } },
          update: { sourceFile, effectiveDate: new Date() },
          create: { mnoId: mno.id, providerId: audit.providerId, serviceId, sourceFile, effectiveDate: new Date() },
        });
        recordsCreated++;
      }
      await this.prisma.mnoNormalizationAudit.update({
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

  private async resolveOrSynthesizeTadig(rawTadigCode: string, country: string): Promise<string> {
    const candidate = rawTadigCode.trim().toUpperCase();
    if (TADIG_REGEX.test(candidate)) {
      const clash = await this.prisma.mnoMaster.findUnique({ where: { tadigCode: candidate } });
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
    for (let suffix = 90; suffix <= 99; suffix++) {
      const synthetic = `${iso3}${suffix}`;
      const clash = await this.prisma.mnoMaster.findUnique({ where: { tadigCode: synthetic } });
      if (!clash) return synthetic;
    }
    throw new BadRequestException(`Could not mint a unique placeholder TADIG for country "${country}" — all ${iso3}90-${iso3}99 are taken`);
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
