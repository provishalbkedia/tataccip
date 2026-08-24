import { IsInt, IsString, MinLength } from "class-validator";

export class AddAliasDto {
  @IsInt()
  providerId!: number;

  @IsString()
  @MinLength(1)
  aliasPattern!: string;
}
