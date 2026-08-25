import { Module } from "@nestjs/common";
import { ProviderController } from "./provider.controller";
import { ProviderService } from "./provider.service";
import { UploadModule } from "../upload/upload.module";

@Module({
  imports: [UploadModule],
  controllers: [ProviderController],
  providers: [ProviderService],
})
export class ProviderModule {}
