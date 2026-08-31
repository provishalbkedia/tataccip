import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Patch, Query, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { MnoService } from "./mno.service";
import { SetSecondaryTadigsDto } from "./dto/set-secondary-tadigs.dto";

@ApiTags("mno")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("mno")
export class MnoController {
  constructor(private mnoService: MnoService) {}

  @Get("search")
  search(
    @Query("q") q?: string,
    @Query("tadig") tadig?: string,
    @Query("country") country?: string,
    @Query("mcc") mcc?: string,
    @Query("mnc") mnc?: string,
    @Query("region") region?: string,
    @Query("onlyWithProviders") onlyWithProviders?: string,
    @Query("datasetScope") datasetScope?: "ir21" | "reachlist" | "all",
  ) {
    return this.mnoService.search({
      q,
      tadig,
      country,
      mcc,
      mnc,
      region,
      onlyWithProviders: onlyWithProviders !== "false",
      datasetScope,
    });
  }

  // Must come before ":id" — otherwise Nest would route /mno/suggestions
  // (and /mno/compare-matrix) into detail() with id="suggestions" and fail
  // ParseIntPipe.
  @Get("suggestions")
  suggestions(@Query("q") q?: string) {
    return this.mnoService.suggestions(q ?? "");
  }

  @Get("compare-matrix")
  compareMatrix(@Query("mnoIds") mnoIds?: string) {
    const parsedIds = Array.from(
      new Set(
        (mnoIds ?? "")
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n)),
      ),
    );
    if (parsedIds.length < 2) {
      throw new BadRequestException("Provide at least 2 operator IDs via ?mnoIds=1,2,3 (max 5)");
    }
    if (parsedIds.length > 5) {
      throw new BadRequestException("Compare at most 5 operators at a time");
    }
    return this.mnoService.compareMatrix(parsedIds);
  }

  @Get(":id")
  detail(@Param("id", ParseIntPipe) id: number) {
    return this.mnoService.detail(id);
  }

  @Patch(":id/secondary-tadigs")
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  setSecondaryTadigs(@Param("id", ParseIntPipe) id: number, @Body() dto: SetSecondaryTadigsDto) {
    return this.mnoService.setSecondaryTadigs(id, dto.tadigs);
  }

  @Get(":id/pdf")
  async getPdf(@Param("id", ParseIntPipe) id: number, @Res() res: Response) {
    const { buffer, fileName } = await this.mnoService.getPdf(id);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName.replace(/"/g, "")}"`,
      "Content-Length": buffer.length,
    });
    res.send(buffer);
  }
}
