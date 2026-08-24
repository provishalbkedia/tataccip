import { ApiProperty } from "@nestjs/swagger";
import { ArrayMinSize, IsInt } from "class-validator";

export class MergeProviderDto {
  @ApiProperty({ description: "The duplicate ProviderMaster ids to merge away", type: [Number] })
  @IsInt({ each: true })
  @ArrayMinSize(1)
  sourceProviderIds!: number[];

  @ApiProperty({ description: "The canonical ProviderMaster id to merge into (or the 'Others / Unassigned' id)" })
  @IsInt()
  targetProviderId!: number;
}
