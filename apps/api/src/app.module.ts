import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthController } from "./health/health.controller";
import { AuthModule } from "./auth/auth.module";
import { UploadModule } from "./upload/upload.module";
import { MnoModule } from "./mno/mno.module";
import { ProviderModule } from "./provider/provider.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { ProviderAliasModule } from "./provider-alias/provider-alias.module";
import { ProviderOverrideModule } from "./provider-override/provider-override.module";
import { UserModule } from "./user/user.module";
import { MnoNormalizationModule } from "./mno-normalization/mno-normalization.module";
import { AnalyticsModule } from "./analytics/analytics.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UploadModule,
    MnoModule,
    ProviderModule,
    DashboardModule,
    ProviderAliasModule,
    ProviderOverrideModule,
    UserModule,
    MnoNormalizationModule,
    AnalyticsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
