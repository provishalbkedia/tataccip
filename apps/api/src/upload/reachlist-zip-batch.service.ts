import { Injectable, Logger } from "@nestjs/common";
import { UploadStatus } from "@prisma/client";
import AdmZip from "adm-zip";
import { ReachlistZipBatchResult, ReachlistZipFileResult } from "@ccip/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { UploadService } from "./upload.service";
import { ProviderResolverService } from "./provider-resolver.service";
import { buildGlobalNameResolver, buildMnoResolver, inferProviderNameCandidatesFromFilename } from "./reachlist-matrix.util";
import { parseFlexibleExcel, type FlexibleExcelRow, type ServiceFamily } from "./reachlist-excel-flexible.util";
import { parseComfonePdf } from "./reachlist-pdf.util";
import { parseReachlistMsg } from "./reachlist-msg.util";

interface RowSource {
  country: string;
  operator: string;
  tadigs: string[];
  services: ServiceFamily[];
  // Raw "Connection Type" / "Route Type" text, when the source carried
  // one — undefined for PDF/.msg-derived rows, which have no such
  // concept. Carried through so carrier-specific filtering (see
  // applyCarrierRowFilter) runs identically regardless of which parser
  // produced the row, not just for Excel.
  connectionType?: string;
}

/** Multi-Carrier Reach List ZIP Batch Ingestion — a separate path from the
 * single-file Reach List Upload (upload.service.ts's uploadReachlist),
 * built for the real shape carriers actually send: one archive containing
 * many *single-provider* files, each identified by its own filename
 * rather than a "Provider" column, in whichever of three formats that
 * carrier happens to export (Excel/xls, a Comfone-style PDF customer
 * list, or an Outlook .msg with a pasted partner table or list).
 *
 * Every extracted file is ultimately converted to the same
 * {provider, country, mno, tadig, services} row shape the single-file
 * path already understands and handed to
 * UploadService.ingestReachlistRowsRaw() — so provider-alias resolution,
 * country normalization, secondaryTadigs-aware MNO lookup, and dedup are
 * all the exact same tested logic, not reimplemented here. This service
 * owns only: archive extraction, per-format row extraction, and
 * per-file provider/service inference (since these single-provider files
 * carry that information in their filename or body, not in a column). */
@Injectable()
export class ReachlistZipBatchService {
  private readonly logger = new Logger(ReachlistZipBatchService.name);
  // Populated fresh at the start of each ingestZip() call — lowercased
  // ProviderMaster.providerName -> real casing, so filename inference can
  // recognize an existing canonical name directly (e.g. "TNS", "PCCW
  // Global") even when it has no separate alias-cache entry of its own
  // (aliases exist for *variant* spellings; the canonical name itself
  // usually doesn't need one).
  private providerNames = new Map<string, string>();
  // providerId -> canonical name, so an alias match (e.g. "DT" ->
  // Deutsche Telekom's id) can report/act on the real name rather than
  // the raw filename fragment that happened to match the alias.
  private providerNamesById = new Map<number, string>();

  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
    private providerResolver: ProviderResolverService,
  ) {}

  async ingestZip(buffer: Buffer, zipFilename: string, uploadedBy: string, replace: boolean): Promise<ReachlistZipBatchResult> {
    let zip: AdmZip;
    try {
      zip = new AdmZip(buffer);
    } catch (e) {
      throw new Error(`"${zipFilename}" could not be read as a .zip archive: ${e instanceof Error ? e.message : String(e)}`);
    }

    const entries = zip
      .getEntries()
      .filter((e) => !e.isDirectory && e.header.size > 0 && !/(^|\/)(__MACOSX|\.DS_Store)/.test(e.entryName));

    const [allMnos, allProviders] = await Promise.all([
      this.prisma.mnoMaster.findMany({ select: { operatorName: true, country: true, tadigCode: true } }),
      this.prisma.providerMaster.findMany({ select: { id: true, providerName: true } }),
    ]);
    const countryResolver = buildMnoResolver(allMnos);
    const nameOnlyResolver = buildGlobalNameResolver(allMnos);
    this.providerNames = new Map(allProviders.map((p) => [p.providerName.toLowerCase(), p.providerName]));
    this.providerNamesById = new Map(allProviders.map((p) => [p.id, p.providerName]));

    const files: ReachlistZipFileResult[] = [];
    const unresolvedMnos: { mnoName: string; country: string }[] = [];
    const seenUnresolved = new Set<string>();
    const errors: string[] = [];
    let totalRecordsLoaded = 0;

    const addUnresolved = (mnoName: string, country: string) => {
      const key = `${country}|${mnoName}`;
      if (seenUnresolved.has(key)) return;
      seenUnresolved.add(key);
      unresolvedMnos.push({ mnoName, country });
    };

    for (const entry of entries) {
      const filename = entry.entryName.split("/").pop() ?? entry.entryName;
      const ext = filename.split(".").pop()?.toLowerCase();

      if (ext !== "xlsx" && ext !== "xls" && ext !== "pdf" && ext !== "msg") {
        files.push({
          filename,
          fileType: "OTHER",
          status: "SKIPPED_UNSUPPORTED_FORMAT",
          recordsLoaded: 0,
          errorCount: 0,
          unresolvedMnoCount: 0,
          note: `".${ext}" is not one of the supported formats (.xlsx, .xls, .pdf, .msg).`,
        });
        continue;
      }

      try {
        const fileType = ext === "pdf" ? "PDF" : ext === "msg" ? "MSG" : "EXCEL";
        const result = await this.processEntry(entry.getData(), filename, ext, fileType, countryResolver, nameOnlyResolver, addUnresolved, replace);
        files.push(result);
        totalRecordsLoaded += result.recordsLoaded;
      } catch (e) {
        this.logger.error(`Failed processing "${filename}" from "${zipFilename}"`, e instanceof Error ? e.stack : undefined);
        files.push({
          filename,
          fileType: ext === "pdf" ? "PDF" : ext === "msg" ? "MSG" : "EXCEL",
          status: "SKIPPED_UNPARSEABLE",
          recordsLoaded: 0,
          errorCount: 1,
          unresolvedMnoCount: 0,
          note: e instanceof Error ? e.message : "Failed to parse this file.",
        });
        errors.push(`"${filename}": ${e instanceof Error ? e.message : "failed to parse"}`);
      }
    }

    const filesProcessed = files.filter((f) => f.status === "PROCESSED").length;
    const filesSkipped = files.length - filesProcessed;
    const status: UploadStatus =
      totalRecordsLoaded === 0
        ? UploadStatus.FAILED
        : filesSkipped > 0 || unresolvedMnos.length > 0
          ? UploadStatus.PARTIAL
          : UploadStatus.SUCCESS;

    const uploadHistory = await this.prisma.uploadHistory.create({
      data: {
        filename: zipFilename,
        uploadedBy,
        recordsLoaded: totalRecordsLoaded,
        status,
        errorLog: errors.length ? errors.join("\n") : null,
      },
    });

    return {
      uploadHistory: {
        id: uploadHistory.id,
        filename: uploadHistory.filename,
        uploadTime: uploadHistory.uploadTime.toISOString(),
        uploadedBy: uploadHistory.uploadedBy,
        recordsLoaded: uploadHistory.recordsLoaded,
        status: uploadHistory.status,
        errorLog: uploadHistory.errorLog,
        isCurrentActive: uploadHistory.isCurrentActive,
        mnoCount: null,
      },
      totalFilesInArchive: entries.length,
      filesProcessed,
      filesSkipped,
      totalRecordsLoaded,
      files,
      unresolvedMnos,
      errors,
    };
  }

  private async processEntry(
    buffer: Buffer,
    filename: string,
    ext: string,
    fileType: "EXCEL" | "PDF" | "MSG",
    countryResolver: ReturnType<typeof buildMnoResolver>,
    nameOnlyResolver: ReturnType<typeof buildGlobalNameResolver>,
    addUnresolved: (mnoName: string, country: string) => void,
    replace: boolean,
  ): Promise<ReachlistZipFileResult> {
    if (fileType === "EXCEL") {
      const parsed = await parseFlexibleExcel(buffer, ext === "xls", filename);
      if (!parsed.headerFound) {
        return this.skip(filename, fileType, "SKIPPED_UNPARSEABLE", "Could not find a recognizable header row (Country/Operator/TADIG/Service) anywhere in the first 40 rows — needs manual review.");
      }
      const provider = this.inferProviderFromFilename(filename);
      if (!provider) {
        return this.skip(filename, fileType, "SKIPPED_UNRESOLVED_PROVIDER", `Could not confidently match "${inferProviderNameCandidatesFromFilename(filename)[0]}" (from the filename) to a known provider.`);
      }
      const sources: RowSource[] = parsed.rows.map((r: FlexibleExcelRow) => ({
        country: r.country,
        operator: r.operator,
        tadigs: r.tadigs,
        services: r.services,
        connectionType: r.connectionType,
      }));
      const note = parsed.usedFilenameServiceFallback
        ? parsed.filenameFallbackFamilies.length > 0
          ? `Used filename to infer service: ${parsed.filenameFallbackFamilies.join(", ")}.`
          : "No service indicator found in the sheet or filename — rows without a resolvable service were skipped."
        : undefined;
      return this.ingest(sources, provider, filename, replace, fileType, countryResolver, addUnresolved, note);
    }

    if (fileType === "PDF") {
      const parsed = await parseComfonePdf(buffer);
      if (parsed.rows.length === 0) {
        return this.skip(filename, fileType, "SKIPPED_NO_DATA", "No TADIG-anchored rows recognized in the PDF text — this parser is built for the Comfone customer-list export layout specifically.");
      }
      const provider = this.inferProviderFromFilename(filename);
      if (!provider) {
        return this.skip(filename, fileType, "SKIPPED_UNRESOLVED_PROVIDER", `Could not confidently match "${inferProviderNameCandidatesFromFilename(filename)[0]}" (from the filename) to a known provider.`);
      }
      const sources: RowSource[] = parsed.rows.map((r) => ({ country: r.country, operator: "", tadigs: [r.tadig], services: r.services }));
      const note = parsed.skippedNonStandardCodeLines > 0
        ? `${parsed.skippedNonStandardCodeLines} row(s) had a non-standard placeholder code instead of a real TADIG, skipped.`
        : undefined;
      return this.ingest(sources, provider, filename, replace, fileType, countryResolver, addUnresolved, note);
    }

    // MSG
    const parsed = parseReachlistMsg(buffer);
    if (parsed.tadigRows.length === 0 && parsed.nameOnlyRows.length === 0) {
      return this.skip(filename, fileType, "SKIPPED_NO_DATA", "No reach-list data found in the message body — likely correspondence only (e.g. a request still being clarified), not a data submission.");
    }
    const provider = this.inferProviderFromFilename(filename) ?? this.inferProviderCandidate(parsed.senderName ?? "") ?? this.inferProviderFromEmailDomain(parsed.senderEmail);
    if (!provider) {
      return this.skip(filename, fileType, "SKIPPED_UNRESOLVED_PROVIDER", `Could not confidently match a provider from the filename, sender name ("${parsed.senderName ?? "unknown"}"), or sender email domain.`);
    }

    const sources: RowSource[] = parsed.tadigRows.map((r) => ({ country: r.country, operator: "", tadigs: [r.tadig], services: r.services }));
    let nameOnlyResolved = 0;
    for (const row of parsed.nameOnlyRows) {
      const resolution = nameOnlyResolver(row.operatorNameCandidate);
      if (resolution.status === "resolved") {
        sources.push({ country: "", operator: row.operatorNameCandidate, tadigs: [resolution.tadigCode], services: row.services });
        nameOnlyResolved++;
      } else {
        addUnresolved(row.operatorNameCandidate, "(no country given — free-text partner list)");
      }
    }
    const note = parsed.nameOnlyRows.length > 0
      ? `Matched ${nameOnlyResolved} of ${parsed.nameOnlyRows.length} free-text partner names to an existing operator (no per-line country given in the message).`
      : undefined;
    const nameOnlyUnresolved = parsed.nameOnlyRows.length - nameOnlyResolved;
    return this.ingest(sources, provider, filename, replace, fileType, countryResolver, addUnresolved, note, nameOnlyUnresolved);
  }

  private async ingest(
    sources: RowSource[],
    provider: string,
    filename: string,
    replace: boolean,
    fileType: "EXCEL" | "PDF" | "MSG",
    countryResolver: ReturnType<typeof buildMnoResolver>,
    addUnresolved: (mnoName: string, country: string) => void,
    note?: string,
    extraUnresolvedCount = 0,
  ): Promise<ReachlistZipFileResult> {
    // Applied here — uniformly, for every fileType — rather than only in
    // the Excel branch, so the rule runs identically no matter which
    // parser produced these rows (a hypothetical DT/CMI/iBasis PDF or
    // .msg gets the exact same treatment, not silently bypassed).
    const { kept, filteredOutCount } = this.applyCarrierRowFilter(provider, sources);
    if (filteredOutCount > 0) {
      note = [note, `${filteredOutCount} row(s) filtered out by ${provider}'s carrier-specific rule.`].filter(Boolean).join(" ");
    }

    const synthetic: Record<string, string>[] = [];
    let unresolvedInThisFile = 0;
    for (const row of kept) {
      if (row.services.length === 0) continue;
      const servicesStr = row.services.join(",");

      if (row.tadigs.length > 0) {
        for (const tadig of row.tadigs) {
          synthetic.push({ provider, country: row.country, mno: row.operator, tadig, services: servicesStr });
        }
        continue;
      }
      // No TADIG on this row at all (several real Excel formats never
      // carry one, e.g. TIS's exports) — resolve via country + operator
      // name against the existing operator roster instead.
      if (!row.country || !row.operator) continue;
      const resolution = countryResolver(row.country, row.operator);
      if (resolution.status !== "resolved") {
        addUnresolved(row.operator, row.country);
        unresolvedInThisFile++;
        continue;
      }
      synthetic.push({ provider, country: row.country, mno: row.operator, tadig: resolution.tadigCode, services: servicesStr });
    }

    if (synthetic.length === 0) {
      return { ...this.skip(filename, fileType, "SKIPPED_NO_DATA", note ?? "No rows resolved to a known operator."), inferredProvider: provider };
    }

    const raw = await this.uploadService.ingestReachlistRowsRaw(synthetic, filename, replace);
    return {
      filename,
      fileType,
      status: "PROCESSED",
      inferredProvider: provider,
      recordsLoaded: raw.recordsLoaded,
      recordsReplaced: raw.recordsReplaced,
      errorCount: raw.errors.length,
      // raw.unresolvedMnos only ever fires for the wide-matrix format's own
      // internal resolution path, which this synthetic-row pipeline never
      // takes (every row here already carries a tadig by construction) —
      // the real count is what this method's own country+name resolution
      // above just gave up on.
      unresolvedMnoCount: unresolvedInThisFile + raw.unresolvedMnos.length + extraUnresolvedCount,
      note,
    };
  }

  /** Carrier-specific row filtering, applied only to the three carriers
   * where it was explicitly requested — every other carrier keeps its
   * existing all-rows behavior. Runs uniformly for every fileType (see
   * the call site in ingest()), not just Excel.
   *
   * Deutsche Telekom / China Mobile: strictly "Direct" only. A row with
   * no connectionType at all (Deutsche Telekom's real file carries no
   * connection-type column whatsoever) does not count as confirmed
   * Direct and is excluded, same as an explicit "Indirect"/"Peering"
   * value would be.
   *
   * iBasis: real production data corrected this rule mid-implementation
   * — iBasis's actual "Route Type" column never contains the literal
   * word "iBasis" (it's already iBasis's own file; there's no per-row
   * provider-mention column), but it *does* carry a genuine on-net
   * signal: real values are "Direct", "On-Net", "On-Net Planned",
   * "On-Net 2", "On-Net Backup" (verified against the real file — 1,051
   * of 1,057 rows carry one of these; only 6 are genuinely blank). Kept
   * rows are any of those; a blank connectionType still excludes, same
   * strict "no confirmation, no inclusion" standard as DT/CMI. */
  private applyCarrierRowFilter(
    provider: string,
    rows: RowSource[],
  ): { kept: RowSource[]; filteredOutCount: number } {
    const key = provider.trim().toLowerCase();

    if (key === "deutsche telekom" || key === "china mobile") {
      const kept = rows.filter((r) => {
        const ct = (r.connectionType ?? "").toLowerCase();
        return /\bdirect\b/.test(ct) && !/\b(indirect|hub|transit)\b/.test(ct);
      });
      return { kept, filteredOutCount: rows.length - kept.length };
    }

    if (key === "ibasis") {
      const kept = rows.filter((r) => /\bdirect\b|on[\s-]?net/i.test(r.connectionType ?? ""));
      return { kept, filteredOutCount: rows.length - kept.length };
    }

    return { kept: rows, filteredOutCount: 0 };
  }

  private skip(
    filename: string,
    fileType: "EXCEL" | "PDF" | "MSG",
    status: "SKIPPED_UNPARSEABLE" | "SKIPPED_UNRESOLVED_PROVIDER" | "SKIPPED_NO_DATA",
    note: string,
  ): ReachlistZipFileResult {
    return { filename, fileType, status, recordsLoaded: 0, errorCount: 0, unresolvedMnoCount: 0, note };
  }

  /** Tries every filename-derived candidate (leading tokens — the common
   * "BICS External LTE..." convention — then trailing tokens, for a
   * forwarded-email subject that names the carrier last) and returns the
   * first that resolves confidently. */
  private inferProviderFromFilename(filename: string): string | null {
    for (const candidate of inferProviderNameCandidatesFromFilename(filename)) {
      const resolved = this.inferProviderCandidate(candidate);
      if (resolved) return resolved;
    }
    return null;
  }

  /** Only returns a provider when either (a) it's an existing
   * ProviderMaster name directly (case-insensitive exact match — catches
   * a canonical name like "TNS" that has no separate alias-cache entry of
   * its own, since aliases are normally registered only for *variant*
   * spellings) or (b) the alias resolver already confidently matches it —
   * the same exact/substring-match logic every other ingestion path
   * trusts (see ProviderResolverService). Never a guess: an unrecognized
   * candidate is reported back rather than spawning a new ProviderMaster
   * row from filename text alone. */
  private inferProviderCandidate(candidate: string): string | null {
    const trimmed = candidate.trim();
    if (!trimmed) return null;
    const directMatch = this.providerNames.get(trimmed.toLowerCase());
    if (directMatch) return directMatch;
    const normalized = this.providerResolver.normalize(trimmed);
    if (!normalized) return null;
    const providerId = this.providerResolver.matchAlias(normalized);
    if (!providerId) return null;
    // Resolve to the canonical name (e.g. "DT" -> "Deutsche Telekom") so
    // the UI breakdown and carrier-specific filtering both act on the
    // real identity, not the raw filename fragment that happened to
    // match the alias.
    return this.providerNamesById.get(providerId) ?? trimmed;
  }

  /** Tries every label of the sender's domain except the TLD — a domain
   * like "team.telstra.com" needs the second label, not the first, to
   * reach the actual carrier name. */
  private inferProviderFromEmailDomain(email: string | null): string | null {
    if (!email) return null;
    const labels = email.split("@")[1]?.split(".").slice(0, -1) ?? [];
    for (const label of labels) {
      const resolved = this.inferProviderCandidate(label);
      if (resolved) return resolved;
    }
    return null;
  }
}
