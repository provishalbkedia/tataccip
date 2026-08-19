import { Injectable } from "@nestjs/common";
import { ServiceName, UploadStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { readFirstSheetAsRows, col } from "./excel.util";
import { normalizeProviderName } from "./provider-alias";
import { UploadResult } from "@ccip/shared-types";

// GSMA TADIG codes are always exactly 5 characters: 3-letter country + 2-char operator.
const TADIG_REGEX = /^[A-Z0-9]{5}$/;

@Injectable()
export class UploadService {
  constructor(private prisma: PrismaService) {}

  async getHistory() {
    return this.prisma.uploadHistory.findMany({ orderBy: { uploadTime: "desc" }, take: 100 });
  }

  async uploadIr21(buffer: Buffer, filename: string, uploadedBy: string): Promise<UploadResult> {
    const rows = await readFirstSheetAsRows(buffer);
    const services = await this.serviceMap();
    const providerCache = await this.providerCache();
    const errors: string[] = [];
    const seenTadigs = new Set<string>();
    let recordsLoaded = 0;

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const row = rows[i];
      const country = col(row, "country");
      const operator = col(row, "operator", "operator name");
      const tadigRaw = col(row, "tadig", "tadig code");
      const sccpProvider = col(row, "sccp provider", "sccp");
      const dsxProvider = col(row, "dsx provider", "dsx");
      const ipxProvider = col(row, "ipx provider", "ipx");

      const tadig = tadigRaw.trim().toUpperCase();
      if (!operator || !tadig) {
        errors.push(`Row ${rowNum}: missing Operator or TADIG, skipped.`);
        continue;
      }
      if (!TADIG_REGEX.test(tadig)) {
        errors.push(`Row ${rowNum}: invalid TADIG "${tadig}", skipped.`);
        continue;
      }
      if (seenTadigs.has(tadig)) {
        errors.push(`Row ${rowNum}: duplicate TADIG "${tadig}" in file, skipped.`);
        continue;
      }
      seenTadigs.add(tadig);

      const existingMno = await this.prisma.mnoMaster.findUnique({ where: { tadigCode: tadig } });
      if (existingMno && country && existingMno.country !== country) {
        errors.push(
          `Row ${rowNum}: country mismatch for TADIG "${tadig}" (existing="${existingMno.country}", upload="${country}") — updated to uploaded value.`,
        );
      }

      const mno = await this.prisma.mnoMaster.upsert({
        where: { tadigCode: tadig },
        update: {
          operatorName: operator,
          country: country || existingMno?.country || "UNKNOWN",
        },
        create: {
          operatorName: operator,
          country: country || "UNKNOWN",
          mcc: col(row, "mcc") || "000",
          mnc: col(row, "mnc") || "00",
          countryCode: col(row, "country code") || country.slice(0, 2).toUpperCase() || "XX",
          tadigCode: tadig,
        },
      });

      const serviceProviders: [ServiceName, string][] = [
        ["SCCP", sccpProvider],
        ["DSX", dsxProvider],
        ["IPX", ipxProvider],
      ];

      for (const [serviceName, providerRaw] of serviceProviders) {
        if (!providerRaw) continue;
        const providerId = await this.resolveProvider(providerRaw, providerCache);
        await this.prisma.ir21Connectivity.upsert({
          where: { mnoId_serviceId: { mnoId: mno.id, serviceId: services.get(serviceName)! } },
          update: { providerId, sourceFile: filename, effectiveDate: new Date() },
          create: {
            mnoId: mno.id,
            providerId,
            serviceId: services.get(serviceName)!,
            sourceFile: filename,
            effectiveDate: new Date(),
          },
        });
        recordsLoaded++;
      }
    }

    const status = this.deriveStatus(recordsLoaded, errors.length);
    const uploadHistory = await this.prisma.uploadHistory.create({
      data: {
        filename,
        uploadedBy,
        recordsLoaded,
        status,
        errorLog: errors.length ? errors.join("\n") : null,
      },
    });

    return { uploadHistory: this.toHistoryRow(uploadHistory), errors };
  }

  async uploadReachlist(buffer: Buffer, filename: string, uploadedBy: string): Promise<UploadResult> {
    const rows = await readFirstSheetAsRows(buffer);
    const services = await this.serviceMap();
    const providerCache = await this.providerCache();
    const errors: string[] = [];
    const seenKeys = new Set<string>();
    let recordsLoaded = 0;

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const row = rows[i];
      const providerRaw = col(row, "provider");
      const country = col(row, "country");
      const mnoName = col(row, "mno", "operator");
      const tadigRaw = col(row, "tadig", "tadig code");
      const servicesRaw = col(row, "services", "service");

      const tadig = tadigRaw.trim().toUpperCase();
      if (!providerRaw || !tadig) {
        errors.push(`Row ${rowNum}: missing Provider or TADIG, skipped.`);
        continue;
      }
      if (!TADIG_REGEX.test(tadig)) {
        errors.push(`Row ${rowNum}: invalid TADIG "${tadig}", skipped.`);
        continue;
      }

      const serviceTokens = servicesRaw
        .split(/[,;/]/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      const validServiceTokens = serviceTokens.filter((t): t is ServiceName =>
        services.has(t as ServiceName),
      );
      if (validServiceTokens.length === 0) {
        errors.push(`Row ${rowNum}: no valid Services listed for TADIG "${tadig}", skipped.`);
        continue;
      }

      const existingMno = await this.prisma.mnoMaster.findUnique({ where: { tadigCode: tadig } });
      if (existingMno && country && existingMno.country !== country) {
        errors.push(
          `Row ${rowNum}: country mismatch for TADIG "${tadig}" (existing="${existingMno.country}", upload="${country}").`,
        );
      }

      const mno = await this.prisma.mnoMaster.upsert({
        where: { tadigCode: tadig },
        update: {},
        create: {
          operatorName: mnoName || tadig,
          country: country || "UNKNOWN",
          mcc: "000",
          mnc: "00",
          countryCode: country.slice(0, 2).toUpperCase() || "XX",
          tadigCode: tadig,
        },
      });

      const providerId = await this.resolveProvider(providerRaw, providerCache);

      for (const serviceName of validServiceTokens) {
        const dedupeKey = `${tadig}|${providerId}|${serviceName}`;
        if (seenKeys.has(dedupeKey)) {
          errors.push(`Row ${rowNum}: duplicate (TADIG, Provider, Service) "${dedupeKey}" in file, skipped.`);
          continue;
        }
        seenKeys.add(dedupeKey);

        await this.prisma.providerReachlist.upsert({
          where: {
            mnoId_providerId_serviceId: {
              mnoId: mno.id,
              providerId,
              serviceId: services.get(serviceName)!,
            },
          },
          update: { sourceFile: filename, effectiveDate: new Date() },
          create: {
            mnoId: mno.id,
            providerId,
            serviceId: services.get(serviceName)!,
            sourceFile: filename,
            effectiveDate: new Date(),
          },
        });
        recordsLoaded++;
      }
    }

    const status = this.deriveStatus(recordsLoaded, errors.length);
    const uploadHistory = await this.prisma.uploadHistory.create({
      data: {
        filename,
        uploadedBy,
        recordsLoaded,
        status,
        errorLog: errors.length ? errors.join("\n") : null,
      },
    });

    return { uploadHistory: this.toHistoryRow(uploadHistory), errors };
  }

  private deriveStatus(recordsLoaded: number, errorCount: number): UploadStatus {
    if (recordsLoaded === 0) return UploadStatus.FAILED;
    if (errorCount > 0) return UploadStatus.PARTIAL;
    return UploadStatus.SUCCESS;
  }

  private toHistoryRow(h: {
    id: number;
    filename: string;
    uploadTime: Date;
    uploadedBy: string;
    recordsLoaded: number;
    status: UploadStatus;
    errorLog: string | null;
  }) {
    return {
      id: h.id,
      filename: h.filename,
      uploadTime: h.uploadTime.toISOString(),
      uploadedBy: h.uploadedBy,
      recordsLoaded: h.recordsLoaded,
      status: h.status,
      errorLog: h.errorLog,
    };
  }

  private async serviceMap(): Promise<Map<ServiceName, number>> {
    const services = await this.prisma.service.findMany();
    return new Map(services.map((s) => [s.serviceName, s.id]));
  }

  private async providerCache(): Promise<Map<string, number>> {
    const providers = await this.prisma.providerMaster.findMany();
    return new Map(providers.map((p) => [p.providerName.toLowerCase(), p.id]));
  }

  private async resolveProvider(raw: string, cache: Map<string, number>): Promise<number> {
    const canonical = normalizeProviderName(raw);
    const key = canonical.toLowerCase();
    const cached = cache.get(key);
    if (cached) return cached;

    const created = await this.prisma.providerMaster.create({
      data: { providerName: canonical, providerType: "IPX Provider" },
    });
    cache.set(key, created.id);
    return created.id;
  }
}
