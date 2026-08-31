import { Injectable } from "@nestjs/common";
import { RoutingChangeType, ServiceName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { getRegionByCountry } from "../common/utils/region-mapper";
import { Ir21RoutingChangeRow, Ir21RoutingChangeSummary, Region } from "@ccip/shared-types";

const TIMEFRAME_DAYS: Record<string, number | null> = {
  "1m": 30,
  "3m": 90,
  "6m": 180,
  "12m": 365,
  all: null,
};

export interface Ir21RoutingChangeQuery {
  timeframe?: string;
  service?: string;
  changeType?: string;
  providerId?: string;
  providerRole?: string;
  region?: string;
  search?: string;
}

/** IR.21 Market Intelligence & Routing Change Tracker -- reads
 * Ir21RoutingChange rows written by UploadService.applyServiceConnectivity
 * whenever an IR.21 re-upload changes an MNO's single canonical
 * per-service declared provider. Region isn't stored on the row (derived
 * from country the same way every other list page in this app does, via
 * getRegionByCountry), so it's filtered/annotated in memory after the DB
 * query rather than in SQL -- consistent with mno.service.ts's own
 * pattern, and fine at this table's realistic volume (churn events, not
 * the full MNO roster). */
@Injectable()
export class Ir21RoutingChangesService {
  constructor(private prisma: PrismaService) {}

  private async fetchFiltered(query: Ir21RoutingChangeQuery) {
    const days = TIMEFRAME_DAYS[query.timeframe ?? "all"] ?? null;
    const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : undefined;
    const providerId = query.providerId ? parseInt(query.providerId, 10) : undefined;

    // A plain provider filter (no role) matches either side of a change --
    // useful for "show me everything involving X". The Top Gainer/Loser
    // KPI cards instead pass a role so the click narrows to specifically
    // the rows that make that provider a gainer or a loser, not just any
    // row that mentions it.
    const providerFilter =
      providerId && !isNaN(providerId)
        ? query.providerRole === "gainer"
          ? { newProviderId: providerId, changeType: { in: ["ADDED", "REPLACED"] as RoutingChangeType[] } }
          : query.providerRole === "loser"
            ? { oldProviderId: providerId, changeType: { in: ["REMOVED", "REPLACED"] as RoutingChangeType[] } }
            : { OR: [{ oldProviderId: providerId }, { newProviderId: providerId }] }
        : {};

    const rows = await this.prisma.ir21RoutingChange.findMany({
      where: {
        ...(since ? { effectiveDate: { gte: since } } : {}),
        ...(query.service && query.service !== "ALL" ? { serviceName: query.service as ServiceName } : {}),
        ...(query.changeType && query.changeType !== "ALL" ? { changeType: query.changeType as RoutingChangeType } : {}),
        ...providerFilter,
        ...(query.search
          ? {
              OR: [
                { mnoName: { contains: query.search, mode: "insensitive" as const } },
                { tadigCode: { contains: query.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { effectiveDate: "desc" },
      include: { mno: { select: { connectivity: { select: { hasPdfDocument: true } } } } },
    });

    return query.region ? rows.filter((r) => getRegionByCountry(r.country) === query.region) : rows;
  }

  async feed(query: Ir21RoutingChangeQuery): Promise<Ir21RoutingChangeRow[]> {
    const rows = await this.fetchFiltered(query);
    return rows.map((r) => ({
      id: r.id,
      mnoId: r.mnoId,
      tadigCode: r.tadigCode,
      mnoName: r.mnoName,
      country: r.country,
      region: (getRegionByCountry(r.country) as Region | null) ?? null,
      serviceName: r.serviceName,
      changeType: r.changeType,
      oldProviderId: r.oldProviderId,
      oldProviderName: r.oldProviderName,
      newProviderId: r.newProviderId,
      newProviderName: r.newProviderName,
      sourceFile: r.sourceFile,
      effectiveDate: r.effectiveDate.toISOString(),
      ingestedAt: r.ingestedAt.toISOString(),
      hasPdfDocument: r.mno.connectivity?.hasPdfDocument ?? false,
    }));
  }

  async summary(query: Ir21RoutingChangeQuery): Promise<Ir21RoutingChangeSummary> {
    const rows = await this.fetchFiltered(query);

    // Gross gains/losses per provider, not just their net -- a provider
    // can be net-positive overall (more wins than losses) while still
    // genuinely losing real accounts, and a carrier-relations audience
    // specifically wants to see those losses surface even when the
    // provider's portfolio is still growing. netDelta is kept alongside
    // for context, but ranking is on the gross count:
    //   gains  = ADDED (newProvider) + REPLACED (newProvider)
    //   losses = REMOVED (oldProvider) + REPLACED (oldProvider)
    const churn = new Map<number, { name: string; gains: number; losses: number }>();
    const operators = new Map<number, { name: string; tadig: string; count: number }>();

    for (const r of rows) {
      if (r.newProviderId && r.newProviderName) {
        const e = churn.get(r.newProviderId) ?? { name: r.newProviderName, gains: 0, losses: 0 };
        e.gains++;
        churn.set(r.newProviderId, e);
      }
      if (r.oldProviderId && r.oldProviderName) {
        const e = churn.get(r.oldProviderId) ?? { name: r.oldProviderName, gains: 0, losses: 0 };
        e.losses++;
        churn.set(r.oldProviderId, e);
      }
      const opEntry = operators.get(r.mnoId) ?? { name: r.mnoName, tadig: r.tadigCode, count: 0 };
      opEntry.count++;
      operators.set(r.mnoId, opEntry);
    }

    const churnList = [...churn.entries()].map(([id, v]) => ({
      providerId: id,
      providerName: v.name,
      grossGains: v.gains,
      grossLosses: v.losses,
      netDelta: v.gains - v.losses,
    }));

    const topGainingProviders = [...churnList]
      .filter((c) => c.grossGains > 0)
      .sort((a, b) => b.grossGains - a.grossGains)
      .slice(0, 5);

    // Only a provider with at least one real loss counts as a "loser" --
    // a provider with zero losses this period (the common case right
    // after a fresh baseline, before any real churn has had a chance to
    // happen) is never force-fit into the loser slot just to avoid an
    // empty list; the frontend shows an explicit "no losses this period"
    // state instead of fabricating one.
    const topLosingProviders = [...churnList]
      .filter((c) => c.grossLosses > 0)
      .sort((a, b) => b.grossLosses - a.grossLosses)
      .slice(0, 5);

    const top = <V extends { count: number }>(map: Map<number, V>, n: number) =>
      [...map.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, n);

    return {
      totalChurnEvents: rows.length,
      addedCount: rows.filter((r) => r.changeType === "ADDED").length,
      removedCount: rows.filter((r) => r.changeType === "REMOVED").length,
      replacedCount: rows.filter((r) => r.changeType === "REPLACED").length,
      activeSwitchingOperatorCount: operators.size,
      topGainingProviders,
      topLosingProviders,
      topSwitchingOperators: top(operators, 5).map(([id, v]) => ({
        mnoId: id,
        operatorName: v.name,
        tadigCode: v.tadig,
        changeCount: v.count,
      })),
    };
  }
}
