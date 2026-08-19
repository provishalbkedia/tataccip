import { ApiPropertyOptional } from "@nestjs/swagger";
import { DiscrepancyType, ServiceName } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsString } from "class-validator";

export class ComparisonFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  mnoId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  providerId?: number;

  @ApiPropertyOptional({ enum: ServiceName })
  @IsOptional()
  @IsEnum(ServiceName)
  service?: ServiceName;

  @ApiPropertyOptional({ enum: DiscrepancyType })
  @IsOptional()
  @IsEnum(DiscrepancyType)
  discrepancyType?: DiscrepancyType;
}
