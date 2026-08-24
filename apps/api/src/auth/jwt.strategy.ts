import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../prisma/prisma.service";

export interface JwtPayload {
  sub: number;
  email: string;
  role: "ADMIN" | "ANALYST" | "VIEWER";
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? "change-me-in-production",
    });
  }

  async validate(payload: JwtPayload) {
    // Fire-and-forget — powers the "N Online" header badge (see
    // AuthService.getActiveUsers). Never awaited and errors are swallowed
    // so a slow/failed presence update can't add latency or fail an
    // otherwise-valid request.
    this.prisma.user
      .update({ where: { id: payload.sub }, data: { lastActiveAt: new Date() } })
      .catch(() => {});

    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
