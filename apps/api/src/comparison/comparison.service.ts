import { Injectable } from "@nestjs/common";
import { DiscrepancyType, ServiceName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { DiscrepancyRow } from "@ccip/shared-types";
import { ComparisonFilterDto } from "./dto/comparison-filter.dto";

interface ProviderRef {
  providerId: number;
  providerName: string;
}

@Injectable()
export class ComparisonService {
  constructor(private prisma: PrismaService) {}

  /** Rebuilds DataDiscrepancy from scratch by diffing IR21Connectivity
   * against ProviderReachlist per (MNO, service). See plan doc for the
   * three discrepancy types this produces. */
  async run(): Promise<{ discrepancyCount: number }> {
    const [ir21Rows, reachRows] = await Promise.all([
      this.prisma.ir21Connectivity.findMany({ include: { provider: true } }),
      this.prisma.providerReachlist.findMany({ include: { provider: true } }),
    ]);

    const ir21Map = new Map<string, ProviderRef>();
    for (const row of ir21Rows) {
      ir21Map.set(this.key(row.mnoId, row.serviceId), {
        providerId: row.providerId,
        providerName: row.provider.providerName,
      });
    }

    const reachMap = new Map<string, ProviderRef[]>();
    for (const row of reachRows) {
      const key = this.key(row.mnoId, row.serviceId);
      const list = reachMap.get(key) ?? [];
      list.push({ providerId: row.providerId, providerName: row.provider.providerName });
      reachMap.set(key, list);
    }

    const serviceById = new Map((await this.prisma.service.findMany()).map((s) => [s.id, s.serviceName]));

    const allKeys = new Set<string>([...ir21Map.keys(), ...reachMap.keys()]);

    const toCreate: {
      mnoId: number;
      providerId: number | null;
      service: ServiceName;
      ir21Status: string;
      reachlistStatus: string;
      discrepancyType: DiscrepancyType;
    }[] = [];

    for (const key of allKeys) {
      const [mnoIdStr, serviceIdStr] = key.split("|");
      const mnoId = Number(mnoIdStr);
      const serviceId = Number(serviceIdStr);
      const serviceName = serviceById.get(serviceId)!;

      const ir21Entry = ir21Map.get(key);
      const reachEntries = reachMap.get(key) ?? [];

      if (ir21Entry && reachEntries.length === 0) {
        toCreate.push({
          mnoId,
          providerId: ir21Entry.providerId,
          service: serviceName,
          ir21Status: ir21Entry.providerName,
          reachlistStatus: "Not found in any reach list",
          discrepancyType: DiscrepancyType.MISSING_IN_REACHLIST,
        });
      } else if (ir21Entry && reachEntries.length > 0) {
        const matched = reachEntries.some((r) => r.providerId === ir21Entry.providerId);
        if (!matched) {
          toCreate.push({
            mnoId,
            providerId: ir21Entry.providerId,
            service: serviceName,
            ir21Status: ir21Entry.providerName,
            reachlistStatus: "Not found in any reach list",
            discrepancyType: DiscrepancyType.MISSING_IN_REACHLIST,
          });
        }
        for (const r of reachEntries) {
          if (r.providerId !== ir21Entry.providerId) {
            toCreate.push({
              mnoId,
              providerId: r.providerId,
              service: serviceName,
              ir21Status: ir21Entry.providerName,
              reachlistStatus: `${r.providerName} claims this service`,
              discrepancyType: DiscrepancyType.PROVIDER_MISMATCH,
            });
          }
        }
      } else if (!ir21Entry && reachEntries.length > 0) {
        for (const r of reachEntries) {
          toCreate.push({
            mnoId,
            providerId: r.providerId,
            service: serviceName,
            ir21Status: "Not declared in IR21",
            reachlistStatus: r.providerName,
            discrepancyType: DiscrepancyType.MISSING_IN_IR21,
          });
        }
      }
    }

    await this.prisma.dataDiscrepancy.deleteMany({});
    if (toCreate.length > 0) {
      await this.prisma.dataDiscrepancy.createMany({ data: toCreate });
    }

    return { discrepancyCount: toCreate.length };
  }

  async find(filters: ComparisonFilterDto): Promise<DiscrepancyRow[]> {
    const rows = await this.prisma.dataDiscrepancy.findMany({
      where: {
        mnoId: filters.mnoId,
        providerId: filters.providerId,
        service: filters.service,
        discrepancyType: filters.discrepancyType,
        mno: filters.country ? { country: { equals: filters.country, mode: "insensitive" } } : undefined,
      },
      include: { mno: true, provider: true },
      orderBy: [{ computedAt: "desc" }, { id: "asc" }],
    });

    return rows.map((r) => ({
      id: r.id,
      mnoId: r.mnoId,
      operatorName: r.mno.operatorName,
      country: r.mno.country,
      tadigCode: r.mno.tadigCode,
      providerId: r.providerId,
      providerName: r.provider?.providerName ?? null,
      service: r.service,
      ir21Status: r.ir21Status,
      reachlistStatus: r.reachlistStatus,
      discrepancyType: r.discrepancyType,
      computedAt: r.computedAt.toISOString(),
    }));
  }

  private key(mnoId: number, serviceId: number): string {
    return `${mnoId}|${serviceId}`;
  }
}
