import { Injectable, UnauthorizedException } from "@nestjs/common";
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
    // Awaited (unlike the presence update below) so a deactivated account
    // (PUT /users/:id/status) stops working on its very next request rather
    // than staying valid until the JWT naturally expires — JWT auth is
    // otherwise stateless, so this check is the only real revocation point.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { isActive: true, role: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Account is inactive or no longer exists");
    }

    // Fire-and-forget — powers the "N Online" header badge (see
    // AuthService.getActiveUsers). Never awaited and errors are swallowed
    // so a slow/failed presence update can't add latency or fail an
    // otherwise-valid request.
    this.prisma.user.update({ where: { id: payload.sub }, data: { lastActiveAt: new Date() } }).catch(() => {});

    // role comes from the freshly-read row, not the (possibly stale) JWT
    // claim — an admin's role change also takes effect immediately rather
    // than waiting for re-login, same as the isActive check above.
    return { userId: payload.sub, email: payload.email, role: user.role };
  }
}
