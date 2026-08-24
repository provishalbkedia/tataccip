import { Controller, Get, Param, ParseIntPipe, Query, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MnoService } from "./mno.service";

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
  ) {
    return this.mnoService.search({ q, tadig, country, mcc, mnc });
  }

  @Get(":id")
  detail(@Param("id", ParseIntPipe) id: number) {
    return this.mnoService.detail(id);
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
