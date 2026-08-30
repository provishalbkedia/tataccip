import { Module } from "@nestjs/common";
import { MnoNormalizationController } from "./mno-normalization.controller";
import { MnoNormalizationService } from "./mno-normalization.service";

@Module({
  controllers: [MnoNormalizationController],
  providers: [MnoNormalizationService],
})
export class MnoNormalizationModule {}
