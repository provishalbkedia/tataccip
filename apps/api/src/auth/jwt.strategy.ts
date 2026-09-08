import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../prisma/prisma.service";
import { ONLINE_WINDOW_MS } from "./auth.service";

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
      select: { isActive: true, role: true, lastActiveAt: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Account is inactive or no longer exists");
    }

    // Fire-and-forget — powers the "N Online" header badge (see
    // AuthService.getActiveUsers) and User.totalTimeSpentSeconds. Never
    // awaited and errors are swallowed so a slow/failed presence update
    // can't add latency or fail an otherwise-valid request.
    //
    // The gap since this user's previous request is only added to
    // totalTimeSpentSeconds when it's within ONLINE_WINDOW_MS — the same
    // window "online" uses — so a request after being away for hours
    // doesn't silently credit them for all that idle time, only for
    // genuinely continuous activity.
    const now = new Date();
    const gapMs = user.lastActiveAt ? now.getTime() - user.lastActiveAt.getTime() : Infinity;
    const accruedSeconds = gapMs > 0 && gapMs <= ONLINE_WINDOW_MS ? Math.round(gapMs / 1000) : 0;
    this.prisma.user
      .update({
        where: { id: payload.sub },
        data: { lastActiveAt: now, totalTimeSpentSeconds: { increment: accruedSeconds } },
      })
      .catch(() => {});

    // role comes from the freshly-read row, not the (possibly stale) JWT
    // claim — an admin's role change also takes effect immediately rather
    // than waiting for re-login, same as the isActive check above.
    return { userId: payload.sub, email: payload.email, role: user.role };
  }
}
