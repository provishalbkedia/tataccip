import {
  BadRequestException,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { memoryStorage } from "multer";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { UploadService } from "./upload.service";

const fileUploadBody = {
  schema: { type: "object", properties: { file: { type: "string", format: "binary" } } },
};

@ApiTags("upload")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("upload")
export class UploadController {
  constructor(private uploadService: UploadService) {}

  @Post("ir21")
  @Roles(Role.ADMIN)
  @ApiConsumes("multipart/form-data")
  @ApiBody(fileUploadBody)
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage() }))
  async uploadIr21(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { email: string },
  ) {
    if (!file) throw new BadRequestException("No file uploaded");
    return this.uploadService.uploadIr21(file.buffer, file.originalname, user.email);
  }

  @Post("reachlist")
  @Roles(Role.ADMIN)
  @ApiConsumes("multipart/form-data")
  @ApiBody(fileUploadBody)
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage() }))
  async uploadReachlist(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { email: string },
  ) {
    if (!file) throw new BadRequestException("No file uploaded");
    return this.uploadService.uploadReachlist(file.buffer, file.originalname, user.email);
  }

  @Get("history")
  @Roles(Role.ADMIN, Role.ANALYST)
  async history() {
    return this.uploadService.getHistory();
  }
}
