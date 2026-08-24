import { IsInt, IsOptional, IsString } from "class-validator";

export class ReassignAliasDto {
  @IsOptional()
  @IsInt()
  targetProviderId?: number;

  @IsOptional()
  @IsString()
  newProviderName?: string;
}
