import { Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ComparisonService } from "./comparison.service";
import { ComparisonFilterDto } from "./dto/comparison-filter.dto";

@ApiTags("comparison")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("comparison")
export class ComparisonController {
  constructor(private comparisonService: ComparisonService) {}

  @Post("run")
  @Roles(Role.ADMIN)
  run() {
    return this.comparisonService.run();
  }

  @Get()
  find(@Query() filters: ComparisonFilterDto) {
    return this.comparisonService.find(filters);
  }
}
