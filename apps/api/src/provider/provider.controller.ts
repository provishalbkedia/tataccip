import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ProviderStatsSource } from "@ccip/shared-types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ProviderService } from "./provider.service";

const VALID_SOURCES: string[] = Object.values(ProviderStatsSource);

@ApiTags("provider")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("provider")
export class ProviderController {
  constructor(private providerService: ProviderService) {}

  @Get("search")
  search(@Query("q") q?: string, @Query("source") source?: string, @Query("includeEmpty") includeEmpty?: string) {
    const parsedSource = source && VALID_SOURCES.includes(source) ? (source as ProviderStatsSource) : ProviderStatsSource.BOTH;
    return this.providerService.search(q, parsedSource, includeEmpty === "true");
  }

  @Get(":id")
  detail(@Param("id", ParseIntPipe) id: number) {
    return this.providerService.detail(id);
  }
}
