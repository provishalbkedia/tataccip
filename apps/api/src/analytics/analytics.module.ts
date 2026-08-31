import { Module } from "@nestjs/common";
import { Ir21RoutingChangesController } from "./ir21-routing-changes.controller";
import { Ir21RoutingChangesService } from "./ir21-routing-changes.service";

@Module({
  controllers: [Ir21RoutingChangesController],
  providers: [Ir21RoutingChangesService],
})
export class AnalyticsModule {}
