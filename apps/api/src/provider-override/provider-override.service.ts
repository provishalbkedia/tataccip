import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ProviderResolverService } from "../upload/provider-resolver.service";
import { MnoProviderOverrideRow, SaveOverridesBatchRequest, SaveOverridesBatchResult } from "@ccip/shared-types";

@Injectable()
export class ProviderOverrideService {
  constructor(
    private prisma: PrismaService,
    private providerResolver: ProviderResolverService,
  ) {}

  async list(): Promise<MnoProviderOverrideRow[]> {
    const rows = await this.prisma.mnoProviderOverride.findMany({
      where: { isActive: true },
      include: { mno: true, overrideProvider: true },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      tadigCode: r.tadigCode,
      operatorName: r.mno.operatorName,
      country: r.mno.country,
      serviceName: r.serviceName,
      originalRawString: r.originalRawString,
      overrideProviderId: r.overrideProviderId,
      overrideProviderName: r.overrideProvider.providerName,
      reasonNote: r.reasonNote,
      updatedBy: r.updatedBy,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  /** Saves one or more per-(MNO, service) provider overrides and applies
   * each immediately to Ir21Connectivity — persisted separately from the
   * connectivity row itself so it can be re-applied on every future IR.21
   * re-ingestion of that TADIG (see UploadService.applyParsedIr21) rather
   * than being silently overwritten by the next upload's own resolution. */
  async saveBatch(req: SaveOverridesBatchRequest, updatedBy: string): Promise<SaveOverridesBatchResult> {
    const service = await this.prisma.service.findUnique({ where: { serviceName: req.service } });
    if (!service) throw new BadRequestException(`Unknown service "${req.service}"`);

    let savedCount = 0;
    const errors: string[] = [];

    for (const entry of req.entries) {
      const tadig = entry.tadigCode.trim().toUpperCase();
      const [mno, provider] = await Promise.all([
        this.prisma.mnoMaster.findUnique({ where: { tadigCode: tadig } }),
        this.prisma.providerMaster.findUnique({ where: { id: entry.providerId } }),
      ]);
      if (!mno) {
        errors.push(`TADIG "${tadig}" not found — skipped.`);
        continue;
      }
      if (!provider) {
        errors.push(`Provider ${entry.providerId} not found — skipped.`);
        continue;
      }

      await this.prisma.mnoProviderOverride.upsert({
        where: { tadigCode_serviceName: { tadigCode: tadig, serviceName: req.service } },
        update: {
          mnoId: mno.id,
          overrideProviderId: provider.id,
          originalRawString: entry.originalRawString ?? "",
          reasonNote: entry.reasonNote,
          updatedBy,
          isActive: true,
        },
        create: {
          tadigCode: tadig,
          mnoId: mno.id,
          serviceName: req.service,
          overrideProviderId: provider.id,
          originalRawString: entry.originalRawString ?? "",
          reasonNote: entry.reasonNote,
          updatedBy,
        },
      });

      await this.prisma.ir21Connectivity.upsert({
        where: { mnoId_serviceId: { mnoId: mno.id, serviceId: service.id } },
        update: { providerId: provider.id, isManualOverride: true, sourceFile: "manual-override" },
        create: {
          mnoId: mno.id,
          providerId: provider.id,
          serviceId: service.id,
          sourceFile: "manual-override",
          effectiveDate: new Date(),
          isManualOverride: true,
        },
      });

      savedCount++;
    }

    return { savedCount, skippedCount: req.entries.length - savedCount, errors };
  }

  /** Deletes the override rule and re-resolves the (MNO, service) using the
   * raw string it replaced, through the normal alias-resolution pipeline —
   * "restores raw XML baseline" rather than just clearing a flag and
   * leaving the connectivity row pointed at the override's provider. */
  async revert(id: string): Promise<{ reverted: boolean }> {
    const override = await this.prisma.mnoProviderOverride.findUnique({ where: { id } });
    if (!override) throw new NotFoundException("Override not found");

    const service = await this.prisma.service.findUnique({ where: { serviceName: override.serviceName } });
    await this.prisma.mnoProviderOverride.delete({ where: { id } });
    if (!service) return { reverted: true };

    if (override.originalRawString) {
      const resolved = await this.providerResolver.resolve(override.originalRawString, override.serviceName, override.tadigCode);
      if (resolved.status === "resolved") {
        await this.prisma.ir21Connectivity.upsert({
          where: { mnoId_serviceId: { mnoId: override.mnoId, serviceId: service.id } },
          update: { providerId: resolved.providerId, isManualOverride: false, sourceFile: "override-revert" },
          create: {
            mnoId: override.mnoId,
            providerId: resolved.providerId,
            serviceId: service.id,
            sourceFile: "override-revert",
            effectiveDate: new Date(),
          },
        });
        return { reverted: true };
      }
    }

    // No raw string on record (or it no longer resolves) — nothing sane to
    // fall back to automatically; just clear the manual-override flag.
    await this.prisma.ir21Connectivity.updateMany({
      where: { mnoId: override.mnoId, serviceId: service.id },
      data: { isManualOverride: false },
    });
    return { reverted: true };
  }
}
