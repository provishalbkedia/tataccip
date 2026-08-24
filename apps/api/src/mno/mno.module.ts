import { Module } from "@nestjs/common";
import { MnoController } from "./mno.controller";
import { MnoService } from "./mno.service";
import { UploadModule } from "../upload/upload.module";

@Module({
  imports: [UploadModule],
  controllers: [MnoController],
  providers: [MnoService],
})
export class MnoModule {}
