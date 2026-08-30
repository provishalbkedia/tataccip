import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { memoryStorage } from "multer";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { UploadService } from "./upload.service";
import { ReachlistZipBatchService } from "./reachlist-zip-batch.service";

const fileUploadBody = {
  schema: { type: "object", properties: { file: { type: "string", format: "binary" } } },
};

// A Multi-Carrier Reach List ZIP is a bundle of many carriers' own
// exports (Excel/xls/PDF/msg) — generous but bounded well under Cloud
// Run's 32 MiB HTTP/1.1 request cap, since unlike the IR.21 XML path this
// isn't expected to need the split-upload/http2 treatment.
const MAX_REACHLIST_ZIP_BYTES = 30 * 1024 * 1024;

// GSMA IR.21 XML batches: up to ~1,000 files (or one .zip containing that
// many) per request. Bare XML files run a few KB-100KB each, but a .zip
// bundling XML + the official PDFs (see SupabaseStorageService) can run
// 100-150MB — sized well above that. Cloud Run's own HTTP/1.1 request-body
// cap (32 MiB) is actually the binding limit below this number; the
// service must run with --use-http2 for uploads in this range to work at
// all (see Dockerfile/deploy notes).
const MAX_XML_BATCH_FILES = 1100;
const MAX_XML_FILE_BYTES = 250 * 1024 * 1024;

const xmlBatchUploadBody = {
  schema: {
    type: "object",
    properties: { files: { type: "array", items: { type: "string", format: "binary" } } },
  },
};

@ApiTags("upload")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("upload")
export class UploadController {
  constructor(
    private uploadService: UploadService,
    private reachlistZipBatchService: ReachlistZipBatchService,
  ) {}

  @Post("reachlist")
  @Roles(Role.ADMIN)
  @ApiConsumes("multipart/form-data")
  @ApiBody(fileUploadBody)
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage() }))
  async uploadReachlist(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { email: string },
    @Body("replace") replace?: string,
  ) {
    if (!file) throw new BadRequestException("No file uploaded");
    return this.uploadService.uploadReachlist(file.buffer, file.originalname, user.email, replace === "true");
  }

  // Multi-Carrier Reach List ZIP Batch Ingestion — a distinct path from
  // the single-file endpoint above (see reachlist-zip-batch.service.ts's
  // header comment for why this isn't just an extension of it).
  @Post("reachlist-zip")
  @Roles(Role.ADMIN)
  @ApiConsumes("multipart/form-data")
  @ApiBody(fileUploadBody)
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MAX_REACHLIST_ZIP_BYTES } }))
  async uploadReachlistZip(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { email: string },
    @Body("replace") replace?: string,
  ) {
    if (!file) throw new BadRequestException("No file uploaded");
    if (!file.originalname.toLowerCase().endsWith(".zip")) throw new BadRequestException("Expected a .zip archive");
    return this.reachlistZipBatchService.ingestZip(file.buffer, file.originalname, user.email, replace === "true");
  }

  @Post("ir21-xml")
  @Roles(Role.ADMIN)
  @ApiConsumes("multipart/form-data")
  @ApiBody(xmlBatchUploadBody)
  @UseInterceptors(
    FilesInterceptor("files", MAX_XML_BATCH_FILES, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_XML_FILE_BYTES },
    }),
  )
  async uploadIr21XmlBatch(
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: { email: string },
    @Body("replaceActiveDataset") replaceActiveDataset?: string,
  ) {
    if (!files || files.length === 0) throw new BadRequestException("No files uploaded");
    const invalid = files.find(
      (f) => !f.originalname.toLowerCase().endsWith(".xml") && !f.originalname.toLowerCase().endsWith(".zip"),
    );
    if (invalid) throw new BadRequestException(`"${invalid.originalname}" is not a .xml or .zip file`);

    return this.uploadService.uploadIr21XmlBatch(
      files.map((f) => ({ buffer: f.buffer, originalname: f.originalname })),
      user.email,
      replaceActiveDataset === "true",
    );
  }

  @Get("history")
  @Roles(Role.ADMIN, Role.ANALYST, Role.VIEWER)
  async history() {
    return this.uploadService.getHistory();
  }

  @Get("active-baseline")
  @Roles(Role.ADMIN, Role.ANALYST, Role.VIEWER)
  async activeBaseline() {
    return this.uploadService.getActiveBaseline();
  }

  @Post("backfill-dsx")
  @Roles(Role.ADMIN)
  @HttpCode(200)
  async backfillDsx() {
    return this.uploadService.backfillDsxFromSnapshot();
  }
}
