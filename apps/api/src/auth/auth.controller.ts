import { Body, Controller, Get, Headers, Ip, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("login")
  login(@Body() dto: LoginDto, @Ip() ip: string, @Headers("user-agent") userAgent?: string) {
    return this.authService.login(dto.email, dto.password, ip, userAgent);
  }

  @Get("login-history")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  loginHistory(@Req() req: { user: { userId: number } }) {
    return this.authService.loginHistory(req.user.userId);
  }
}
