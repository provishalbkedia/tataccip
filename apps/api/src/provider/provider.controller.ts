import { BadRequestException, Controller, Get, Param, ParseIntPipe, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ServiceName } from "@prisma/client";
import { ProviderStatsSource } from "@ccip/shared-types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ProviderService } from "./provider.service";

const VALID_SOURCES: string[] = Object.values(ProviderStatsSource);
const VALID_SERVICES: string[] = ["SCCP", "DSX", "IPX"];

@ApiTags("provider")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("provider")
export class ProviderController {
  constructor(private providerService: ProviderService) {}

  @Get("search")
  search(
    @Query("q") q?: string,
    @Query("source") source?: string,
    @Query("includeEmpty") includeEmpty?: string,
    @Query("service") service?: string,
  ) {
    const parsedSource = source && VALID_SOURCES.includes(source) ? (source as ProviderStatsSource) : ProviderStatsSource.BOTH;
    const parsedService = service && VALID_SERVICES.includes(service) ? (service as ServiceName) : undefined;
    return this.providerService.search(q, parsedSource, includeEmpty === "true", parsedService);
  }

  // Must come before ":id" — otherwise Nest would route /provider/suggestions
  // (and /provider/compare-matrix) into detail() with id="suggestions" and
  // fail ParseIntPipe.
  @Get("suggestions")
  suggestions(@Query("q") q?: string) {
    return this.providerService.suggestions(q ?? "");
  }

  @Get("compare-matrix")
  compareMatrix(@Query("ids") ids?: string) {
    const providerIds = Array.from(
      new Set(
        (ids ?? "")
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n)),
      ),
    );
    if (providerIds.length < 2) {
      throw new BadRequestException("Provide at least 2 provider IDs via ?ids=1,2,3 (max 5)");
    }
    if (providerIds.length > 5) {
      throw new BadRequestException("Compare at most 5 providers at a time");
    }
    return this.providerService.compareMatrix(providerIds);
  }

  @Get(":id")
  detail(@Param("id", ParseIntPipe) id: number, @Query("source") source?: string) {
    const parsedSource = source && VALID_SOURCES.includes(source) ? (source as ProviderStatsSource) : ProviderStatsSource.BOTH;
    return this.providerService.detail(id, parsedSource);
  }
}
