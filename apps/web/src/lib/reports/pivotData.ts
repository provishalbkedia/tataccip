import { CARRIER_CHURN_TYPES, Ir21RoutingChangeRow } from "@ccip/shared-types";
import { getCountryName } from "@/lib/countries";

export type PivotTrend = "Capturing Market" | "Defending" | "Losing Share";

export interface PivotMigrationEntry {
  date: string;
  mnoName: string;
  tadigCode: string;
  country: string;
  service: string;
  actionLabel: "Added" | "Replaced" | "Removed";
  isGain: boolean;
  detail: string;
}

export interface PivotProviderEntry {
  providerId: number;
  providerName: string;
  gains: number;
  losses: number;
  net: number;
  impactedMnoCount: number;
  trend: PivotTrend;
  migrations: PivotMigrationEntry[];
}

const CHURN_TYPES = new Set<string>(CARRIER_CHURN_TYPES);

interface ProviderAccumulator {
  id: number;
  name: string;
  gains: number;
  losses: number;
  mnoIds: Set<number>;
  migrations: PivotMigrationEntry[];
}

function trendOf(net: number): PivotTrend {
  if (net > 0) return "Capturing Market";
  if (net < 0) return "Losing Share";
  return "Defending";
}

/** Per-carrier win/loss pivot with a full MNO-level drill-down list per
 * carrier, built from the same rows CSV/Excel/PDF exports already
 * aggregate from (aggregateCarrierMovement in misReportData.ts) -- kept as
 * its own function here since the pivot needs providerId (for stable
 * expand/collapse keys and Excel row identity) and the actual per-event
 * migration list, neither of which that name-keyed aggregate exposes. */
export function buildPivotData(rows: Ir21RoutingChangeRow[]): PivotProviderEntry[] {
  const byProvider = new Map<number, ProviderAccumulator>();
  const getAcc = (id: number, name: string): ProviderAccumulator => {
    let acc = byProvider.get(id);
    if (!acc) {
      acc = { id, name, gains: 0, losses: 0, mnoIds: new Set(), migrations: [] };
      byProvider.set(id, acc);
    }
    return acc;
  };

  for (const r of rows) {
    if (!CHURN_TYPES.has(r.changeType)) continue;

    if (r.changeType === "ADDED" && r.newProviderId && r.newProviderName) {
      const acc = getAcc(r.newProviderId, r.newProviderName);
      acc.gains++;
      acc.mnoIds.add(r.mnoId);
      acc.migrations.push({
        date: r.effectiveDate,
        mnoName: r.mnoName,
        tadigCode: r.tadigCode,
        country: getCountryName(r.country),
        service: r.serviceName,
        actionLabel: "Added",
        isGain: true,
        detail: "New Addition",
      });
    } else if (r.changeType === "REPLACED") {
      if (r.newProviderId && r.newProviderName) {
        const acc = getAcc(r.newProviderId, r.newProviderName);
        acc.gains++;
        acc.mnoIds.add(r.mnoId);
        acc.migrations.push({
          date: r.effectiveDate,
          mnoName: r.mnoName,
          tadigCode: r.tadigCode,
          country: getCountryName(r.country),
          service: r.serviceName,
          actionLabel: "Replaced",
          isGain: true,
          detail: `Displaced: ${r.oldProviderName ?? "Unknown"}`,
        });
      }
      if (r.oldProviderId && r.oldProviderName) {
        const acc = getAcc(r.oldProviderId, r.oldProviderName);
        acc.losses++;
        acc.mnoIds.add(r.mnoId);
        acc.migrations.push({
          date: r.effectiveDate,
          mnoName: r.mnoName,
          tadigCode: r.tadigCode,
          country: getCountryName(r.country),
          service: r.serviceName,
          actionLabel: "Replaced",
          isGain: false,
          detail: `Lost to: ${r.newProviderName ?? "Unknown"}`,
        });
      }
    } else if (r.changeType === "REMOVED" && r.oldProviderId && r.oldProviderName) {
      const acc = getAcc(r.oldProviderId, r.oldProviderName);
      acc.losses++;
      acc.mnoIds.add(r.mnoId);
      acc.migrations.push({
        date: r.effectiveDate,
        mnoName: r.mnoName,
        tadigCode: r.tadigCode,
        country: getCountryName(r.country),
        service: r.serviceName,
        actionLabel: "Removed",
        isGain: false,
        detail: "No replacement identified",
      });
    }
  }

  return Array.from(byProvider.values())
    .map((acc) => ({
      providerId: acc.id,
      providerName: acc.name,
      gains: acc.gains,
      losses: acc.losses,
      net: acc.gains - acc.losses,
      impactedMnoCount: acc.mnoIds.size,
      trend: trendOf(acc.gains - acc.losses),
      migrations: acc.migrations.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    }))
    .sort((a, b) => b.net - a.net || b.gains - a.gains);
}
