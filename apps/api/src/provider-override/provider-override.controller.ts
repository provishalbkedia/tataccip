import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { ProviderOverrideService } from "./provider-override.service";
import { SaveOverridesBatchDto } from "./dto/save-overrides-batch.dto";

@ApiTags("provider-overrides")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("provider-overrides")
export class ProviderOverrideController {
  constructor(private overrideService: ProviderOverrideService) {}

  @Get()
  @Roles(Role.ADMIN, Role.ANALYST, Role.VIEWER)
  list() {
    return this.overrideService.list();
  }

  @Post("batch")
  @Roles(Role.ADMIN)
  saveBatch(@Body() dto: SaveOverridesBatchDto, @CurrentUser() user: { email: string }) {
    return this.overrideService.saveBatch(dto, user.email);
  }

  @Delete(":id")
  @Roles(Role.ADMIN)
  revert(@Param("id") id: string) {
    return this.overrideService.revert(id);
  }
}
