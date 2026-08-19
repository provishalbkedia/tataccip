import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ProviderService } from "./provider.service";

@ApiTags("provider")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("provider")
export class ProviderController {
  constructor(private providerService: ProviderService) {}

  @Get("search")
  search(@Query("q") q?: string) {
    return this.providerService.search(q);
  }

  @Get(":id")
  detail(@Param("id", ParseIntPipe) id: number) {
    return this.providerService.detail(id);
  }
}
