import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { Ir21RoutingChangeQuery, Ir21RoutingChangesService } from "./ir21-routing-changes.service";

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
}
