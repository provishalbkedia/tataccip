import { Injectable, Logger } from "@nestjs/common";
import { RoutingChangeType, ServiceName, UploadStatus } from "@prisma/client";
import AdmZip from "adm-zip";
import { PrismaService } from "../prisma/prisma.service";
import { readFirstSheetAsRows, col } from "./excel.util";
import { normalizeCountryToIso3 } from "./country-normalize";
import { buildMnoResolver, detectReachlistFormat, matrixProviderColumns } from "./reachlist-matrix.util";
import { normalizeProviderName } from "./provider-alias";
import { isJunkProviderName, splitCompositeProviderNames } from "./provider-normalize";
import { Ir21ChangeHistoryItem, Ir21XmlParserService, ParsedIr21Document } from "./ir21-xml-parser.service";
import { interpretChangeHistoryDescription, classifyNonCarrierChange } from "./ir21-change-history.util";

const NON_CARRIER_CHANGE_TYPES = new Set(["IP_SUBNET_UPDATE", "DIAMETER_REALM_UPDATE", "POINT_CODE_GT_UPDATE", "ADMIN_NAME_UPDATE"]);
import { ProviderResolverService } from "./provider-resolver.service";
import { SupabaseStorageService } from "./supabase-storage.service";
import { ActiveBaselineInfo, BulkXmlUploadResult, DsxBackfillResult, UnresolvedReachRow, UploadResult } from "@ccip/shared-types";

// GSMA TADIG codes are always exactly 5 characters: 3-letter country + 2-char operator.
const TADIG_REGEX = /^[A-Z0-9]{5}$/;

type UploadedFile = { buffer: Buffer; originalname: string };

/** mnoId_serviceId -> the provider that was linked immediately before a
 * "Replace Active Dataset" upload wiped Ir21Connectivity. See
 * uploadIr21XmlBatch's replaceActiveDataset branch and
 * applyServiceConnectivity's oldProviderId resolution for why this exists —
 * without it, every MNO looks like a brand-new addition on every replace
 * upload, even when nothing actually changed. */
type PreWipeConnectivitySnapshot = Map<string, { providerId: number; providerName: string | null }>;

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

  /** Powers the Admin Menu/Dashboard "Active IR.21 Baseline" banner.
   * currentMnoCount is a live count, not the `active` row's stored
   * snapshot — a "Replace Active Dataset" upload split across several
   * requests only flags its first request as isCurrentActive, so that
   * row's own mnoCount can undercount the eventual total. */
  async getActiveBaseline(): Promise<ActiveBaselineInfo> {
    const [active, currentMnoCount] = await Promise.all([
      this.prisma.uploadHistory.findFirst({ where: { isCurrentActive: true }, orderBy: { uploadTime: "desc" } }),
      this.prisma.mnoMasterConnectivity.count(),
    ]);
    return { active: active ? this.toHistoryRow(active) : null, currentMnoCount };
  }

  /** Full, unscoped purge of every Reach List record — unlike the
   * per-file `replace` option on both reachlist upload paths (scoped to
   * `sourceFile`, so re-uploading one file's newer version can't destroy
   * data loaded from any other file), this is a deliberate, explicit
   * admin action with no scoping at all: every ProviderReachlist row,
   * from every source, is gone. IR.21-sourced connectivity (the
   * Comparison Grid's other half) is untouched. Logged as its own
   * UploadHistory row for the same audit trail every other ingestion
   * action gets. */
  async purgeAllReachlistData(purgedBy: string): Promise<{ deletedCount: number }> {
    const { count } = await this.prisma.providerReachlist.deleteMany({});
    await this.prisma.uploadHistory.create({
      data: {
        filename: "Manual Purge — All Reach List Data",
        uploadedBy: purgedBy,
        recordsLoaded: count,
        status: UploadStatus.SUCCESS,
        errorLog: null,
      },
    });
    return { deletedCount: count };
  }

  /** Full platform reset: wipes every MnoMaster row and everything a
   * foreign key requires be gone first (Ir21Connectivity,
   * MnoMasterConnectivity, ProviderReachlist, DataDiscrepancy,
   * MnoProviderOverride, MnoNormalizationAudit, Ir21RoutingChange) — back
   * to a day-zero empty operator universe, ready for a fresh IR.21
   * baseline. ProviderMaster / ProviderAlias / UnmappedProviderVariant are
   * deliberately left alone — they're provider-side data, not "IR.21" or
   * "MNO master" data, so a provider registered today stays registered
   * (just with zero MNOs) after this runs. Wrapped in one transaction so a
   * failure partway through can't leave the platform half-wiped.
   *
   * Ir21RoutingChange must be cleared here too: it has a required (non-
   * cascading) foreign key to MnoMaster, so deleting MnoMaster rows while
   * their routing-change history still references them fails the whole
   * transaction with a foreign key violation. */
  async resetIr21AndMnoDatabase(resetBy: string): Promise<{ mnosDeleted: number }> {
    const mnosDeleted = await this.prisma.mnoMaster.count();
    await this.prisma.$transaction([
      this.prisma.dataDiscrepancy.deleteMany({}),
      this.prisma.providerReachlist.deleteMany({}),
      this.prisma.ir21Connectivity.deleteMany({}),
      this.prisma.mnoMasterConnectivity.deleteMany({}),
      this.prisma.mnoProviderOverride.deleteMany({}),
      this.prisma.mnoNormalizationAudit.deleteMany({}),
      this.prisma.ir21RoutingChange.deleteMany({}),
      this.prisma.mnoMaster.deleteMany({}),
      // The "Active IR.21 Baseline" banner reads whichever UploadHistory
      // row still has this flag set — without clearing it, the banner
      // would keep pointing at a batch whose MnoMaster data no longer
      // exists.
      this.prisma.uploadHistory.updateMany({ where: { isCurrentActive: true }, data: { isCurrentActive: false } }),
      this.prisma.uploadHistory.create({
        data: {
          filename: "FULL PLATFORM RESET — IR.21 & MNO Master Database",
          uploadedBy: resetBy,
          recordsLoaded: 0,
          status: UploadStatus.SUCCESS,
          errorLog: `${mnosDeleted} MNO record(s), and every IR.21/Reach List connectivity row attached to them, permanently deleted.`,
        },
      }),
    ]);
    return { mnosDeleted };
  }

  // uploadReachlist() is otherwise purely additive: it upserts on
  // (mnoId, providerId, serviceId), so a re-uploaded sheet that renamed,
  // dropped, or reassigned an operator's row leaves the old row behind
  // forever, invisible but still feeding the Comparison Grid / Provider
  // Detail footprint. `replace: true` fixes that by deleting every
  // existing ProviderReachlist row attributed to this exact filename
  // before ingesting — scoped to `sourceFile`, not a full-table wipe:
  // this platform routinely has several reach list files in flight from
  // different sources at once (see this session's history — a
  // standard-format file and a wide competitor-matrix file both feeding
  // ProviderReachlist independently), so purging everything on every
  // upload would erase whichever *other* file's data isn't part of the
  // one being re-uploaded right now. Matches the IR.21 batch upload's
  // "Replace Active Dataset" pattern in spirit, but scoped narrower —
  // there, a rebaseline genuinely is meant to be "everything, from this
  // one archive"; a Reach List file is usually one source's subset, not
  // the whole picture.
  async uploadReachlist(buffer: Buffer, filename: string, uploadedBy: string, replace = false): Promise<UploadResult> {
    const rows = await readFirstSheetAsRows(buffer);
    return this.ingestReachlistRows(rows, filename, uploadedBy, replace);
  }

  /** The row-processing core of uploadReachlist(), lifted out unchanged so
   * the ZIP batch pipeline (reachlist-zip-batch.service.ts) can feed it
   * already-parsed rows from an Excel/PDF/.msg file extracted out of an
   * archive, reusing every bit of this logic (dual-format detection,
   * country normalization, secondaryTadigs-aware MNO lookup, provider
   * alias resolution, dedup, replace-scoping) rather than re-implementing
   * any of it. `filename` here is the *inner* file's name (e.g.
   * "BICS SS7.xlsx" from within a .zip), not the archive's — replace and
   * sourceFile stay scoped per inner file, consistent with a direct
   * single-file upload of that same file. */
  async ingestReachlistRows(
    rowsIn: Record<string, string>[],
    filename: string,
    uploadedBy: string,
    replace = false,
  ): Promise<UploadResult> {
    const raw = await this.ingestReachlistRowsRaw(rowsIn, filename, replace);
    const status = this.deriveStatus(raw.recordsLoaded, raw.errors.length);
    const uploadHistory = await this.prisma.uploadHistory.create({
      data: {
        filename,
        uploadedBy,
        recordsLoaded: raw.recordsLoaded,
        status,
        errorLog: raw.errors.length ? raw.errors.join("\n") : null,
      },
    });

    return {
      uploadHistory: this.toHistoryRow(uploadHistory),
      errors: raw.errors,
      formatDetected: raw.formatDetected,
      totalRowsTransposed: raw.totalRowsTransposed,
      unresolvedMnos: raw.unresolvedMnos.length > 0 ? raw.unresolvedMnos : undefined,
      recordsReplaced: raw.recordsReplaced,
      pendingNormalizationCount: raw.pendingNormalizationCount > 0 ? raw.pendingNormalizationCount : undefined,
      rejectedRows: raw.rejectedRows.length > 0 ? raw.rejectedRows : undefined,
    };
  }

  /** The DB-mutation core of ingestReachlistRows(), without creating an
   * UploadHistory row — so reachlist-zip-batch.service.ts can call this
   * once per file extracted from an archive (dozens of times per upload)
   * and create exactly one combined history row for the whole batch,
   * instead of flooding Upload History with one row per inner file. */
  async ingestReachlistRowsRaw(
    rowsIn: Record<string, string>[],
    filename: string,
    replace = false,
  ): Promise<{
    recordsLoaded: number;
    recordsReplaced?: number;
    errors: string[];
    formatDetected: "STANDARD_TRANSPOSED" | "COMPETITOR_MATRIX";
    totalRowsTransposed?: number;
    unresolvedMnos: { mnoName: string; country: string }[];
    pendingNormalizationCount: number;
    rejectedRows: UnresolvedReachRow[];
  }> {
    let rows = rowsIn;
    const services = await this.serviceMap();
    const providerCache = await this.providerCache();
    const errors: string[] = [];
    const seenKeys = new Set<string>();
    const rejectedRows: UnresolvedReachRow[] = [];
    let recordsLoaded = 0;

    let recordsReplaced: number | undefined;
    if (replace) {
      const deleted = await this.prisma.providerReachlist.deleteMany({ where: { sourceFile: filename } });
      recordsReplaced = deleted.count;
    }

    // Two accepted shapes: the standard one-row-per-record file (Provider,
    // Country, MNO, TADIG, Services), or a "wide" Competitor Coverage
    // matrix — one column per wholesale provider, one row per MNO. A
    // matrix row's own TADIG (when the file gives one) is used directly;
    // only a genuinely blank TADIG falls back to resolving from MnoMaster
    // by (Country, MNO) — an MNO that doesn't already exist there has
    // nothing to attach a TADIG to and is reported back as unresolved
    // rather than guessed at.
    const format = detectReachlistFormat(Object.keys(rows[0] ?? {}));
    let totalRowsTransposed: number | undefined;
    const unresolvedMnos: { mnoName: string; country: string }[] = [];
    let pendingNormalizationCount = 0;

    // Shared by the MATRIX pre-pass below (resolving a blank-TADIG row by
    // country+name) and the per-row loop further down (the fallback for a
    // TADIG that doesn't match anything — see the MnoNormalizationAudit
    // comment there for why this exists at all).
    const allMnos = await this.prisma.mnoMaster.findMany({
      select: { id: true, operatorName: true, country: true, tadigCode: true },
    });
    const resolveMno = buildMnoResolver(allMnos);
    // A country-agnostic name-only fallback was tried here and reverted —
    // real brands (Digicel, Lycamobile, Altice, Lebara, NATCOM...) operate
    // as genuinely distinct legal entities with distinct TADIGs per
    // country, so a confident *name* match with no country scoping
    // actively mismatches them (e.g. "Lebara Mobile Limited" (GBR) got
    // silently merged into the unrelated "LEBARA" (NGA) record). Country
    // scoping stays mandatory for any match this platform makes on its
    // own — see buildMnoResolver above.

    if (format === "MATRIX") {
      const resolveColumnProvider = await this.buildMatrixColumnResolver();
      const { columns: providerCols, unrecognized: unrecognizedColumns } = matrixProviderColumns(
        Object.keys(rows[0] ?? {}),
        resolveColumnProvider,
      );
      if (unrecognizedColumns.length > 0) {
        errors.push(
          `${unrecognizedColumns.length} column(s) didn't match a known provider or alias, skipped: ` +
            unrecognizedColumns.map((c) => `"${c}"`).join(", ") +
            ". Add it via Provider Overrides & Normalization, or register an alias, then re-upload.",
        );
      }

      const expandedRows: Record<string, string>[] = [];
      const seenUnresolved = new Set<string>();
      let discontinuedStripped = 0;
      let blankRowsSkipped = 0;

      for (let i = 0; i < rows.length; i++) {
        const rowNum = i + 2;
        const row = rows[i];
        const mnoNameRaw = col(row, "mno", "operator");
        const country = col(row, "country");
        const rawTadigForRow = col(row, "tadig", "tadig code");
        if (!mnoNameRaw || !country) {
          blankRowsSkipped++;
          rejectedRows.push({
            rowNumber: rowNum,
            rawOperatorName: mnoNameRaw,
            rawTadig: rawTadigForRow,
            country,
            rejectionReason: "Missing operator name or country.",
          });
          continue;
        }

        // A "[discontinued]" prefix is the source tool's own status label,
        // not evidence the row's declared services are stale — the cell
        // still lists real, currently-declared services, so the prefix is
        // stripped and the row ingests like any other rather than being
        // dropped outright.
        let mnoName = mnoNameRaw;
        if (/\[discontinued\]/i.test(mnoNameRaw)) {
          discontinuedStripped++;
          mnoName = mnoNameRaw.replace(/\[discontinued\]/i, "").trim();
        }

        // Prefer the row's own TADIG when it's already valid — it's often
        // itself resolved from IR.21 by the source spreadsheet's own
        // lookup formula, so a fuzzy country+name match shouldn't
        // second-guess it and risk a false "ambiguous"/"not-found" on an
        // operator whose matrix-file name doesn't closely match
        // MnoMaster's IR.21-derived name.
        const rawTadig = rawTadigForRow.trim().toUpperCase();
        let tadig: string | null = null;
        let resolutionStatus: "resolved" | "not-found" | "ambiguous" = "resolved";
        if (TADIG_REGEX.test(rawTadig)) {
          tadig = rawTadig;
        } else {
          const resolution = resolveMno(country, mnoName);
          if (resolution.status === "resolved") {
            tadig = resolution.tadigCode;
          } else {
            resolutionStatus = resolution.status;
          }
        }

        if (tadig === null) {
          const pairKey = `${country}|${mnoName}`;
          if (!seenUnresolved.has(pairKey)) {
            seenUnresolved.add(pairKey);
            unresolvedMnos.push({ mnoName, country });
          }

          // No TADIG to key a ProviderReachlist row on — but every provider
          // column with actual declared service data is still queued into
          // MnoNormalizationAudit (the same fallback the STANDARD-format
          // loop below uses), so the row is preserved for admin review
          // instead of vanishing once this response is read.
          let anyProviderData = false;
          for (const { key, providerId } of providerCols) {
            const cellServices = row[key]?.trim();
            if (!cellServices) continue;
            const serviceTokens = cellServices
              .split(/[,;/]/)
              .map((s) => s.trim().toUpperCase())
              .filter((t): t is ServiceName => services.has(t as ServiceName));
            if (serviceTokens.length === 0) continue;
            anyProviderData = true;
            await this.recordNormalizationAudit({
              rawOperatorName: mnoName,
              rawTadigCode: rawTadig,
              country,
              providerId,
              services: serviceTokens,
              sourceFile: filename,
              matchStatus: "PENDING_REVIEW",
            });
          }
          if (anyProviderData) pendingNormalizationCount++;

          rejectedRows.push({
            rowNumber: rowNum,
            rawOperatorName: mnoName,
            rawTadig: rawTadig || "(blank)",
            country,
            rejectionReason:
              resolutionStatus === "ambiguous"
                ? "Operator name matched more than one existing MNO — queued for admin review under Unresolved Reach List Aliases."
                : "No TADIG given and no confident match found in MnoMaster — queued for admin review under Unresolved Reach List Aliases.",
          });
          continue;
        }

        for (const { display, key } of providerCols) {
          const cellServices = row[key]?.trim();
          if (!cellServices) continue;
          expandedRows.push({ provider: display, country, mno: mnoName, tadig, services: cellServices });
        }
      }

      if (discontinuedStripped > 0) {
        errors.push(`${discontinuedStripped} row(s) had a "[discontinued]" prefix — stripped from the name and ingested normally.`);
      }
      if (blankRowsSkipped > 0) {
        errors.push(`${blankRowsSkipped} row(s) skipped: missing operator name or country.`);
      }
      if (unresolvedMnos.length > 0) {
        errors.push(
          `${unresolvedMnos.length} MNO(s) not found in MnoMaster (no TADIG to attach to), queued for admin review under Unresolved Reach List Aliases: ` +
            unresolvedMnos.slice(0, 10).map((u) => `"${u.mnoName}" (${u.country})`).join(", ") +
            (unresolvedMnos.length > 10 ? `, and ${unresolvedMnos.length - 10} more` : ""),
        );
      }

      totalRowsTransposed = expandedRows.length;
      rows = expandedRows;
    }

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
        rejectedRows.push({ rowNumber: rowNum, rawOperatorName: mnoName, rawTadig: tadigRaw, country, rejectionReason: "Missing Provider or TADIG." });
        continue;
      }
      if (!TADIG_REGEX.test(tadig)) {
        errors.push(`Row ${rowNum}: invalid TADIG "${tadig}", skipped.`);
        rejectedRows.push({ rowNumber: rowNum, rawOperatorName: mnoName, rawTadig: tadigRaw, country, rejectionReason: `Invalid TADIG "${tadig}" (must be 5 alphanumeric characters).` });
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
        rejectedRows.push({ rowNumber: rowNum, rawOperatorName: mnoName, rawTadig: tadigRaw, country, rejectionReason: `No valid Services listed ("${servicesRaw}").` });
        continue;
      }

      // A single "Provider" cell can list more than one carrier (e.g.
      // "Arelion, CMI, BBIS") — split before resolving so each becomes its
      // own ProviderReachlist row against its own canonical provider,
      // rather than one row against a bogus composite ProviderMaster.
      // Placeholder tokens ("None", "N/A") are dropped here rather than
      // resolved — otherwise they'd auto-create their own junk provider.
      // Parsed before MNO resolution below because an unresolved MNO still
      // needs a providerId to file its MnoNormalizationAudit entry under.
      const providerTokens = splitCompositeProviderNames(providerRaw).filter((token) => {
        if (isJunkProviderName(this.providerResolver.normalize(token))) {
          errors.push(`Row ${rowNum}: Provider token "${token}" is a placeholder, not a real provider, skipped.`);
          return false;
        }
        return true;
      });
      if (providerTokens.length === 0) {
        errors.push(`Row ${rowNum}: Provider "${providerRaw}" had no resolvable name after cleanup, skipped.`);
        rejectedRows.push({ rowNumber: rowNum, rawOperatorName: mnoName, rawTadig: tadigRaw, country, rejectionReason: `Provider "${providerRaw}" had no resolvable name after cleanup.` });
        continue;
      }

      // GSMA IR.21 is the platform's sole authoritative source for new MNO
      // records — a reach-list TADIG that doesn't match an existing
      // MnoMaster no longer spawns a bare placeholder row. A reach list may
      // quote a legacy/secondary TADIG for an operator already tracked
      // under a different primary TADIG (see MnoMaster.secondaryTadigs),
      // so that's checked first; if that misses too, a confident
      // country+name match against an existing operator is tried next (the
      // row's own TADIG might just be a typo or an unregistered legacy
      // code — same resolver the wide-matrix format already uses). Only
      // when neither finds anything is the row queued in
      // MnoNormalizationAudit for an admin to map manually, rather than
      // guessed at or silently dropped.
      let mno = await this.prisma.mnoMaster.findFirst({
        where: { OR: [{ tadigCode: tadig }, { secondaryTadigs: { has: tadig } }] },
      });
      let matchStatus: "EXACT_TADIG" | "ALIAS_MATCHED" = "EXACT_TADIG";

      if (mno) {
        const existingIso3 = normalizeCountryToIso3(mno.country);
        const uploadIso3 = normalizeCountryToIso3(country);
        if (uploadIso3 && existingIso3 && existingIso3 !== uploadIso3) {
          errors.push(
            `Row ${rowNum}: country mismatch for TADIG "${tadig}" (existing="${mno.country}", upload="${country}").`,
          );
        }
      } else if (country && mnoName) {
        const nameResolution = resolveMno(country, mnoName);
        if (nameResolution.status === "resolved") {
          mno = await this.prisma.mnoMaster.findUnique({ where: { id: nameResolution.mnoId } });
          matchStatus = "ALIAS_MATCHED";
        }
      }

      if (!mno) {
        for (const providerToken of providerTokens) {
          const providerId = await this.resolveProvider(providerToken, providerCache);
          await this.recordNormalizationAudit({
            rawOperatorName: mnoName,
            rawTadigCode: tadig,
            country,
            providerId,
            services: validServiceTokens,
            sourceFile: filename,
            matchStatus: "PENDING_REVIEW",
          });
        }
        pendingNormalizationCount++;
        errors.push(
          `Row ${rowNum}: TADIG "${tadig}" (operator "${mnoName || tadig}") not found in MnoMaster and no ` +
            `confident name match — queued for admin review under Unresolved Reach List Aliases, skipped.`,
        );
        rejectedRows.push({
          rowNumber: rowNum,
          rawOperatorName: mnoName,
          rawTadig: tadigRaw,
          country,
          rejectionReason: `TADIG "${tadig}" not found in MnoMaster and no confident name match — queued for admin review under Unresolved Reach List Aliases.`,
        });
        continue;
      }

      for (const providerToken of providerTokens) {
        const providerId = await this.resolveProvider(providerToken, providerCache);
        if (matchStatus === "ALIAS_MATCHED") {
          // Not a hard failure — the row still ingests below — but a fuzzy
          // match is a judgment call worth a paper trail, unlike an exact
          // TADIG hit which needs none.
          await this.recordNormalizationAudit({
            rawOperatorName: mnoName,
            rawTadigCode: tadig,
            country,
            providerId,
            services: validServiceTokens,
            sourceFile: filename,
            matchStatus: "ALIAS_MATCHED",
            canonicalMnoId: mno.id,
          });
        }

        for (const serviceName of validServiceTokens) {
          // Keyed on the resolved mno.id, not the raw uploaded tadig string
          // — otherwise the same operator's primary and secondary TADIG
          // both appearing in one file would look like two distinct keys
          // instead of a real duplicate.
          const dedupeKey = `${mno.id}|${providerId}|${serviceName}`;
          if (seenKeys.has(dedupeKey)) {
            errors.push(`Row ${rowNum}: duplicate (TADIG, Provider, Service) "${tadig}|${providerId}|${serviceName}" in file, skipped.`);
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

    return {
      recordsLoaded,
      recordsReplaced,
      errors,
      formatDetected: format === "MATRIX" ? "COMPETITOR_MATRIX" : "STANDARD_TRANSPOSED",
      totalRowsTransposed,
      unresolvedMnos,
      pendingNormalizationCount,
      rejectedRows,
    };
  }

  /** Upserts a MnoNormalizationAudit row for one unresolved or fuzzy-matched
   * Reach List (operator, TADIG, provider) combination, keyed on
   * (providerId, rawTadigCode, rawOperatorName) so a repeat upload of the
   * same unresolved data accumulates onto one row (occurrenceCount,
   * affectedServices, affectedFiles) instead of growing a duplicate every
   * time. Never overwrites a row an admin has already resolved
   * (MANUALLY_OVERRIDDEN) — a stale re-upload shouldn't undo that. */
  private async recordNormalizationAudit(params: {
    rawOperatorName: string;
    rawTadigCode: string;
    country: string;
    providerId: number;
    services: string[];
    sourceFile: string;
    matchStatus: "PENDING_REVIEW" | "ALIAS_MATCHED";
    canonicalMnoId?: number;
  }): Promise<void> {
    const { rawOperatorName, rawTadigCode, country, providerId, services, sourceFile, matchStatus, canonicalMnoId } = params;
    const existing = await this.prisma.mnoNormalizationAudit.findUnique({
      where: { providerId_rawTadigCode_rawOperatorName: { providerId, rawTadigCode, rawOperatorName } },
    });
    if (existing) {
      if (existing.matchStatus === "MANUALLY_OVERRIDDEN") return;
      await this.prisma.mnoNormalizationAudit.update({
        where: { id: existing.id },
        data: {
          occurrenceCount: { increment: 1 },
          affectedServices: { set: Array.from(new Set([...existing.affectedServices, ...services])) },
          affectedFiles: { set: Array.from(new Set([...existing.affectedFiles, sourceFile])) },
          matchStatus,
          country: country || existing.country,
          canonicalMnoId: canonicalMnoId ?? existing.canonicalMnoId,
        },
      });
      return;
    }
    await this.prisma.mnoNormalizationAudit.create({
      data: {
        rawOperatorName,
        rawTadigCode,
        country,
        providerId,
        affectedServices: services,
        affectedFiles: [sourceFile],
        matchStatus,
        canonicalMnoId,
      },
    });
  }

  /** Ingests a batch of GSMA IR.21 XML files (each may itself be a .zip of
   * up to ~1,000 XMLs, expanded here). Unlike the Excel path, unresolved
   * provider names are queued in UnmappedProviderVariant rather than
   * auto-created, so bulk XML ingestion can't flood ProviderMaster with
   * unverified names — see ProviderResolverService.
   *
   * `replaceActiveDataset` is an explicit opt-in, off by default: normal
   * uploads only touch the MNOs actually present in the batch (today's
   * behavior). When true, every existing Ir21Connectivity and
   * MnoMasterConnectivity row is purged *before* this batch is ingested, so
   * the new ZIP becomes the sole active baseline — any MNO not present in
   * it loses its XML-sourced connectivity entirely. A client uploading a
   * large archive across several split requests (see splitZipForUpload on
   * the frontend) must only pass true on the first request; the purge runs
   * unconditionally whenever this flag is true, so passing it on every
   * sub-batch would wipe out the batches ingested just before it. */
  async uploadIr21XmlBatch(
    files: { buffer: Buffer; originalname: string }[],
    uploadedBy: string,
    replaceActiveDataset = false,
  ): Promise<BulkXmlUploadResult> {
    // Snapshot the connectivity state that's about to be wiped -- without
    // this, applyServiceConnectivity's "what was this MNO+service pointing
    // at before?" lookup always comes back empty right after the delete, so
    // every MNO in the new batch looks like a brand-new addition even when
    // its provider hasn't actually changed. Re-uploading the same (or a
    // mostly-unchanged) zip via Replace Active Dataset would otherwise
    // regenerate a full new batch of duplicate "ADDED" audit rows every
    // single time -- verified against production: TURTS (Vodafone Turkey)
    // had 3 byte-identical ADDED rows per service, same effectiveDate,
    // three different ingestedAt timestamps, one per replace upload.
    const preWipeSnapshot: PreWipeConnectivitySnapshot = new Map();
    if (replaceActiveDataset) {
      const priorRows = await this.prisma.ir21Connectivity.findMany({
        select: { mnoId: true, serviceId: true, providerId: true, provider: { select: { providerName: true } } },
      });
      for (const row of priorRows) {
        preWipeSnapshot.set(`${row.mnoId}_${row.serviceId}`, { providerId: row.providerId, providerName: row.provider.providerName });
      }

      await this.prisma.$transaction([
        this.prisma.ir21Connectivity.deleteMany({}),
        this.prisma.mnoMasterConnectivity.deleteMany({}),
        this.prisma.uploadHistory.updateMany({ where: { isCurrentActive: true }, data: { isCurrentActive: false } }),
      ]);
    }

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
        unmappedVariantsFound += await this.applyParsedIr21(parsed, file.originalname, services, pdfMatch, preWipeSnapshot);
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
        isCurrentActive: replaceActiveDataset,
        // Snapshots this request's own MNO count for the audit trail — a
        // multi-batch replace upload only sets this flag on its first
        // request, so this can undercount the eventual grand total; the
        // admin banner reads a live MnoMasterConnectivity.count() instead
        // of trusting this field for that reason.
        mnoCount: replaceActiveDataset ? mnosUpdated : null,
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
    preWipeSnapshot?: PreWipeConnectivitySnapshot,
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

    // Admin-pinned per-(MNO, service) overrides take priority over whatever
    // this file's own declared text would resolve to — e.g. every MNO
    // declaring the generic "SCCP Carrier" resolves the same way by
    // default, but a specific MNO's override says otherwise. Loaded once
    // per file rather than per-service query.
    const activeOverrides = await this.prisma.mnoProviderOverride.findMany({
      where: { tadigCode: parsed.senderTadig, isActive: true },
    });
    const overrideByService = new Map(activeOverrides.map((o) => [o.serviceName, o]));

    // Read before this upload's own MnoMasterConnectivity upsert below can
    // create it -- true only when this is this MNO's very first-ever parsed
    // IR.21 XML. Every service such an MNO declares looks, to live-diff
    // below, identical in shape to a genuine new carrier win (oldProviderId
    // null -> ADDED), but a bulk baseline load of N brand-new MNOs isn't N
    // MNOs' worth of real market churn -- it's onboarding. See
    // applyServiceConnectivity's isInitialOnboarding handling.
    const isFirstIr21Upload =
      (await this.prisma.mnoMasterConnectivity.findUnique({ where: { mnoId: mno.id }, select: { mnoId: true } })) === null;

    unmapped += await this.applyServiceConnectivity(
      mno.id,
      parsed.senderTadig,
      "SCCP",
      parsed.primarySccpCarrier,
      overrideByService.get("SCCP"),
      services,
      filename,
      effectiveDate,
      mno.operatorName,
      mno.country,
      preWipeSnapshot,
      isFirstIr21Upload,
    );
    unmapped += await this.applyServiceConnectivity(
      mno.id,
      parsed.senderTadig,
      "IPX",
      parsed.grxIpxProviders[0] ?? null,
      overrideByService.get("IPX"),
      services,
      filename,
      effectiveDate,
      mno.operatorName,
      mno.country,
      preWipeSnapshot,
      isFirstIr21Upload,
    );
    // LTE/Diameter (DSX) is a distinct declared carrier from the GRX/IPX
    // data-roaming provider above — see Ir21XmlParserService.
    // extractDsxDiameterProviders — so it gets its own resolution + service
    // row rather than only being an IPX fallback.
    unmapped += await this.applyServiceConnectivity(
      mno.id,
      parsed.senderTadig,
      "DSX",
      parsed.lteIpxProviders[0] ?? null,
      overrideByService.get("DSX"),
      services,
      filename,
      effectiveDate,
      mno.operatorName,
      mno.country,
      preWipeSnapshot,
      isFirstIr21Upload,
    );

    // Backfills any provider switch this file's own <ChangeHistory> log
    // documents as having already happened -- e.g. a carrier switch made
    // years before this platform's own live-diff tracking (above) started
    // recording anything. Live-diff can only ever detect a transition
    // between two uploads; it has no way to see one that happened entirely
    // before the very first upload of this MNO. See applyServiceConnectivity's
    // own doc comment and Ir21XmlParserService.changeHistory.
    await this.backfillChangeHistory(mno.id, parsed.senderTadig, parsed.changeHistory, filename, mno.operatorName, mno.country);

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
      mnoAsNumbers: parsed.mnoAsNumbers,
      providerAsNumbers: parsed.providerAsNumbers,
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

  /** Resolves and upserts one (MNO, service) Ir21Connectivity row — through
   * an active MnoProviderOverride when one is pinned for this MNO+service
   * (skipping normal alias resolution entirely, so a generic declared
   * string like "SCCP Carrier" doesn't clobber a deliberately-overridden
   * MNO on every re-upload), otherwise through the normal resolver.
   * Returns 1 if the raw string went unmapped (queued for admin triage), 0
   * otherwise — folded into applyParsedIr21's running `unmapped` count.
   *
   * Also records an Ir21RoutingChange whenever this upload's resolved
   * provider for this (MNO, service) differs from whatever
   * Ir21Connectivity already held immediately beforehand — read once up
   * front, before any upsert below can overwrite it. Deliberately skipped
   * when the raw declared string is present but doesn't resolve to a known
   * provider (ambiguous — not a confirmed removal, just a resolution gap
   * already queued for admin triage via the `unmapped` return above).
   *
   * `preWipeSnapshot` covers a "Replace Active Dataset" upload: its caller
   * wipes Ir21Connectivity before reprocessing, so the live lookup below
   * always comes back empty and would otherwise make every MNO look like a
   * fresh addition on every replace upload -- even one that changed
   * nothing. When the live row is missing and a snapshot was captured
   * before that wipe, the snapshot's value is used as the true "before"
   * state instead. */
  private async applyServiceConnectivity(
    mnoId: number,
    senderTadig: string,
    serviceName: ServiceName,
    rawCandidate: string | null,
    override: { overrideProviderId: number; originalRawString: string } | undefined,
    services: Map<ServiceName, number>,
    filename: string,
    effectiveDate: Date,
    mnoName: string,
    country: string,
    preWipeSnapshot?: PreWipeConnectivitySnapshot,
    isFirstIr21Upload = false,
  ): Promise<number> {
    const serviceId = services.get(serviceName)!;
    const existing = await this.prisma.ir21Connectivity.findUnique({
      where: { mnoId_serviceId: { mnoId, serviceId } },
      select: { providerId: true, provider: { select: { providerName: true } } },
    });
    const snapshotEntry = existing ? undefined : preWipeSnapshot?.get(`${mnoId}_${serviceId}`);
    const oldProviderId = existing?.providerId ?? snapshotEntry?.providerId ?? null;
    const oldProviderName = existing?.provider.providerName ?? snapshotEntry?.providerName ?? null;

    const recordChange = async (newProviderId: number | null, newProviderName: string | null) => {
      if (oldProviderId === newProviderId) return;
      const changeType: RoutingChangeType = oldProviderId === null ? "ADDED" : newProviderId === null ? "REMOVED" : "REPLACED";
      await this.prisma.ir21RoutingChange.create({
        data: {
          mnoId,
          tadigCode: senderTadig,
          mnoName,
          country,
          serviceName,
          changeType,
          oldProviderId,
          oldProviderName,
          newProviderId,
          newProviderName,
          changeSource: "LIVE_DIFF",
          isInitialOnboarding: changeType === "ADDED" && isFirstIr21Upload,
          sourceFile: filename,
          effectiveDate,
        },
      });
    };

    if (override) {
      await this.prisma.ir21Connectivity.upsert({
        where: { mnoId_serviceId: { mnoId, serviceId } },
        update: { providerId: override.overrideProviderId, sourceFile: filename, effectiveDate, isManualOverride: true },
        create: {
          mnoId,
          providerId: override.overrideProviderId,
          serviceId,
          sourceFile: filename,
          effectiveDate,
          isManualOverride: true,
        },
      });
      const overrideProvider = await this.prisma.providerMaster.findUnique({
        where: { id: override.overrideProviderId },
        select: { providerName: true },
      });
      await recordChange(override.overrideProviderId, overrideProvider?.providerName ?? null);
      return 0;
    }

    if (!rawCandidate) {
      // This upload's file doesn't declare this service at all -- a
      // genuine drop when one was previously on file. The existing
      // Ir21Connectivity row is deliberately left in place (a pre-existing
      // behavior, not something this change touches); only the audit
      // trail reflects the drop.
      await recordChange(null, null);
      return 0;
    }

    const resolved = await this.providerResolver.resolve(rawCandidate, serviceName, senderTadig);
    if (resolved.status !== "resolved") return 1;

    await this.prisma.ir21Connectivity.upsert({
      where: { mnoId_serviceId: { mnoId, serviceId } },
      update: { providerId: resolved.providerId, sourceFile: filename, effectiveDate, isManualOverride: false },
      create: { mnoId, providerId: resolved.providerId, serviceId, sourceFile: filename, effectiveDate },
    });
    const newProvider = await this.prisma.providerMaster.findUnique({
      where: { id: resolved.providerId },
      select: { providerName: true },
    });
    await recordChange(resolved.providerId, newProvider?.providerName ?? null);
    return 0;
  }

  /** Recovers provider switches an IR.21 file's own <ChangeHistory> log
   * documents but this platform's live-diff (applyServiceConnectivity's
   * recordChange, above) could never have seen -- verified against a real
   * Dialog Axiata (LKADG) file whose DSX ChangeHistory records "2026-06-18
   * LTE Roaming - Remove IPX Provider - TATA" / "... Add new IPX
   * Interconnection - BICS", an event live-diff missed entirely because the
   * very first upload of this MNO started from an empty Ir21Connectivity
   * baseline (nothing to diff TATA's presence against).
   *
   * Read-only provider resolution only (matchAlias, no auto-create/no
   * unmapped-queueing) -- these are supplementary historical facts, not a
   * primary declaration, so an unresolvable candidate is silently dropped
   * rather than queued for admin triage. Two safeguards keep this from
   * corrupting the gross gain/loss counts the Market Intelligence page
   * ranks providers by:
   *   1. Exact-dedup on (service, changeType, oldProviderId, newProviderId,
   *      day) so re-uploading the same file's unchanged history never
   *      re-inserts the same event twice.
   *   2. If history's "new" side is a provider this MNO+service already has
   *      an ADDED/REPLACED row for (most commonly: live-diff's own row from
   *      *this* upload, since the file's most recent history entry and the
   *      live-diff transition are usually the same real-world event seen
   *      twice), that half is dropped so the addition is never counted
   *      twice -- a REPLACED entry degrades to a REMOVED-only row in that
   *      case, which is exactly the missing half (Tata's removal) that
   *      live-diff had no way to record on a fresh baseline. */
  private async backfillChangeHistory(
    mnoId: number,
    senderTadig: string,
    items: Ir21ChangeHistoryItem[],
    filename: string,
    mnoName: string,
    country: string,
  ): Promise<void> {
    if (items.length === 0) return;

    const existingRows = await this.prisma.ir21RoutingChange.findMany({
      where: { mnoId },
      select: { serviceName: true, changeType: true, oldProviderId: true, newProviderId: true, description: true, effectiveDate: true },
    });

    // Non-carrier rows (the 3 technical types plus ADMIN_NAME_UPDATE) have
    // no provider ids to disambiguate with (both always null), so their
    // dedup key includes the raw description text instead -- carrier-swap
    // rows (ADDED/REMOVED/REPLACED) keep the exact original key shape,
    // unchanged, so re-uploading a file ingested before this feature
    // shipped still dedupes against those rows correctly.
    const seenKeyFor = (r: {
      serviceName: string;
      changeType: string;
      oldProviderId: number | null;
      newProviderId: number | null;
      description?: string | null;
      dateStr: string;
    }) =>
      NON_CARRIER_CHANGE_TYPES.has(r.changeType)
        ? `${r.serviceName}|${r.changeType}|${r.description ?? ""}|${r.dateStr}`
        : `${r.serviceName}|${r.changeType}|${r.oldProviderId ?? ""}|${r.newProviderId ?? ""}|${r.dateStr}`;

    const seen = new Set(
      existingRows.map((r) => seenKeyFor({ ...r, dateStr: r.effectiveDate.toISOString().slice(0, 10) })),
    );
    const hasAdditionRecorded = new Set(
      existingRows
        .filter((r) => r.newProviderId !== null && (r.changeType === "ADDED" || r.changeType === "REPLACED"))
        .map((r) => `${r.serviceName}|${r.newProviderId}`),
    );

    for (const item of items) {
      const effectiveDate = new Date(item.date);
      if (isNaN(effectiveDate.getTime())) continue;

      const interpreted = interpretChangeHistoryDescription(item.description);
      if (!interpreted) {
        // Not a carrier addition/removal/replacement -- classify as a
        // technical or administrative update instead of silently dropping
        // it, so real (if non-commercial) history entries stay visible for
        // audit review. Still fully discarded when neither classification
        // applies (e.g. "No Change" boilerplate, or free text this keyword
        // set doesn't recognize) -- same conservative failure direction as
        // an unrecognized carrier-swap description above.
        const nonCarrier = classifyNonCarrierChange(item.description);
        if (!nonCarrier) continue;

        const dedupKey = seenKeyFor({
          serviceName: item.serviceName,
          changeType: nonCarrier.type,
          oldProviderId: null,
          newProviderId: null,
          description: item.description,
          dateStr: item.date,
        });
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        await this.prisma.ir21RoutingChange.create({
          data: {
            mnoId,
            tadigCode: senderTadig,
            mnoName,
            country,
            serviceName: item.serviceName,
            changeType: nonCarrier.type,
            oldProviderId: null,
            oldProviderName: null,
            newProviderId: null,
            newProviderName: null,
            description: item.description,
            matchedRule: nonCarrier.matchedRule,
            changeSource: "CHANGE_HISTORY",
            sourceFile: filename,
            effectiveDate,
          },
        });
        continue;
      }

      let oldProviderId = interpreted.oldName ? (this.providerResolver.matchAlias(this.providerResolver.normalize(interpreted.oldName)) ?? null) : null;
      let newProviderId = interpreted.newName ? (this.providerResolver.matchAlias(this.providerResolver.normalize(interpreted.newName)) ?? null) : null;
      if (oldProviderId === null && newProviderId === null) continue;

      if (newProviderId !== null && hasAdditionRecorded.has(`${item.serviceName}|${newProviderId}`)) {
        newProviderId = null;
      }
      if (oldProviderId === null && newProviderId === null) continue;

      const changeType: RoutingChangeType = oldProviderId === null ? "ADDED" : newProviderId === null ? "REMOVED" : "REPLACED";
      const dedupKey = seenKeyFor({ serviceName: item.serviceName, changeType, oldProviderId, newProviderId, dateStr: item.date });
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      if (newProviderId !== null && changeType !== "REMOVED") {
        hasAdditionRecorded.add(`${item.serviceName}|${newProviderId}`);
      }

      const [oldProvider, newProvider] = await Promise.all([
        oldProviderId ? this.prisma.providerMaster.findUnique({ where: { id: oldProviderId }, select: { providerName: true } }) : null,
        newProviderId ? this.prisma.providerMaster.findUnique({ where: { id: newProviderId }, select: { providerName: true } }) : null,
      ]);

      await this.prisma.ir21RoutingChange.create({
        data: {
          mnoId,
          tadigCode: senderTadig,
          mnoName,
          country,
          serviceName: item.serviceName,
          changeType,
          oldProviderId,
          oldProviderName: oldProvider?.providerName ?? null,
          newProviderId,
          newProviderName: newProvider?.providerName ?? null,
          description: item.description,
          changeSource: "CHANGE_HISTORY",
          sourceFile: filename,
          effectiveDate,
        },
      });
    }
  }

  /** Best-effort DSX backfill for MNOs ingested before the widened LTE/
   * Diameter extraction existed — see DsxBackfillResult's doc comment for
   * why this reads from the already-stored MnoMasterConnectivity snapshot
   * rather than re-parsing XML (never retained after ingestion). Only fills
   * gaps: an MNO that already has a DSX Ir21Connectivity row is left alone. */
  async backfillDsxFromSnapshot(): Promise<DsxBackfillResult> {
    const services = await this.serviceMap();
    const dsxServiceId = services.get("DSX");
    if (!dsxServiceId) return { scanned: 0, created: 0, alreadyLinked: 0, unmapped: 0 };

    const snapshots = await this.prisma.mnoMasterConnectivity.findMany({
      where: { lteIpxProviders: { isEmpty: false } },
      select: { mnoId: true, tadigCode: true, lteIpxProviders: true },
    });

    let created = 0;
    let alreadyLinked = 0;
    let unmapped = 0;

    for (const snap of snapshots) {
      const existing = await this.prisma.ir21Connectivity.findUnique({
        where: { mnoId_serviceId: { mnoId: snap.mnoId, serviceId: dsxServiceId } },
      });
      if (existing) {
        alreadyLinked++;
        continue;
      }
      const candidate = snap.lteIpxProviders[0];
      const resolved = await this.providerResolver.resolve(candidate, "DSX", snap.tadigCode);
      if (resolved.status === "resolved") {
        await this.prisma.ir21Connectivity.create({
          data: {
            mnoId: snap.mnoId,
            providerId: resolved.providerId,
            serviceId: dsxServiceId,
            sourceFile: "dsx-backfill",
            effectiveDate: new Date(),
          },
        });
        created++;
      } else {
        unmapped++;
      }
    }

    return { scanned: snapshots.length, created, alreadyLinked, unmapped };
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
    isCurrentActive: boolean;
    mnoCount: number | null;
  }) {
    return {
      id: h.id,
      filename: h.filename,
      uploadTime: h.uploadTime.toISOString(),
      uploadedBy: h.uploadedBy,
      recordsLoaded: h.recordsLoaded,
      status: h.status,
      errorLog: h.errorLog,
      isCurrentActive: h.isCurrentActive,
      mnoCount: h.mnoCount,
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

  /** Resolves a wide-matrix column header (e.g. "PCCW", "TATAComms") to an
   * existing ProviderMaster row, dynamically — an exact case-insensitive
   * name match first, then the same DB-backed alias directory every other
   * ingestion path uses (ProviderResolverService.matchAlias). A brand-new
   * wholesale-provider column needs no code change: register it (or an
   * alias for it) once via Provider Overrides & Normalization, and it
   * resolves here on the next upload. Deliberately read-only — an
   * unrecognized column is reported back (matrixProviderColumns'
   * `unrecognized`), never auto-created, since a stray non-provider
   * column (e.g. "Notes") would otherwise spawn a junk ProviderMaster row. */
  private async buildMatrixColumnResolver(): Promise<(headerKey: string) => { providerId: number; display: string } | null> {
    const providers = await this.prisma.providerMaster.findMany({ select: { id: true, providerName: true } });
    const byExactLower = new Map(providers.map((p) => [p.providerName.toLowerCase(), p]));
    const byId = new Map(providers.map((p) => [p.id, p]));

    return (headerKey: string) => {
      const direct = byExactLower.get(headerKey);
      if (direct) return { providerId: direct.id, display: direct.providerName };

      const normalized = this.providerResolver.normalize(headerKey);
      const providerId = normalized ? this.providerResolver.matchAlias(normalized) : undefined;
      if (providerId) {
        const p = byId.get(providerId);
        if (p) return { providerId: p.id, display: p.providerName };
      }
      return null;
    };
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
