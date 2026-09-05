import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { Ir21RoutingChangeQuery, Ir21RoutingChangesService } from "./ir21-routing-changes.service";
import { ReclassifyRoutingChangeDto } from "./dto/reclassify-routing-change.dto";

@ApiTags("analytics")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("analytics/ir21-changes")
export class Ir21RoutingChangesController {
  constructor(private ir21RoutingChangesService: Ir21RoutingChangesService) {}

  @Get("summary")
  @Roles(Role.ADMIN, Role.ANALYST, Role.VIEWER)
  summary(@Query() query: Ir21RoutingChangeQuery) {
    return this.ir21RoutingChangesService.summary(query);
  }

  @Get("feed")
  @Roles(Role.ADMIN, Role.ANALYST, Role.VIEWER)
  feed(@Query() query: Ir21RoutingChangeQuery) {
    return this.ir21RoutingChangesService.feed(query);
  }

  // Admin-only correction from the IR.21 Change Log & Normalization Review
  // screen -- overrides an automatic classification.
  @Patch(":id/reclassify")
  @Roles(Role.ADMIN)
  reclassify(@Param("id") id: string, @Body() dto: ReclassifyRoutingChangeDto) {
    return this.ir21RoutingChangesService.reclassify(id, dto.changeType, dto.isInitialOnboarding);
  }

  // Admin-only, idempotent, re-runnable at any time -- retroactively fixes
  // isInitialOnboarding on rows written before that concept existed (or
  // before it existed at all, pre-migration). See the service method's own
  // doc comment for exactly what this can and can't recover.
  @Post("reprocess-onboarding")
  @Roles(Role.ADMIN)
  reprocessOnboarding() {
    return this.ir21RoutingChangesService.reprocessOnboardingClassification();
  }
}
