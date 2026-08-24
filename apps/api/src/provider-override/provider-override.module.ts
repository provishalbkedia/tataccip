import { Module } from "@nestjs/common";
import { UploadModule } from "../upload/upload.module";
import { ProviderOverrideController } from "./provider-override.controller";
import { ProviderOverrideService } from "./provider-override.service";

@Module({
  imports: [UploadModule],
  controllers: [ProviderOverrideController],
  providers: [ProviderOverrideService],
})
export class ProviderOverrideModule {}
