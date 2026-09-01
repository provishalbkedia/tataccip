import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { CreateMnoFromAuditRequest } from "@ccip/shared-types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { MnoNormalizationService } from "./mno-normalization.service";
import { ResolveMnoNormalizationDto } from "./dto/resolve-mno-normalization.dto";

@ApiTags("mno-normalization")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("mno-normalization")
export class MnoNormalizationController {
  constructor(private mnoNormalizationService: MnoNormalizationService) {}

  @Get("pending")
  @Roles(Role.ADMIN, Role.ANALYST, Role.VIEWER)
  listPending() {
    return this.mnoNormalizationService.listPending();
  }

  @Post(":id/resolve")
  @Roles(Role.ADMIN)
  resolve(
    @Param("id") id: string,
    @Body() dto: ResolveMnoNormalizationDto,
    @CurrentUser() user: { email: string },
  ) {
    return this.mnoNormalizationService.resolve(id, dto.mnoId, user.email);
  }

  @Post("create-mno")
  @Roles(Role.ADMIN)
  createMno(@Body() dto: CreateMnoFromAuditRequest, @CurrentUser() user: { email: string }) {
    return this.mnoNormalizationService.createFromAudits(dto.auditIds, user.email);
  }
}
