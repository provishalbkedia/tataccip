import { ArrayMaxSize, IsArray, IsString } from "class-validator";

export class SetSecondaryTadigsDto {
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  tadigs!: string[];
}
