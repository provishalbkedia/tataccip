import { Injectable, NotFoundException } from "@nestjs/common";
import { ServiceName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ConnectivityMatrixRow, MnoDetail, MnoSummary } from "@ccip/shared-types";

const SERVICE_ORDER: ServiceName[] = ["SCCP", "DSX", "IPX"];

/** Merges primary + backup SCCP carriers into one deduplicated list — the
 * search grid's consolidated "SCCP Provider(s)" column doesn't distinguish
 * primary/backup role (the detail page's Roaming Signaling section still
 * does, via connectivitySnapshot). */
function mergeSccpProviders(connectivity: { primarySccpCarrier: string | null; backupSccpCarriers: string[] } | null): string[] {
  if (!connectivity) return [];
  const all = [connectivity.primarySccpCarrier, ...connectivity.backupSccpCarriers].filter(
    (v): v is string => v !== null,
  );
  return Array.from(new Set(all));
}

@Injectable()
export class MnoService {
  constructor(private prisma: PrismaService) {}

  /** Searches MnoMaster (the canonical operator identity table — every MNO
   * the platform knows about, from any ingestion path) enriched with
   * MnoMasterConnectivity where an IR.21 XML has been ingested for it. MNOs
   * without a connectivity snapshot yet still appear, with those columns
   * null, rather than disappearing from search until someone uploads their
   * XML — the connectivity table is an enrichment layer, not the operator
   * registry. `q` free-text matches across TADIG/operator/country plus the
   * XML-sourced networkType, primarySccpCarrier, backupSccpCarriers, and
   * the GRX/IPX/LTE provider name arrays (via a raw substring-on-array-
   * element query — Prisma's array filters only support exact-element
   * matches), so a carrier appearing anywhere in the consolidated SCCP/
   * DSX/IPX provider columns surfaces the same way in results, regardless
   * of primary/backup role. */
  async search(params: { q?: string; tadig?: string; country?: string; mcc?: string; mnc?: string }): Promise<MnoSummary[]> {
    const { q, tadig, country, mcc, mnc } = params;

    let arrayMatchMnoIds: number[] = [];
    if (q) {
      const rows = await this.prisma.$queryRaw<{ mnoId: number }[]>`
        SELECT "mnoId" FROM "MnoMasterConnectivity"
        WHERE EXISTS (SELECT 1 FROM unnest("mccMncList") x WHERE x ILIKE ${"%" + q + "%"})
           OR EXISTS (SELECT 1 FROM unnest("grxIpxProviders") x WHERE x ILIKE ${"%" + q + "%"})
           OR EXISTS (SELECT 1 FROM unnest("lteIpxProviders") x WHERE x ILIKE ${"%" + q + "%"})
           OR EXISTS (SELECT 1 FROM unnest("backupSccpCarriers") x WHERE x ILIKE ${"%" + q + "%"})
      `;
      arrayMatchMnoIds = rows.map((r) => r.mnoId);
    }

    const rows = await this.prisma.mnoMaster.findMany({
      where: {
        AND: [
          q
            ? {
                OR: [
                  { operatorName: { contains: q, mode: "insensitive" } },
                  { tadigCode: { contains: q, mode: "insensitive" } },
                  { country: { contains: q, mode: "insensitive" } },
                  { connectivity: { networkType: { contains: q, mode: "insensitive" } } },
                  { connectivity: { primarySccpCarrier: { contains: q, mode: "insensitive" } } },
                  ...(arrayMatchMnoIds.length > 0 ? [{ id: { in: arrayMatchMnoIds } }] : []),
                ],
              }
            : {},
          tadig ? { tadigCode: { contains: tadig, mode: "insensitive" } } : {},
          country ? { country: { contains: country, mode: "insensitive" } } : {},
          mcc ? { mcc } : {},
          mnc ? { mnc } : {},
        ],
      },
      include: { connectivity: true },
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
      networkType: r.connectivity?.networkType ?? null,
      sccpProviders: mergeSccpProviders(r.connectivity),
      dsxProviders: r.connectivity?.lteIpxProviders ?? [],
      ipxProviders: r.connectivity?.grxIpxProviders ?? [],
      lastEffectiveDate: r.connectivity?.lastEffectiveDate?.toISOString() ?? null,
    }));
  }

  async detail(id: number): Promise<MnoDetail> {
    const mno = await this.prisma.mnoMaster.findUnique({
      where: { id },
      include: {
        ir21Entries: { include: { service: true, provider: true } },
        reachlistEntries: { include: { service: true, provider: true } },
        connectivity: true,
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
      networkType: mno.connectivity?.networkType ?? null,
      sccpProviders: mergeSccpProviders(mno.connectivity),
      dsxProviders: mno.connectivity?.lteIpxProviders ?? [],
      ipxProviders: mno.connectivity?.grxIpxProviders ?? [],
      lastEffectiveDate: mno.connectivity?.lastEffectiveDate?.toISOString() ?? null,
      connectivityMatrix: matrix,
      connectivitySnapshot: mno.connectivity
        ? {
            networkType: mno.connectivity.networkType,
            mccMncList: mno.connectivity.mccMncList,
            primarySccpCarrier: mno.connectivity.primarySccpCarrier,
            backupSccpCarriers: mno.connectivity.backupSccpCarriers,
            sccpPointCodes: mno.connectivity.sccpPointCodes,
            grxIpxProviders: mno.connectivity.grxIpxProviders,
            lteIpxProviders: mno.connectivity.lteIpxProviders,
            interPmnIpRanges: mno.connectivity.interPmnIpRanges,
            diameterEdgeAgentFqdn: mno.connectivity.diameterEdgeAgentFqdn,
            authoritativeDnsIps: mno.connectivity.authoritativeDnsIps,
            epcRealms: mno.connectivity.epcRealms,
            roamingCoordinatorEmail: mno.connectivity.roamingCoordinatorEmail,
            ts24x7Email: mno.connectivity.ts24x7Email,
            distributionEmail: mno.connectivity.distributionEmail,
            xmlFileVersion: mno.connectivity.xmlFileVersion,
            lastEffectiveDate: mno.connectivity.lastEffectiveDate?.toISOString() ?? null,
            lastParsedAt: mno.connectivity.lastParsedAt.toISOString(),
          }
        : null,
    };
  }
}
