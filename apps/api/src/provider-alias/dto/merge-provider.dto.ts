import { ApiProperty } from "@nestjs/swagger";
import { IsInt } from "class-validator";

export class MergeProviderDto {
  @ApiProperty({ description: "The duplicate ProviderMaster id to merge away" })
  @IsInt()
  sourceProviderId!: number;

  @ApiProperty({ description: "The canonical ProviderMaster id to merge into" })
  @IsInt()
  targetProviderId!: number;
}
