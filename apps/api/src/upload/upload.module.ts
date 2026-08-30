import { Module } from "@nestjs/common";
import { UploadController } from "./upload.controller";
import { UploadService } from "./upload.service";
import { Ir21XmlParserService } from "./ir21-xml-parser.service";
import { ProviderResolverService } from "./provider-resolver.service";
import { SupabaseStorageService } from "./supabase-storage.service";
import { ReachlistZipBatchService } from "./reachlist-zip-batch.service";

@Module({
  controllers: [UploadController],
  providers: [UploadService, Ir21XmlParserService, ProviderResolverService, SupabaseStorageService, ReachlistZipBatchService],
  exports: [ProviderResolverService, SupabaseStorageService],
})
export class UploadModule {}
