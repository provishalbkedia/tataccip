import { ApiProperty } from "@nestjs/swagger";
import { IsInt } from "class-validator";

export class ResolveMnoNormalizationDto {
  @ApiProperty({ description: "The existing MnoMaster id this Reach List row should map to" })
  @IsInt()
  mnoId!: number;
}
