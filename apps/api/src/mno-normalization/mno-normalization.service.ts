import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ServiceName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MnoNormalizationAuditRow, ResolveMnoNormalizationResult } from "@ccip/shared-types";

/** Admin resolution for MnoNormalizationAudit — the queue Reach List
 * ingestion writes to instead of auto-creating a new MnoMaster row (see
 * UploadService.recordNormalizationAudit). GSMA IR.21 is the platform's
 * sole authoritative MNO source, so this only ever maps a pending row onto
 * an *existing* MnoMaster id — it deliberately has no "create a new MNO"
 * path; a genuinely new operator needs its own IR.21 upload, not a
 * Reach-List-driven override. */
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
