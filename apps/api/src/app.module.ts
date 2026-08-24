import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { UploadModule } from "./upload/upload.module";
import { ComparisonModule } from "./comparison/comparison.module";
import { MnoModule } from "./mno/mno.module";
import { ProviderModule } from "./provider/provider.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { ProviderAliasModule } from "./provider-alias/provider-alias.module";
import { ProviderOverrideModule } from "./provider-override/provider-override.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UploadModule,
    ComparisonModule,
    MnoModule,
    ProviderModule,
    DashboardModule,
    ProviderAliasModule,
    ProviderOverrideModule,
  ],
})
export class AppModule {}
