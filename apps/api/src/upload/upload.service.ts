import { Injectable, Logger } from "@nestjs/common";
import { ServiceName, UploadStatus } from "@prisma/client";
import AdmZip from "adm-zip";
import { PrismaService } from "../prisma/prisma.service";
import { readFirstSheetAsRows, col } from "./excel.util";
import { normalizeProviderName } from "./provider-alias";
import { isJunkProviderName, splitCompositeProviderNames } from "./provider-normalize";
import { Ir21XmlParserService, ParsedIr21Document } from "./ir21-xml-parser.service";
import { ProviderResolverService } from "./provider-resolver.service";
import { SupabaseStorageService } from "./supabase-storage.service";
import { BulkXmlUploadResult, UploadResult } from "@ccip/shared-types";

// GSMA TADIG codes are always exactly 5 characters: 3-letter country + 2-char operator.
const TADIG_REGEX = /^[A-Z0-9]{5}$/;

type UploadedFile = { buffer: Buffer; originalname: string };

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private prisma: PrismaService,
    private xmlParser: Ir21XmlParserService,
    private providerResolver: ProviderResolverService,
    private storage: SupabaseStorageService,
  ) {}

  async getHistory() {
    return this.prisma.uploadHistory.findMany({ orderBy: { uploadTime: "desc" }, take: 100 });
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

      // A single "Provider" cell can list more than one carrier (e.g.
      // "Arelion, CMI, BBIS") — split before resolving so each becomes its
      // own ProviderReachlist row against its own canonical provider,
      // rather than one row against a bogus composite ProviderMaster.
      // Placeholder tokens ("None", "N/A") are dropped here rather than
      // resolved — otherwise they'd auto-create their own junk provider.
      const providerTokens = splitCompositeProviderNames(providerRaw).filter((token) => {
        if (isJunkProviderName(this.providerResolver.normalize(token))) {
          errors.push(`Row ${rowNum}: Provider token "${token}" is a placeholder, not a real provider, skipped.`);
          return false;
        }
        return true;
      });
      if (providerTokens.length === 0) {
        errors.push(`Row ${rowNum}: Provider "${providerRaw}" had no resolvable name after cleanup, skipped.`);
        continue;
      }

      for (const providerToken of providerTokens) {
        const providerId = await this.resolveProvider(providerToken, providerCache);

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

  /** Ingests a batch of GSMA IR.21 XML files (each may itself be a .zip of
   * up to ~1,000 XMLs, expanded here). Unlike the Excel path, unresolved
   * provider names are queued in UnmappedProviderVariant rather than
   * auto-created, so bulk XML ingestion can't flood ProviderMaster with
   * unverified names — see ProviderResolverService. */
  async uploadIr21XmlBatch(
    files: { buffer: Buffer; originalname: string }[],
    uploadedBy: string,
  ): Promise<BulkXmlUploadResult> {
    const { xmlFiles, pdfFiles } = this.expandZips(files);
    const services = await this.serviceMap();
    const errors: string[] = [];
    let filesProcessed = 0;
    let filesFailed = 0;
    let mnosUpdated = 0;
    let unmappedVariantsFound = 0;

    for (const file of xmlFiles) {
      let parsed: ParsedIr21Document;
      try {
        parsed = this.xmlParser.parse(file.buffer, file.originalname);
      } catch (e) {
        filesFailed++;
        errors.push(`${file.originalname}: ${e instanceof Error ? e.message : "failed to parse"}`);
        continue;
      }

      try {
        const pdfMatch = this.matchPdfForTadig(parsed.senderTadig, pdfFiles);
        unmappedVariantsFound += await this.applyParsedIr21(parsed, file.originalname, services, pdfMatch);
        filesProcessed++;
        mnosUpdated++;
      } catch (e) {
        filesFailed++;
        errors.push(`${file.originalname}: ${e instanceof Error ? e.message : "failed to apply"}`);
        this.logger.error(`Failed applying ${file.originalname}`, e instanceof Error ? e.stack : undefined);
      }
    }

    const status = this.deriveStatus(filesProcessed, filesFailed);
    const uploadHistory = await this.prisma.uploadHistory.create({
      data: {
        filename: `IR.21 XML batch (${xmlFiles.length} file${xmlFiles.length === 1 ? "" : "s"})`,
        uploadedBy,
        recordsLoaded: filesProcessed,
        status,
        errorLog: errors.length ? errors.join("\n") : null,
      },
    });

    return {
      uploadHistory: this.toHistoryRow(uploadHistory),
      filesProcessed,
      filesFailed,
      mnosUpdated,
      unmappedVariantsFound,
      errors,
    };
  }

  /** Expands any .zip entries into their contained .xml and .pdf files
   * (GSMA IR.21 zips often bundle the official PDF alongside the machine-
   * readable XML for the same operator); bare .xml/.pdf files pass through
   * unchanged. PDFs are paired to an XML by TADIG match, not positionally —
   * see matchPdfForTadig. */
  private expandZips(files: UploadedFile[]): { xmlFiles: UploadedFile[]; pdfFiles: UploadedFile[] } {
    const xmlFiles: UploadedFile[] = [];
    const pdfFiles: UploadedFile[] = [];
    for (const file of files) {
      const lower = file.originalname.toLowerCase();
      if (lower.endsWith(".zip")) {
        const zip = new AdmZip(file.buffer);
        for (const entry of zip.getEntries()) {
          if (entry.isDirectory) continue;
          const entryLower = entry.entryName.toLowerCase();
          if (entryLower.endsWith(".xml")) {
            xmlFiles.push({ buffer: entry.getData(), originalname: entry.entryName });
          } else if (entryLower.endsWith(".pdf")) {
            pdfFiles.push({ buffer: entry.getData(), originalname: entry.entryName });
          }
        }
      } else if (lower.endsWith(".xml")) {
        xmlFiles.push(file);
      } else if (lower.endsWith(".pdf")) {
        pdfFiles.push(file);
      }
    }
    return { xmlFiles, pdfFiles };
  }

  /** Finds the PDF (if any) belonging to a parsed XML's TADIG — matched by
   * the TADIG code appearing anywhere in the PDF's filename (GSMA vendor
   * exports use varied naming, e.g. "IR21_USAFF_FreedomFi_Inc.pdf" or just
   * "USAFF.pdf"), not by position in the archive. */
  private matchPdfForTadig(tadig: string, pdfFiles: UploadedFile[]): UploadedFile | undefined {
    const upperTadig = tadig.toUpperCase();
    return pdfFiles.find((p) => p.originalname.toUpperCase().includes(upperTadig));
  }

  /** Applies one parsed IR.21 XML document: upserts MnoMaster, resolves
   * SCCP/IPX providers and upserts Ir21Connectivity for them (DSX isn't
   * covered by the XML sections this parser extracts), and refreshes the
   * MnoMasterConnectivity wide snapshot. Returns how many providers in this
   * file were unmapped. If a PDF was paired with this TADIG, it's uploaded
   * to Supabase Storage and the pdf* fields are set; if not, those fields
   * are simply omitted from the upsert — leaving any previously-stored PDF
   * for this MNO untouched rather than clearing it on a re-upload that
   * doesn't happen to include a PDF this time. */
  private async applyParsedIr21(
    parsed: ParsedIr21Document,
    filename: string,
    services: Map<ServiceName, number>,
    pdfMatch?: UploadedFile,
  ): Promise<number> {
    let unmapped = 0;
    const [mccStr, mncStr] = (parsed.mccMncPairs[0] ?? "").split("-");
    const country = parsed.countryInitials || "UNKNOWN";

    const mno = await this.prisma.mnoMaster.upsert({
      where: { tadigCode: parsed.senderTadig },
      update: {
        operatorName: parsed.organisationName || undefined,
        country: parsed.countryInitials || undefined,
      },
      create: {
        operatorName: parsed.organisationName || parsed.senderTadig,
        country,
        mcc: mccStr || "000",
        mnc: mncStr || "00",
        countryCode: country.slice(0, 2).toUpperCase(),
        tadigCode: parsed.senderTadig,
      },
    });

    const effectiveDate = parsed.fileCreationTimestamp && !isNaN(Date.parse(parsed.fileCreationTimestamp))
      ? new Date(parsed.fileCreationTimestamp)
      : new Date();

    if (parsed.primarySccpCarrier) {
      const resolved = await this.providerResolver.resolve(parsed.primarySccpCarrier, "SCCP", parsed.senderTadig);
      if (resolved.status === "resolved") {
        await this.prisma.ir21Connectivity.upsert({
          where: { mnoId_serviceId: { mnoId: mno.id, serviceId: services.get("SCCP")! } },
          update: { providerId: resolved.providerId, sourceFile: filename, effectiveDate },
          create: {
            mnoId: mno.id,
            providerId: resolved.providerId,
            serviceId: services.get("SCCP")!,
            sourceFile: filename,
            effectiveDate,
          },
        });
      } else {
        unmapped++;
      }
    }

    const ipxCandidate = parsed.grxIpxProviders[0] ?? parsed.lteIpxProviders[0] ?? null;
    if (ipxCandidate) {
      const resolved = await this.providerResolver.resolve(ipxCandidate, "IPX", parsed.senderTadig);
      if (resolved.status === "resolved") {
        await this.prisma.ir21Connectivity.upsert({
          where: { mnoId_serviceId: { mnoId: mno.id, serviceId: services.get("IPX")! } },
          update: { providerId: resolved.providerId, sourceFile: filename, effectiveDate },
          create: {
            mnoId: mno.id,
            providerId: resolved.providerId,
            serviceId: services.get("IPX")!,
            sourceFile: filename,
            effectiveDate,
          },
        });
      } else {
        unmapped++;
      }
    }

    const snapshotFields = {
      tadigCode: mno.tadigCode,
      operatorName: mno.operatorName,
      country: mno.country,
      networkType: parsed.networkType,
      mccMncList: parsed.mccMncPairs,
      primarySccpCarrier: parsed.primarySccpCarrier,
      backupSccpCarriers: parsed.backupSccpCarriers,
      sccpPointCodes: parsed.sccpPointCodes,
      grxIpxProviders: parsed.grxIpxProviders,
      lteIpxProviders: parsed.lteIpxProviders,
      interPmnIpRanges: parsed.interPmnIpRanges,
      diameterEdgeAgentFqdn: parsed.diameterEdgeAgentFqdn,
      authoritativeDnsIps: parsed.authoritativeDnsIps,
      epcRealms: parsed.epcRealms,
      roamingCoordinatorEmail: parsed.roamingCoordinatorEmail,
      ts24x7Email: parsed.ts24x7Email,
      distributionEmail: parsed.distributionEmail,
      xmlFileVersion: parsed.schemaVersion,
      lastEffectiveDate: effectiveDate,
    };

    let pdfFields = {};
    if (pdfMatch) {
      const storagePath = `${mno.tadigCode}.pdf`;
      try {
        await this.storage.upload(storagePath, pdfMatch.buffer);
        pdfFields = {
          pdfFileName: pdfMatch.originalname,
          pdfStoragePath: storagePath,
          pdfFileSize: pdfMatch.buffer.length,
          hasPdfDocument: true,
        };
      } catch (e) {
        this.logger.error(`Failed storing PDF for ${mno.tadigCode}`, e instanceof Error ? e.stack : undefined);
      }
    }

    await this.prisma.mnoMasterConnectivity.upsert({
      where: { mnoId: mno.id },
      update: { ...snapshotFields, ...pdfFields, lastParsedAt: new Date() },
      create: { mnoId: mno.id, ...snapshotFields, ...pdfFields },
    });

    return unmapped;
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

  /** Resolves a Reach List cell's provider text to a ProviderMaster id.
   * Tries the exact-name cache first (handles the canonical name typed
   * verbatim, or one of the small hardcoded PROVIDER_ALIASES variants),
   * then falls back to the same alias-aware fuzzy matching the IR.21 XML
   * pipeline uses — e.g. "Tata Communications Ltd." resolves to the
   * existing "Tata Comm" row instead of spawning a duplicate ProviderMaster
   * the way a plain exact-match miss used to. Only creates a new provider
   * when neither tier finds anything, and registers that exact variant as
   * an alias so a repeat of the same text resolves directly next time. */
  private async resolveProvider(raw: string, cache: Map<string, number>): Promise<number> {
    const canonical = normalizeProviderName(raw);
    const key = canonical.toLowerCase();
    const cached = cache.get(key);
    if (cached) return cached;

    const normalized = this.providerResolver.normalize(raw);
    const aliasMatch = normalized ? this.providerResolver.matchAlias(normalized) : undefined;
    if (aliasMatch) {
      cache.set(key, aliasMatch);
      return aliasMatch;
    }

    const created = await this.prisma.providerMaster.create({
      data: { providerName: canonical, providerType: "IPX Provider" },
    });
    cache.set(key, created.id);
    if (normalized) {
      await this.providerResolver.addAlias(created.id, normalized);
    }
    return created.id;
  }
}
