import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ProviderResolverService } from "../upload/provider-resolver.service";
import { ResolveProviderAliasRequest, UnmappedProviderVariantRow } from "@ccip/shared-types";

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
    let providerName: string;
    if (req.providerId) {
      const provider = await this.prisma.providerMaster.findUnique({ where: { id: req.providerId } });
      if (!provider) throw new NotFoundException("Target provider not found");
      providerId = provider.id;
      providerName = provider.providerName;
    } else {
      const created = await this.prisma.providerMaster.create({
        data: { providerName: req.newProviderName!.trim(), providerType: "IPX Provider" },
      });
      providerId = created.id;
      providerName = created.providerName;
    }

    await this.providerResolver.addAlias(providerId, variant.normalizedPattern);

    const updated = await this.prisma.unmappedProviderVariant.update({
      where: { id: variant.id },
      data: { status: "RESOLVED", resolvedProviderId: providerId },
    });

    for (const tadig of variant.affectedTadigs) {
      await this.backfillOccurrence(variant, tadig, providerId, providerName);
    }

    return this.toRow(updated);
  }

  private async backfillOccurrence(
    variant: { detectedService: string; normalizedPattern: string },
    tadig: string,
    providerId: number,
    providerName: string,
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

    const snapshot = await this.prisma.mnoMasterConnectivity.findUnique({ where: { mnoId: mno.id } });
    if (!snapshot) return;

    const replaceIfMatches = (raw: string | null) =>
      raw && this.providerResolver.normalize(raw) === variant.normalizedPattern ? providerName : raw;
    const replaceListIfMatches = (raws: string[]) =>
      raws.map((r) => (this.providerResolver.normalize(r) === variant.normalizedPattern ? providerName : r));

    await this.prisma.mnoMasterConnectivity.update({
      where: { mnoId: mno.id },
      data: {
        primarySccpCarrier: replaceIfMatches(snapshot.primarySccpCarrier),
        backupSccpCarriers: replaceListIfMatches(snapshot.backupSccpCarriers),
        grxIpxProviders: replaceListIfMatches(snapshot.grxIpxProviders),
        lteIpxProviders: replaceListIfMatches(snapshot.lteIpxProviders),
      },
    });
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
