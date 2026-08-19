import { Injectable, NotFoundException } from "@nestjs/common";
import { ServiceName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ConnectivityMatrixRow, MnoDetail, MnoSummary } from "@ccip/shared-types";

const SERVICE_ORDER: ServiceName[] = ["SCCP", "DSX", "IPX"];

@Injectable()
export class MnoService {
  constructor(private prisma: PrismaService) {}

  async search(params: { q?: string; tadig?: string; country?: string; mcc?: string; mnc?: string }): Promise<MnoSummary[]> {
    const { q, tadig, country, mcc, mnc } = params;
    const rows = await this.prisma.mnoMaster.findMany({
      where: {
        AND: [
          q
            ? {
                OR: [
                  { operatorName: { contains: q, mode: "insensitive" } },
                  { tadigCode: { contains: q, mode: "insensitive" } },
                  { country: { contains: q, mode: "insensitive" } },
                ],
              }
            : {},
          tadig ? { tadigCode: { contains: tadig, mode: "insensitive" } } : {},
          country ? { country: { contains: country, mode: "insensitive" } } : {},
          mcc ? { mcc } : {},
          mnc ? { mnc } : {},
        ],
      },
      orderBy: { operatorName: "asc" },
      take: 200,
    });

    return rows.map((r) => ({
      id: r.id,
      operatorName: r.operatorName,
      country: r.country,
      tadigCode: r.tadigCode,
      mcc: r.mcc,
      mnc: r.mnc,
      status: r.status,
    }));
  }

  async detail(id: number): Promise<MnoDetail> {
    const mno = await this.prisma.mnoMaster.findUnique({
      where: { id },
      include: {
        ir21Entries: { include: { service: true, provider: true } },
        reachlistEntries: { include: { service: true, provider: true } },
      },
    });
    if (!mno) throw new NotFoundException("MNO not found");

    const matrix: ConnectivityMatrixRow[] = SERVICE_ORDER.map((service) => {
      const ir21 = mno.ir21Entries.find((e) => e.service.serviceName === service);
      const reach = mno.reachlistEntries.filter((e) => e.service.serviceName === service);
      return {
        service,
        ir21Provider: ir21?.provider.providerName ?? null,
        reachlistProviders: reach.map((r) => r.provider.providerName),
      };
    });

    return {
      id: mno.id,
      operatorName: mno.operatorName,
      country: mno.country,
      tadigCode: mno.tadigCode,
      mcc: mno.mcc,
      mnc: mno.mnc,
      status: mno.status,
      connectivityMatrix: matrix,
    };
  }
}
