import { Injectable } from "@nestjs/common";
import { ServiceName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ProviderResolverService } from "../upload/provider-resolver.service";
import { DashboardMetrics } from "@ccip/shared-types";

type ServiceSets = Record<ServiceName, Set<string>>;

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private providerResolver: ProviderResolverService,
  ) {}

  async metrics(): Promise<DashboardMetrics> {
    const [
      rawMnoCount,
      authoritativeMnoCount,
      ir21Rows,
      connectivityRows,
      reachProviderIds,
      ir21ProviderIds,
      pendingMnoNormalizationCount,
    ] = await Promise.all([
      this.prisma.mnoMaster.count(),
      this.prisma.mnoMaster.count({ where: { connectivity: { isNot: null } } }),
      this.prisma.ir21Connectivity.findMany({ select: { mnoId: true, providerId: true, service: { select: { serviceName: true } } } }),
      this.prisma.mnoMasterConnectivity.findMany({
        select: { mnoId: true, primarySccpCarrier: true, backupSccpCarriers: true, grxIpxProviders: true, lteIpxProviders: true },
      }),
      this.prisma.providerReachlist.findMany({ select: { providerId: true }, distinct: ["providerId"] }),
      this.prisma.ir21Connectivity.findMany({ select: { providerId: true }, distinct: ["providerId"] }),
      this.prisma.mnoNormalizationAudit.count({ where: { matchStatus: "PENDING_REVIEW" } }),
    ]);

    // ProviderMaster.count() alone counts every row ever created, including
    // ones an early/unrefined ingestion pass created from stray XML text
    // (e.g. "STP 1", "as backup") that never resolved to a real, in-use
    // provider. "Total Providers" should mean providers actually backing a
    // connectivity/reach record, not the raw row count.
    const totalProviders = new Set([
      ...reachProviderIds.map((p) => p.providerId),
      ...ir21ProviderIds.map((p) => p.providerId),
    ]).size;

    // Ir21Connectivity stores exactly one resolved provider per (mnoId,
    // serviceId) -- the MNO's single declared *primary* carrier -- even
    // when the source XML lists several (a backup SCCP carrier, or
    // anything past index [0] of the GRX/IPX or LTE/Diameter arrays). A
    // dashboard count built from Ir21Connectivity alone therefore silently
    // undercounts every MNO that multi-homes a service (e.g. a primary +
    // backup SCCP carrier) -- see ProviderService.buildMultiHomedProviderIndex,
    // which closes the same gap for Provider Detail/Comparison Grid. This
    // re-resolves every raw carrier string in MnoMasterConnectivity against
    // the same alias cache ingestion uses, so "SCCP Relationships" here
    // means the same thing the per-MNO Comparison Grid already shows: every
    // distinct (MNO, provider) pair declared for that service, primary and
    // secondary/backup alike -- not just the one row Ir21Connectivity keeps
    // as the canonical/possibly-admin-overridden primary.
    const sets: ServiceSets = { SCCP: new Set(), DSX: new Set(), IPX: new Set() };
    const mark = (service: ServiceName, mnoId: number, providerId: number) => sets[service].add(`${mnoId}_${providerId}`);

    // The Ir21Connectivity row is always counted first -- guarantees an
    // admin-overridden primary provider (one that doesn't literally match
    // any raw XML string) is never dropped, same guarantee
    // resolveAllDeclaredProviders gives the Comparison Grid.
    for (const r of ir21Rows) mark(r.service.serviceName, r.mnoId, r.providerId);

    for (const c of connectivityRows) {
      const checks: [ServiceName, (string | null)[]][] = [
        ["SCCP", [c.primarySccpCarrier, ...c.backupSccpCarriers]],
        ["DSX", c.lteIpxProviders],
        ["IPX", c.grxIpxProviders],
      ];
      for (const [service, candidates] of checks) {
        for (const raw of candidates) {
          if (!raw) continue;
          const normalized = this.providerResolver.normalize(raw);
          if (!normalized) continue;
          const providerId = this.providerResolver.matchAlias(normalized);
          if (providerId) mark(service, c.mnoId, providerId);
        }
      }
    }

    const sccpCount = sets.SCCP.size;
    const dsxCount = sets.DSX.size;
    const ipxCount = sets.IPX.size;

    return {
      totalMnos: authoritativeMnoCount,
      reachlistOnlyMnoCount: rawMnoCount - authoritativeMnoCount,
      pendingMnoNormalizationCount,
      totalProviders,
      // Strictly the sum of the three IR.21-scoped service counts below --
      // deliberately never mixes in providerReachlist (unverified
      // commercial Reach List rows) the way this used to.
      totalConnections: sccpCount + dsxCount + ipxCount,
      sccpCount,
      dsxCount,
      ipxCount,
    };
  }
}
