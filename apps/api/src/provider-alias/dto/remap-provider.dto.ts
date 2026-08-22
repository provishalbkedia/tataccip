import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString } from "class-validator";

export class RemapProviderDto {
  @ApiProperty({ description: "The raw declared carrier string to remap, exactly as it appears in the source data" })
  @IsString()
  rawString!: string;

  @ApiPropertyOptional({ description: "Map to this existing ProviderMaster id" })
  @IsOptional()
  @IsInt()
  targetProviderId?: number;

  @ApiPropertyOptional({ description: "Or create a new ProviderMaster with this canonical name" })
  @IsOptional()
  @IsString()
  newProviderName?: string;
}
