import { Module } from "@nestjs/common";
import { UploadModule } from "../upload/upload.module";
import { ProviderAliasController } from "./provider-alias.controller";
import { ProviderAliasService } from "./provider-alias.service";

@Module({
  imports: [UploadModule],
  controllers: [ProviderAliasController],
  providers: [ProviderAliasService],
})
export class ProviderAliasModule {}
