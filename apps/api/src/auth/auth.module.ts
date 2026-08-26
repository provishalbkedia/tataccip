import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "change-me-in-production",
      // Was 8h — real users were getting logged out mid-session on any
      // workday longer than that. 24h plus the sliding refresh below
      // (POST /auth/refresh, called periodically while the tab is open)
      // means an active session effectively never expires, while a token
      // left untouched still dies within a day if the device is lost.
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? "24h" },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
