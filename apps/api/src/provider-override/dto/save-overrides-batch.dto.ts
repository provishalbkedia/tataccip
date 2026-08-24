import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, ValidateNested } from "class-validator";
import { ServiceName } from "@prisma/client";

export class MnoProviderOverrideEntryDto {
  @IsString()
  tadigCode!: string;

  @IsInt()
  providerId!: number;

  @IsOptional()
  @IsString()
  reasonNote?: string;

  @IsOptional()
  @IsString()
  originalRawString?: string;
}

export class SaveOverridesBatchDto {
  @IsEnum(ServiceName)
  service!: ServiceName;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MnoProviderOverrideEntryDto)
  entries!: MnoProviderOverrideEntryDto[];
}
