import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ProviderAliasService } from "./provider-alias.service";
import { ResolveProviderAliasDto } from "./dto/resolve-provider-alias.dto";

@ApiTags("provider-aliases")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("provider-aliases")
export class ProviderAliasController {
  constructor(private providerAliasService: ProviderAliasService) {}

  @Get("unmapped")
  @Roles(Role.ADMIN)
  listUnmapped() {
    return this.providerAliasService.listUnmapped();
  }

  @Post("resolve")
  @Roles(Role.ADMIN)
  resolve(@Body() dto: ResolveProviderAliasDto) {
    return this.providerAliasService.resolve(dto);
  }
}
