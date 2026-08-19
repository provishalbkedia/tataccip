import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { DashboardMetrics } from "@ccip/shared-types";

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async metrics(): Promise<DashboardMetrics> {
    const [totalMnos, totalProviders, totalIr21, totalReach, sccp, dsx, ipx, discrepancyCount] = await Promise.all([
      this.prisma.mnoMaster.count(),
      this.prisma.providerMaster.count(),
      this.prisma.ir21Connectivity.count(),
      this.prisma.providerReachlist.count(),
      this.prisma.ir21Connectivity.count({ where: { service: { serviceName: "SCCP" } } }),
      this.prisma.ir21Connectivity.count({ where: { service: { serviceName: "DSX" } } }),
      this.prisma.ir21Connectivity.count({ where: { service: { serviceName: "IPX" } } }),
      this.prisma.dataDiscrepancy.count(),
    ]);

    return {
      totalMnos,
      totalProviders,
      totalConnections: totalIr21 + totalReach,
      sccpCount: sccp,
      dsxCount: dsx,
      ipxCount: ipx,
      discrepancyCount,
    };
  }
}
