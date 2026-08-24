import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class MicrosoftLoginDto {
  @ApiProperty({ description: "Raw Microsoft OpenID Connect ID token from MSAL's loginPopup()" })
  @IsString()
  @MinLength(10)
  idToken: string;
}
