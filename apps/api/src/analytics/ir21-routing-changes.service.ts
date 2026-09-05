import { Injectable } from "@nestjs/common";
import { RoutingChangeType, ServiceName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { getRegionByCountry } from "../common/utils/region-mapper";
import { CARRIER_CHURN_TYPES, Ir21RoutingChangeRow, Ir21RoutingChangeSummary, Region } from "@ccip/shared-types";

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

    // changeType semantics (see Ir21RoutingChangeFilters/ChangeTypeFilter):
    // omitted/"" -> the default "All Carrier Churn" view (ADDED/REMOVED/
    // REPLACED only, onboarding-flagged rows excluded); "ALL" -> "Show
    // Everything", no restriction at all; any single RoutingChangeType ->
    // that type only, still excluding onboarding rows for the 3 churn types
    // (CONFIG_UPDATE/ADMIN_UPDATE are never onboarding-flagged, so the
    // exclusion is a no-op for them).
    let changeTypeWhere: Record<string, unknown> = {};
    if (!query.changeType) {
      changeTypeWhere = { changeType: { in: CARRIER_CHURN_TYPES as RoutingChangeType[] }, isInitialOnboarding: false };
    } else if (query.changeType !== "ALL") {
      changeTypeWhere = { changeType: query.changeType as RoutingChangeType };
      if ((CARRIER_CHURN_TYPES as string[]).includes(query.changeType)) {
        changeTypeWhere.isInitialOnboarding = false;
      }
    }

    const rows = await this.prisma.ir21RoutingChange.findMany({
      where: {
        ...(since ? { effectiveDate: { gte: since } } : {}),
        ...(query.service && query.service !== "ALL" ? { serviceName: query.service as ServiceName } : {}),
        ...changeTypeWhere,
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
      description: r.description,
      changeSource: r.changeSource,
      isInitialOnboarding: r.isInitialOnboarding,
      isManuallyReviewed: r.isManuallyReviewed,
      sourceFile: r.sourceFile,
      effectiveDate: r.effectiveDate.toISOString(),
      ingestedAt: r.ingestedAt.toISOString(),
      hasPdfDocument: r.mno.connectivity?.hasPdfDocument ?? false,
    }));
  }

  async summary(query: Ir21RoutingChangeQuery): Promise<Ir21RoutingChangeSummary> {
    // Forced to the default churn-only scope regardless of what changeType
    // the caller passed -- every KPI here must reflect genuine carrier
    // routing switches only, never a CONFIG_UPDATE/ADMIN_UPDATE or an
    // onboarding-flagged row, no matter what the feed table itself is
    // currently filtered to. The frontend's own overview query already
    // never sends changeType for this reason; this is the defensive
    // backstop.
    const rows = await this.fetchFiltered({ ...query, changeType: undefined });

    // Gross gains/losses per provider, not just their net -- a provider
    // can be net-positive overall (more wins than losses) while still
    // genuinely losing real accounts, and a carrier-relations audience
    // specifically wants to see those losses surface even when the
    // provider's portfolio is still growing. netDelta is kept alongside
    // for context, but ranking is on the gross count:
    //   gains  = ADDED (newProvider) + REPLACED (newProvider)
    //   losses = REMOVED (oldProvider) + REPLACED (oldProvider)
    // gainMnoIds/lossMnoIds are Sets, not counts -- the same MNO can
    // generate more than one gain (or loss) event for a provider within
    // one period (e.g. ADDED on SCCP and separately on DSX), and
    // uniqueOperatorsCount below needs the distinct account count, not the
    // raw event count grossGains/grossLosses already report.
    const churn = new Map<number, { name: string; gains: number; losses: number; gainMnoIds: Set<number>; lossMnoIds: Set<number> }>();
    const operators = new Map<number, { name: string; tadig: string; count: number }>();

    for (const r of rows) {
      if (r.newProviderId && r.newProviderName) {
        const e = churn.get(r.newProviderId) ?? { name: r.newProviderName, gains: 0, losses: 0, gainMnoIds: new Set<number>(), lossMnoIds: new Set<number>() };
        e.gains++;
        e.gainMnoIds.add(r.mnoId);
        churn.set(r.newProviderId, e);
      }
      if (r.oldProviderId && r.oldProviderName) {
        const e = churn.get(r.oldProviderId) ?? { name: r.oldProviderName, gains: 0, losses: 0, gainMnoIds: new Set<number>(), lossMnoIds: new Set<number>() };
        e.losses++;
        e.lossMnoIds.add(r.mnoId);
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
      uniqueGainOperators: v.gainMnoIds.size,
      uniqueLossOperators: v.lossMnoIds.size,
    }));

    // Unsliced -- the frontend's Top Gainer/Loser KPI cards show entry [0]
    // as the headline figure but also expose the full ranked list in a
    // dropdown so a carrier-relations reviewer can pivot the table to any
    // provider's gains/losses, not just the single top one.
    //
    // uniqueOperatorsCount is context-relative -- gains-side for the
    // gainer list, losses-side for the loser list -- since a raw gross
    // count (e.g. 178 gains) conflates one operator switching to a
    // provider on all three services with 178 distinct operators each
    // switching once; the KPI cards need the distinct-account figure
    // alongside the event count, not instead of it.
    const topGainingProviders = [...churnList]
      .filter((c) => c.grossGains > 0)
      .sort((a, b) => b.grossGains - a.grossGains)
      .map(({ uniqueGainOperators, uniqueLossOperators: _uniqueLossOperators, ...rest }) => ({ ...rest, uniqueOperatorsCount: uniqueGainOperators }));

    // Only a provider with at least one real loss counts as a "loser" --
    // a provider with zero losses this period (the common case right
    // after a fresh baseline, before any real churn has had a chance to
    // happen) is never force-fit into the loser slot just to avoid an
    // empty list; the frontend shows an explicit "no losses this period"
    // state instead of fabricating one.
    const topLosingProviders = [...churnList]
      .filter((c) => c.grossLosses > 0)
      .sort((a, b) => b.grossLosses - a.grossLosses)
      .map(({ uniqueLossOperators, uniqueGainOperators: _uniqueGainOperators, ...rest }) => ({ ...rest, uniqueOperatorsCount: uniqueLossOperators }));

    return {
      totalChurnEvents: rows.length,
      addedCount: rows.filter((r) => r.changeType === "ADDED").length,
      removedCount: rows.filter((r) => r.changeType === "REMOVED").length,
      replacedCount: rows.filter((r) => r.changeType === "REPLACED").length,
      activeSwitchingOperatorCount: operators.size,
      topGainingProviders,
      topLosingProviders,
      // Unsliced, same reasoning as topGainingProviders/topLosingProviders
      // above -- the "Active Switching Operators" KPI card's own search
      // control needs the full ranked list, not just the top few.
      topSwitchingOperators: [...operators.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .map(([id, v]) => ({
          mnoId: id,
          operatorName: v.name,
          tadigCode: v.tadig,
          changeCount: v.count,
        })),
    };
  }

  /** Admin override from the IR.21 Change Log & Normalization Review screen
   * -- corrects an automatic classification (e.g. a CONFIG_UPDATE that was
   * actually an ADMIN_UPDATE, or a bulk-load ADDED row that either
   * genuinely was or wasn't real churn). Always stamps isManuallyReviewed
   * so a corrected row is distinguishable from the original automatic
   * classification in the audit trail. */
  async reclassify(id: string, changeType: RoutingChangeType, isInitialOnboarding?: boolean) {
    return this.prisma.ir21RoutingChange.update({
      where: { id },
      data: {
        changeType,
        ...(isInitialOnboarding !== undefined ? { isInitialOnboarding } : {}),
        isManuallyReviewed: true,
      },
    });
  }
}
