import { Module } from "@nestjs/common";
import { UploadController } from "./upload.controller";
import { UploadService } from "./upload.service";
import { Ir21XmlParserService } from "./ir21-xml-parser.service";
import { ProviderResolverService } from "./provider-resolver.service";

@Module({
  controllers: [UploadController],
  providers: [UploadService, Ir21XmlParserService, ProviderResolverService],
  exports: [ProviderResolverService],
})
export class UploadModule {}
