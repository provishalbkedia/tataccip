import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { UploadModule } from "./upload/upload.module";
import { ComparisonModule } from "./comparison/comparison.module";
import { MnoModule } from "./mno/mno.module";
import { ProviderModule } from "./provider/provider.module";
import { DashboardModule } from "./dashboard/dashboard.module";

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
  ],
})
export class AppModule {}
