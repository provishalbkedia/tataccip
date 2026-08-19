import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OnNetMnoRow, ProviderDetail, ProviderSummary } from "@ccip/shared-types";

@Injectable()
export class ProviderService {
  constructor(private prisma: PrismaService) {}

  async search(q?: string): Promise<ProviderSummary[]> {
    const rows = await this.prisma.providerMaster.findMany({
      where: q ? { providerName: { contains: q, mode: "insensitive" } } : undefined,
      orderBy: { providerName: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      providerName: r.providerName,
      providerType: r.providerType,
      headquarters: r.headquarters,
      website: r.website,
    }));
  }

  async detail(id: number): Promise<ProviderDetail> {
    const provider = await this.prisma.providerMaster.findUnique({ where: { id } });
    if (!provider) throw new NotFoundException("Provider not found");

    const [ir21Rows, reachRows] = await Promise.all([
      this.prisma.ir21Connectivity.findMany({
        where: { providerId: id },
        include: { mno: true, service: true },
      }),
      this.prisma.providerReachlist.findMany({
        where: { providerId: id },
        include: { mno: true, service: true },
      }),
    ]);

    const byMno = new Map<
      number,
      { country: string; operatorName: string; tadigCode: string; sccp: boolean; dsx: boolean; ipx: boolean }
    >();

    const touch = (mnoId: number, mno: { country: string; operatorName: string; tadigCode: string }, service: string) => {
      const row = byMno.get(mnoId) ?? {
        country: mno.country,
        operatorName: mno.operatorName,
        tadigCode: mno.tadigCode,
        sccp: false,
        dsx: false,
        ipx: false,
      };
      if (service === "SCCP") row.sccp = true;
      if (service === "DSX") row.dsx = true;
      if (service === "IPX") row.ipx = true;
      byMno.set(mnoId, row);
    };

    for (const r of ir21Rows) touch(r.mnoId, r.mno, r.service.serviceName);
    for (const r of reachRows) touch(r.mnoId, r.mno, r.service.serviceName);

    const onNetMnos: OnNetMnoRow[] = Array.from(byMno.values())
      .map((r) => ({
        country: r.country,
        operatorName: r.operatorName,
        tadigCode: r.tadigCode,
        sccp: r.sccp,
        dsx: r.dsx,
        ipx: r.ipx,
      }))
      .sort((a, b) => a.country.localeCompare(b.country) || a.operatorName.localeCompare(b.operatorName));

    return {
      id: provider.id,
      providerName: provider.providerName,
      providerType: provider.providerType,
      headquarters: provider.headquarters,
      website: provider.website,
      stats: {
        totalCountries: new Set(onNetMnos.map((m) => m.country)).size,
        totalMnos: onNetMnos.length,
        sccpCount: onNetMnos.filter((m) => m.sccp).length,
        dsxCount: onNetMnos.filter((m) => m.dsx).length,
        ipxCount: onNetMnos.filter((m) => m.ipx).length,
      },
      onNetMnos,
    };
  }
}
