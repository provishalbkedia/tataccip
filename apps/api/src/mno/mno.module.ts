import { Module } from "@nestjs/common";
import { MnoController } from "./mno.controller";
import { MnoService } from "./mno.service";

@Module({
  controllers: [MnoController],
  providers: [MnoService],
})
export class MnoModule {}
