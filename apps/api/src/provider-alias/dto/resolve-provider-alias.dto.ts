import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, IsUUID } from "class-validator";

export class ResolveProviderAliasDto {
  @ApiProperty()
  @IsUUID()
  variantId!: string;

  @ApiPropertyOptional({ description: "Map to this existing ProviderMaster id" })
  @IsOptional()
  @IsInt()
  providerId?: number;

  @ApiPropertyOptional({ description: "Or create a new ProviderMaster with this canonical name" })
  @IsOptional()
  @IsString()
  newProviderName?: string;
}
