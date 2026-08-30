import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { DashboardMetrics } from "@ccip/shared-types";

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async metrics(): Promise<DashboardMetrics> {
    const [
      totalMnos,
      mnosWithIr21Declaration,
      totalIr21,
      totalReach,
      sccp,
      dsx,
      ipx,
      reachProviderIds,
      ir21ProviderIds,
    ] = await Promise.all([
      this.prisma.mnoMaster.count(),
      this.prisma.mnoMaster.count({ where: { connectivity: { isNot: null } } }),
      this.prisma.ir21Connectivity.count(),
      this.prisma.providerReachlist.count(),
      this.prisma.ir21Connectivity.count({ where: { service: { serviceName: "SCCP" } } }),
      this.prisma.ir21Connectivity.count({ where: { service: { serviceName: "DSX" } } }),
      this.prisma.ir21Connectivity.count({ where: { service: { serviceName: "IPX" } } }),
      this.prisma.providerReachlist.findMany({ select: { providerId: true }, distinct: ["providerId"] }),
      this.prisma.ir21Connectivity.findMany({ select: { providerId: true }, distinct: ["providerId"] }),
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

    return {
      totalMnos,
      mnosWithIr21Declaration,
      totalProviders,
      totalConnections: totalIr21 + totalReach,
      sccpCount: sccp,
      dsxCount: dsx,
      ipxCount: ipx,
    };
  }
}
