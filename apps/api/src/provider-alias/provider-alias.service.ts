import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ServiceName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ProviderResolverService } from "../upload/provider-resolver.service";
import { normalizeCarrierName, splitCompositeProviderNames } from "../upload/provider-normalize";
import {
  MergeProviderRequest,
  MergeProviderResult,
  RemapProviderRequest,
  RemapProviderResult,
  ResolveProviderAliasRequest,
  UnmappedProviderVariantRow,
} from "@ccip/shared-types";

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

  /** Merges a duplicate ProviderMaster row into its correct canonical
   * counterpart — e.g. a Reach List upload created "TATAComms" as its own
   * provider instead of resolving to the existing "Tata Comm" row (Reach
   * List ingestion isn't alias-aware the way XML ingestion is). Repoints
   * every ProviderReachlist/Ir21Connectivity/ProviderAlias row from source
   * to target, registers the source's normalized name as an alias so
   * future uploads resolve directly, then deletes the source row. */
  async mergeProvider(req: MergeProviderRequest): Promise<MergeProviderResult> {
    const { sourceProviderId: sourceId, targetProviderId: targetId } = req;
    if (sourceId === targetId) {
      throw new BadRequestException("sourceProviderId and targetProviderId must differ");
    }

    const [source, target] = await Promise.all([
      this.prisma.providerMaster.findUnique({ where: { id: sourceId } }),
      this.prisma.providerMaster.findUnique({ where: { id: targetId } }),
    ]);
    if (!source) throw new NotFoundException(`Source provider ${sourceId} not found`);
    if (!target) throw new NotFoundException(`Target provider ${targetId} not found`);

    const normalizedPattern = normalizeCarrierName(source.providerName);

    const { reachlistRowsMoved, ir21RowsMoved, aliasesMoved } = await this.prisma.$transaction(
      async (tx) => {
        // ProviderReachlist is unique per (mno, provider, service) —
        // multiple providers can independently claim the same route, so
        // the source's and target's rows for the same (mno, service) can
        // collide; drop the source's row as a duplicate claim rather than
        // erroring.
        const reachRows = await tx.providerReachlist.findMany({ where: { providerId: sourceId } });
        let reachlistRowsMoved = 0;
        for (const r of reachRows) {
          const clash = await tx.providerReachlist.findUnique({
            where: { mnoId_providerId_serviceId: { mnoId: r.mnoId, providerId: targetId, serviceId: r.serviceId } },
          });
          if (clash) {
            await tx.providerReachlist.delete({ where: { id: r.id } });
          } else {
            await tx.providerReachlist.update({ where: { id: r.id }, data: { providerId: targetId } });
            reachlistRowsMoved++;
          }
        }

        // Ir21Connectivity is unique per (mno, service) with no providerId
        // in the key — one declared provider per route, period — so there's
        // never a clash to resolve here.
        const { count: ir21RowsMoved } = await tx.ir21Connectivity.updateMany({
          where: { providerId: sourceId },
          data: { providerId: targetId },
        });

        const { count: aliasesMoved } = await tx.providerAlias.updateMany({
          where: { providerId: sourceId },
          data: { providerId: targetId },
        });

        if (normalizedPattern) {
          await tx.providerAlias.upsert({
            where: { aliasPattern: normalizedPattern },
            update: { providerId: targetId },
            create: { aliasPattern: normalizedPattern, providerId: targetId },
          });
        }

        await tx.providerMaster.delete({ where: { id: sourceId } });

        return { reachlistRowsMoved, ir21RowsMoved, aliasesMoved };
      },
      { maxWait: 20000, timeout: 60000 },
    );

    await this.providerResolver.refreshCache();

    return {
      sourceProviderId: sourceId,
      sourceProviderName: source.providerName,
      targetProviderId: targetId,
      targetProviderName: target.providerName,
      reachlistRowsMoved,
      ir21RowsMoved,
      aliasesMoved,
    };
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
