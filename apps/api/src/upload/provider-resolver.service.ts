import { Injectable, OnModuleInit } from "@nestjs/common";
import { ServiceName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { isConfidentSubstringMatch, normalizeCarrierName } from "./provider-normalize";

export type ResolveResult = { status: "resolved"; providerId: number } | { status: "unmapped"; normalizedPattern: string };

@Injectable()
export class ProviderResolverService implements OnModuleInit {
  // normalizedPattern -> providerId
  private cache = new Map<string, number>();

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.refreshCache();
  }

  async refreshCache(): Promise<void> {
    const aliases = await this.prisma.providerAlias.findMany();
    this.cache = new Map(aliases.map((a) => [a.aliasPattern, a.providerId]));
  }

  normalize(raw: string): string {
    return normalizeCarrierName(raw);
  }

  async addAlias(providerId: number, aliasPattern: string): Promise<void> {
    await this.prisma.providerAlias.upsert({
      where: { aliasPattern },
      update: { providerId },
      create: { providerId, aliasPattern },
    });
    this.cache.set(aliasPattern, providerId);
  }

  /** Exact, then substring, match of a normalized name against the alias
   * cache — no side effects (no unmapped-queueing, no auto-create), so
   * callers can decide what "no match" should mean for their ingestion
   * path (XML queues for review; Reach List falls back to auto-create). */
  matchAlias(normalized: string): number | undefined {
    const exact = this.cache.get(normalized);
    if (exact) return exact;

    for (const [pattern, providerId] of this.cache) {
      if (isConfidentSubstringMatch(normalized, pattern)) {
        return providerId;
      }
    }
    return undefined;
  }

  /** Resolves a raw carrier-name string to a ProviderMaster id via exact,
   * then substring, match against the alias cache. On no match, queues the
   * variant in UnmappedProviderVariant for an admin to resolve — does not
   * auto-create a ProviderMaster from unverified XML text. */
  async resolve(rawName: string, detectedService: ServiceName, sourceTadig: string): Promise<ResolveResult> {
    const normalized = this.normalize(rawName);
    if (!normalized) {
      return { status: "unmapped", normalizedPattern: normalized };
    }

    const matched = this.matchAlias(normalized);
    if (matched) {
      return { status: "resolved", providerId: matched };
    }

    const tadig = sourceTadig.trim().toUpperCase();
    const existing = await this.prisma.unmappedProviderVariant.findUnique({
      where: { normalizedPattern: normalized },
      select: { affectedTadigs: true },
    });
    const affectedTadigs = existing?.affectedTadigs.includes(tadig)
      ? existing.affectedTadigs
      : [...(existing?.affectedTadigs ?? []), tadig];

    await this.prisma.unmappedProviderVariant.upsert({
      where: { normalizedPattern: normalized },
      update: {
        occurrenceCount: { increment: 1 },
        rawCarrierName: rawName,
        detectedService,
        affectedTadigs,
      },
      create: {
        rawCarrierName: rawName,
        normalizedPattern: normalized,
        detectedService,
        affectedTadigs,
      },
    });

    return { status: "unmapped", normalizedPattern: normalized };
  }
}
