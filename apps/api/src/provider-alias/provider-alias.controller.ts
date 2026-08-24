import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ProviderAliasService } from "./provider-alias.service";
import { ResolveProviderAliasDto } from "./dto/resolve-provider-alias.dto";
import { RemapProviderDto } from "./dto/remap-provider.dto";
import { AddAliasDto } from "./dto/add-alias.dto";
import { ReassignAliasDto } from "./dto/reassign-alias.dto";

@ApiTags("provider-aliases")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("provider-aliases")
export class ProviderAliasController {
  constructor(private providerAliasService: ProviderAliasService) {}

  @Get("unmapped")
  @Roles(Role.ADMIN, Role.ANALYST, Role.VIEWER)
  listUnmapped() {
    return this.providerAliasService.listUnmapped();
  }

  @Post("resolve")
  @Roles(Role.ADMIN)
  resolve(@Body() dto: ResolveProviderAliasDto) {
    return this.providerAliasService.resolve(dto);
  }

  @Post("remap")
  @Roles(Role.ADMIN)
  remap(@Body() dto: RemapProviderDto) {
    return this.providerAliasService.remap(dto);
  }

  @Delete("provider/:id")
  @Roles(Role.ADMIN)
  deleteProvider(@Param("id", ParseIntPipe) id: number, @Query("force") force?: string) {
    return this.providerAliasService.deleteProvider(id, force === "true");
  }

  // Provider Normalization & Alias Dictionary (Admin Overrides dashboard, Tab 2)
  @Get("dictionary")
  @Roles(Role.ADMIN, Role.ANALYST, Role.VIEWER)
  dictionary() {
    return this.providerAliasService.dictionary();
  }

  @Post("alias")
  @Roles(Role.ADMIN)
  @HttpCode(204)
  addAlias(@Body() dto: AddAliasDto) {
    return this.providerAliasService.addAlias(dto.providerId, dto.aliasPattern);
  }

  @Patch("alias/:id/reassign")
  @Roles(Role.ADMIN)
  reassignAlias(@Param("id") id: string, @Body() dto: ReassignAliasDto) {
    return this.providerAliasService.reassignAlias(id, dto);
  }

  @Delete("alias/:id")
  @Roles(Role.ADMIN)
  @HttpCode(204)
  deleteAlias(@Param("id") id: string) {
    return this.providerAliasService.deleteAlias(id);
  }
}
