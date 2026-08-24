import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ServiceName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ProviderResolverService } from "../upload/provider-resolver.service";
import { normalizeCarrierName, splitCompositeProviderNames } from "../upload/provider-normalize";
import {
  DeleteProviderResult,
  MergeProviderRequest,
  MergeProviderResult,
  ProviderAliasEntry,
  ProviderNormalizationCard,
  ReassignAliasRequest,
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
    const mnoLookup = await this.mnoLookup(rows.flatMap((r) => r.affectedTadigs));
    return rows.map((r) => this.toRow(r, mnoLookup));
  }

  /** Batches one MnoMaster lookup for a set of TADIGs rather than querying
   * per-row — listUnmapped() can return dozens of variants, each with its
   * own affectedTadigs, so this keeps enrichment to a single query. */
  private async mnoLookup(tadigs: string[]): Promise<Map<string, { operatorName: string; country: string }>> {
    const distinct = Array.from(new Set(tadigs));
    if (distinct.length === 0) return new Map();
    const rows = await this.prisma.mnoMaster.findMany({
      where: { tadigCode: { in: distinct } },
      select: { tadigCode: true, operatorName: true, country: true },
    });
    return new Map(rows.map((r) => [r.tadigCode, { operatorName: r.operatorName, country: r.country }]));
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

    const mnoLookup = await this.mnoLookup(updated.affectedTadigs);
    return this.toRow(updated, mnoLookup);
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

  /** Merges one or more duplicate/junk ProviderMaster rows into their
   * correct canonical counterpart — e.g. a Reach List upload created
   * "TATAComms" as its own provider instead of resolving to the existing
   * "Tata Comm" row, or several residual junk rows should all collapse
   * into "Others / Unassigned". Repoints every ProviderReachlist/
   * Ir21Connectivity/DataDiscrepancy/ProviderAlias row from each source to
   * the target, registers each source's normalized name as an alias so
   * future uploads resolve directly, then deletes the source rows. */
  async mergeProvider(req: MergeProviderRequest): Promise<MergeProviderResult> {
    const { sourceProviderIds, targetProviderId: targetId } = req;
    const sourceIds = Array.from(new Set(sourceProviderIds));
    if (sourceIds.includes(targetId)) {
      throw new BadRequestException("targetProviderId cannot also appear in sourceProviderIds");
    }

    const [sources, target] = await Promise.all([
      this.prisma.providerMaster.findMany({ where: { id: { in: sourceIds } } }),
      this.prisma.providerMaster.findUnique({ where: { id: targetId } }),
    ]);
    if (!target) throw new NotFoundException(`Target provider ${targetId} not found`);
    const missing = sourceIds.filter((id) => !sources.some((s) => s.id === id));
    if (missing.length > 0) throw new NotFoundException(`Source provider(s) not found: ${missing.join(", ")}`);

    const totals = await this.prisma.$transaction(
      async (tx) => {
        let reachlistRowsMoved = 0;
        let ir21RowsMoved = 0;
        let discrepancyRowsMoved = 0;
        let aliasesMoved = 0;

        for (const source of sources) {
          const sourceId = source.id;

          // ProviderReachlist is unique per (mno, provider, service) —
          // multiple providers can independently claim the same route, so
          // the source's and target's rows for the same (mno, service) can
          // collide; drop the source's row as a duplicate claim rather
          // than erroring.
          const reachRows = await tx.providerReachlist.findMany({ where: { providerId: sourceId } });
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

          // Ir21Connectivity is unique per (mno, service) with no
          // providerId in the key — one declared provider per route,
          // period — so there's never a clash to resolve here.
          const ir21Result = await tx.ir21Connectivity.updateMany({
            where: { providerId: sourceId },
            data: { providerId: targetId },
          });
          ir21RowsMoved += ir21Result.count;

          const discrepancyResult = await tx.dataDiscrepancy.updateMany({
            where: { providerId: sourceId },
            data: { providerId: targetId },
          });
          discrepancyRowsMoved += discrepancyResult.count;

          const aliasResult = await tx.providerAlias.updateMany({
            where: { providerId: sourceId },
            data: { providerId: targetId },
          });
          aliasesMoved += aliasResult.count;

          const normalizedPattern = normalizeCarrierName(source.providerName);
          if (normalizedPattern) {
            await tx.providerAlias.upsert({
              where: { aliasPattern: normalizedPattern },
              update: { providerId: targetId },
              create: { aliasPattern: normalizedPattern, providerId: targetId },
            });
          }
        }

        await tx.providerMaster.deleteMany({ where: { id: { in: sourceIds } } });

        return { reachlistRowsMoved, ir21RowsMoved, discrepancyRowsMoved, aliasesMoved };
      },
      { maxWait: 30000, timeout: 120000 },
    );

    await this.providerResolver.refreshCache();

    return {
      sourceProviderIds: sourceIds,
      sourceProviderNames: sources.map((s) => s.providerName),
      targetProviderId: targetId,
      targetProviderName: target.providerName,
      providersDeleted: sourceIds.length,
      ...totals,
    };
  }

  /** Deletes a placeholder/junk ProviderMaster row outright ("None", "N/A",
   * a bare "0.0.0.0"). Refuses if it has any real Ir21Connectivity or
   * ProviderReachlist rows attached — normally that means it's an actual
   * duplicate provider needing mergeProvider() instead, not deletion. The
   * one exception `force` covers: an MNO's IR.21 literally declared "None"/
   * "N/A" as its provider for a service, so that connectivity row doesn't
   * represent a real provider claim either — force also deletes those
   * dangling rows, correctly leaving the MNO with no declared provider for
   * that service rather than one pointing at a fake placeholder. */
  async deleteProvider(providerId: number, force = false): Promise<DeleteProviderResult> {
    const provider = await this.prisma.providerMaster.findUnique({ where: { id: providerId } });
    if (!provider) throw new NotFoundException(`Provider ${providerId} not found`);

    const [reachCount, ir21Count] = await Promise.all([
      this.prisma.providerReachlist.count({ where: { providerId } }),
      this.prisma.ir21Connectivity.count({ where: { providerId } }),
    ]);
    if ((reachCount > 0 || ir21Count > 0) && !force) {
      throw new BadRequestException(
        `Provider ${providerId} ("${provider.providerName}") has ${reachCount} ProviderReachlist and ${ir21Count} Ir21Connectivity rows — use merge instead of delete, or pass force=true if these are placeholder rows with no real provider behind them.`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.ir21Connectivity.deleteMany({ where: { providerId } }),
      this.prisma.providerReachlist.deleteMany({ where: { providerId } }),
      this.prisma.providerAlias.deleteMany({ where: { providerId } }),
      this.prisma.providerMaster.delete({ where: { id: providerId } }),
    ]);
    await this.providerResolver.refreshCache();

    return { deletedProviderId: providerId, deletedProviderName: provider.providerName };
  }

  /** Tab 2 of the Provider Normalization & Overrides dashboard: every
   * canonical provider that has at least one registered alias, with each
   * alias's occurrence count computed live from how many raw declared
   * strings across the active dataset (MnoMasterConnectivity's SCCP/GRX-IPX/
   * LTE fields) normalize to that exact pattern. Providers with zero
   * aliases are omitted — nothing to audit there, just noise. */
  async dictionary(): Promise<ProviderNormalizationCard[]> {
    const [providers, aliases, connectivitySnapshots] = await Promise.all([
      this.prisma.providerMaster.findMany({ orderBy: { providerName: "asc" } }),
      this.prisma.providerAlias.findMany({ orderBy: { aliasPattern: "asc" } }),
      this.prisma.mnoMasterConnectivity.findMany({
        select: { primarySccpCarrier: true, backupSccpCarriers: true, grxIpxProviders: true, lteIpxProviders: true },
      }),
    ]);

    const occurrenceCounts = new Map<string, number>();
    for (const c of connectivitySnapshots) {
      const raws = [c.primarySccpCarrier, ...c.backupSccpCarriers, ...c.grxIpxProviders, ...c.lteIpxProviders].filter(
        (v): v is string => !!v,
      );
      for (const raw of raws) {
        const normalized = normalizeCarrierName(raw);
        if (!normalized) continue;
        occurrenceCounts.set(normalized, (occurrenceCounts.get(normalized) ?? 0) + 1);
      }
    }

    const aliasesByProvider = new Map<number, ProviderAliasEntry[]>();
    for (const a of aliases) {
      const list = aliasesByProvider.get(a.providerId) ?? [];
      list.push({ id: a.id, aliasPattern: a.aliasPattern, occurrenceCount: occurrenceCounts.get(a.aliasPattern) ?? 0 });
      aliasesByProvider.set(a.providerId, list);
    }

    return providers
      .map((p) => ({
        providerId: p.id,
        providerName: p.providerName,
        aliases: (aliasesByProvider.get(p.id) ?? []).sort((a, b) => b.occurrenceCount - a.occurrenceCount),
      }))
      .filter((card) => card.aliases.length > 0);
  }

  /** Registers a new raw-string spelling for an existing canonical
   * provider — normalized the same way ingestion normalizes incoming
   * carrier names, so it actually matches future uploads. */
  async addAlias(providerId: number, rawAliasPattern: string): Promise<void> {
    const provider = await this.prisma.providerMaster.findUnique({ where: { id: providerId } });
    if (!provider) throw new NotFoundException(`Provider ${providerId} not found`);

    const normalized = normalizeCarrierName(rawAliasPattern);
    if (!normalized) throw new BadRequestException(`"${rawAliasPattern}" has no resolvable name after normalization`);

    await this.providerResolver.addAlias(provider.id, normalized);
  }

  /** Moves an existing alias to point at a different (or brand-new)
   * canonical provider — thin wrapper over remap(), since an alias's own
   * pattern is already normalized text, exactly what remap() expects as
   * its rawString input. Retroactively repoints every matching
   * Ir21Connectivity row, not just future resolutions. */
  async reassignAlias(aliasId: string, req: ReassignAliasRequest): Promise<RemapProviderResult> {
    const alias = await this.prisma.providerAlias.findUnique({ where: { id: aliasId } });
    if (!alias) throw new NotFoundException("Alias not found");
    return this.remap({ rawString: alias.aliasPattern, ...req });
  }

  /** Detaches an alias from its canonical provider outright. Only affects
   * *future* resolution (removed from the in-memory match cache) — does
   * not retroactively revert already-resolved Ir21Connectivity rows, since
   * silently moving historical data on a simple detach would be
   * surprising; use reassignAlias to actively repoint existing rows
   * instead. Future ingestion of this raw string routes back into the
   * Unmapped Providers queue for triage. */
  async deleteAlias(aliasId: string): Promise<void> {
    const alias = await this.prisma.providerAlias.findUnique({ where: { id: aliasId } });
    if (!alias) throw new NotFoundException("Alias not found");
    await this.prisma.providerAlias.delete({ where: { id: aliasId } });
    await this.providerResolver.refreshCache();
  }

  private toRow = (
    v: {
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
    },
    mnoLookup: Map<string, { operatorName: string; country: string }>,
  ): UnmappedProviderVariantRow => {
    const affectedMnos = v.affectedTadigs.map((tadigCode) => {
      const found = mnoLookup.get(tadigCode);
      return { tadigCode, operatorName: found?.operatorName ?? tadigCode, country: found?.country ?? "" };
    });
    return {
      id: v.id,
      rawCarrierName: v.rawCarrierName,
      normalizedPattern: v.normalizedPattern,
      detectedService: v.detectedService as UnmappedProviderVariantRow["detectedService"],
      affectedMnos,
      affectedMnoCount: affectedMnos.length,
      occurrenceCount: v.occurrenceCount,
      status: v.status as UnmappedProviderVariantRow["status"],
      resolvedProviderId: v.resolvedProviderId,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    };
  };
}
