import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ServiceName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ProviderResolverService } from "../upload/provider-resolver.service";
import { normalizeCarrierName, splitCompositeProviderNames } from "../upload/provider-normalize";
import { RemapProviderRequest, RemapProviderResult, ResolveProviderAliasRequest, UnmappedProviderVariantRow } from "@ccip/shared-types";

@Injectable()
export class ProviderAliasService {
  constructor(
    private prisma: PrismaService,
    private providerResolver: ProviderResolverService,
  ) {}

  async listUnmapped(): Promise<UnmappedProviderVariantRow[]> {
    const rows = await this.prisma.unmappedProviderVariant.findMany({
      where: { status: "PENDING" },
      orderBy: [{ occurrenceCount: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(this.toRow);
  }

  /** Maps a pending variant to a canonical provider (existing or new),
   * records the alias so future ingestion resolves it automatically, and
   * retroactively backfills every (MNO, service) occurrence tracked on the
   * variant — UnmappedProviderVariant.affectedTadigs accumulates every
   * distinct TADIG that hit this raw string across the whole batch, so this
   * isn't limited to the most recent one. */
  async resolve(req: ResolveProviderAliasRequest): Promise<UnmappedProviderVariantRow> {
    const variant = await this.prisma.unmappedProviderVariant.findUnique({ where: { id: req.variantId } });
    if (!variant) throw new NotFoundException("Unmapped variant not found");
    if (!req.providerId && !req.newProviderName) {
      throw new BadRequestException("Provide either providerId or newProviderName");
    }

    let providerId: number;
    if (req.providerId) {
      const provider = await this.prisma.providerMaster.findUnique({ where: { id: req.providerId } });
      if (!provider) throw new NotFoundException("Target provider not found");
      providerId = provider.id;
    } else {
      const newName = req.newProviderName!.trim();
      const splitTokens = splitCompositeProviderNames(newName);
      if (splitTokens.length > 1) {
        throw new BadRequestException(
          `"${newName}" looks like more than one provider (${splitTokens.join(", ")}). Resolve this variant to one canonical provider at a time.`,
        );
      }

      const created = await this.prisma.providerMaster.create({
        data: { providerName: newName, providerType: "IPX Provider" },
      });
      providerId = created.id;
    }

    await this.providerResolver.addAlias(providerId, variant.normalizedPattern);

    const updated = await this.prisma.unmappedProviderVariant.update({
      where: { id: variant.id },
      data: { status: "RESOLVED", resolvedProviderId: providerId },
    });

    for (const tadig of variant.affectedTadigs) {
      await this.backfillOccurrence(variant, tadig, providerId);
    }

    return this.toRow(updated);
  }

  /** Repoints Ir21Connectivity for one already-known (tadig, service) pair
   * to the resolved provider. Deliberately does NOT touch
   * MnoMasterConnectivity's raw carrier-name fields — those stay exactly as
   * declared in the source document forever, so the audit trail (which raw
   * string resolved to which canonical provider) stays intact instead of
   * being overwritten by the resolution itself. */
  private async backfillOccurrence(
    variant: { detectedService: string },
    tadig: string,
    providerId: number,
  ): Promise<void> {
    const mno = await this.prisma.mnoMaster.findUnique({ where: { tadigCode: tadig } });
    if (!mno) return;

    const service = await this.prisma.service.findUnique({
      where: { serviceName: variant.detectedService as "SCCP" | "DSX" | "IPX" },
    });
    if (!service) return;

    await this.prisma.ir21Connectivity.upsert({
      where: { mnoId_serviceId: { mnoId: mno.id, serviceId: service.id } },
      update: { providerId },
      create: {
        mnoId: mno.id,
        providerId,
        serviceId: service.id,
        sourceFile: "provider-alias-resolution",
        effectiveDate: new Date(),
      },
    });
  }

  /** Like resolve(), but for a raw string that's already resolved to
   * *some* provider (via ProviderAlias or an exact ProviderMaster name
   * match) and an admin wants to correct where it points — e.g. "BICS-
   * INDIA" got auto-merged into "BICS" but should be its own entity, or a
   * new regional affiliate needs its own canonical row. Scans every MNO's
   * XML-declared raw carrier fields for an exact normalized match (not
   * substring — this targets one specific spelling, not a fuzzy family of
   * similar names) and repoints Ir21Connectivity for each. Reach List data
   * isn't touched: raw provider text from Excel uploads was never
   * persisted anywhere, so there's no way to know which ProviderReachlist
   * rows trace back to this exact raw string. */
  async remap(req: RemapProviderRequest): Promise<RemapProviderResult> {
    const normalizedPattern = normalizeCarrierName(req.rawString);
    if (!normalizedPattern) {
      throw new BadRequestException(`"${req.rawString}" has no resolvable name after normalization`);
    }
    if (!req.targetProviderId && !req.newProviderName) {
      throw new BadRequestException("Provide either targetProviderId or newProviderName");
    }

    let targetId: number;
    let targetName: string;
    if (req.targetProviderId) {
      const provider = await this.prisma.providerMaster.findUnique({ where: { id: req.targetProviderId } });
      if (!provider) throw new NotFoundException("Target provider not found");
      targetId = provider.id;
      targetName = provider.providerName;
    } else {
      const newName = req.newProviderName!.trim();
      const splitTokens = splitCompositeProviderNames(newName);
      if (splitTokens.length > 1) {
        throw new BadRequestException(
          `"${newName}" looks like more than one provider (${splitTokens.join(", ")}). Remap to one canonical provider at a time.`,
        );
      }
      const created = await this.prisma.providerMaster.create({
        data: { providerName: newName, providerType: "IPX Provider" },
      });
      targetId = created.id;
      targetName = created.providerName;
    }

    await this.providerResolver.addAlias(targetId, normalizedPattern);

    const allConnectivity = await this.prisma.mnoMasterConnectivity.findMany();
    const affectedTadigs: string[] = [];
    for (const c of allConnectivity) {
      const services: ServiceName[] = [];
      if ([c.primarySccpCarrier, ...c.backupSccpCarriers].some((r) => r && normalizeCarrierName(r) === normalizedPattern)) {
        services.push("SCCP");
      }
      if (c.lteIpxProviders.some((r) => normalizeCarrierName(r) === normalizedPattern)) services.push("DSX");
      if (c.grxIpxProviders.some((r) => normalizeCarrierName(r) === normalizedPattern)) services.push("IPX");
      if (services.length === 0) continue;

      for (const serviceName of services) {
        const service = await this.prisma.service.findUnique({ where: { serviceName } });
        if (!service) continue;
        await this.prisma.ir21Connectivity.upsert({
          where: { mnoId_serviceId: { mnoId: c.mnoId, serviceId: service.id } },
          update: { providerId: targetId },
          create: { mnoId: c.mnoId, providerId: targetId, serviceId: service.id, sourceFile: "manual-remap", effectiveDate: new Date() },
        });
      }
      affectedTadigs.push(c.tadigCode);
    }

    return { normalizedPattern, targetProviderId: targetId, targetProviderName: targetName, affectedTadigs };
  }

  private toRow = (v: {
    id: string;
    rawCarrierName: string;
    normalizedPattern: string;
    detectedService: string;
    affectedTadigs: string[];
    occurrenceCount: number;
    status: string;
    resolvedProviderId: number | null;
    createdAt: Date;
    updatedAt: Date;
  }): UnmappedProviderVariantRow => ({
    id: v.id,
    rawCarrierName: v.rawCarrierName,
    normalizedPattern: v.normalizedPattern,
    detectedService: v.detectedService as UnmappedProviderVariantRow["detectedService"],
    affectedTadigs: v.affectedTadigs,
    occurrenceCount: v.occurrenceCount,
    status: v.status as UnmappedProviderVariantRow["status"],
    resolvedProviderId: v.resolvedProviderId,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  });
}
