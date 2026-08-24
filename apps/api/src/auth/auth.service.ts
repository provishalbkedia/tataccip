import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { ActiveUsersInfo, LoginHistorySummary, LoginResponse } from "@ccip/shared-types";
import { parseBrowserOs } from "./user-agent.util";

const RECENT_LOGIN_LIMIT = 20;
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /** JWT auth is stateless — nothing here restricts or invalidates concurrent
   * logins from other browsers/devices; every successful login just issues
   * a fresh token. ipAddress/userAgent are logged purely for the activity
   * history a user can review, not for access control. */
  async login(email: string, password: string, ipAddress?: string, userAgent?: string): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    await Promise.all([
      this.prisma.loginHistory.create({ data: { userId: user.id, ipAddress, userAgent } }),
      // JwtStrategy only sets this on the *next* authenticated request, not
      // the login call itself (login is unguarded) — set it here too so
      // "just logged in" shows up as online immediately.
      this.prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } }),
    ]);

    return {
      accessToken,
      user: { id: user.id, email: user.email, role: user.role as LoginResponse["user"]["role"] },
    };
  }

  async loginHistory(userId: number): Promise<LoginHistorySummary> {
    const [totalLogins, rows] = await Promise.all([
      this.prisma.loginHistory.count({ where: { userId } }),
      this.prisma.loginHistory.findMany({
        where: { userId },
        orderBy: { loginAt: "desc" },
        take: RECENT_LOGIN_LIMIT,
      }),
    ]);

    return {
      totalLogins,
      recent: rows.map((r) => ({
        id: r.id,
        loginAt: r.loginAt.toISOString(),
        ipAddress: r.ipAddress,
        browserOs: parseBrowserOs(r.userAgent ?? undefined),
      })),
    };
  }

  /** Powers the header's "N Online | M Total Logins" badge. "Online" is
   * anyone whose lastActiveAt (see JwtStrategy) falls within the last 5
   * minutes — a heuristic, not a real session/presence system, since JWT
   * auth has no server-side session to query directly. */
  async getActiveUsers(): Promise<ActiveUsersInfo> {
    const since = new Date(Date.now() - ONLINE_WINDOW_MS);
    const [totalLoginsCount, onlineUsers] = await Promise.all([
      this.prisma.loginHistory.count(),
      this.prisma.user.findMany({
        where: { lastActiveAt: { gte: since } },
        orderBy: { lastActiveAt: "desc" },
        select: { email: true, role: true, lastActiveAt: true },
      }),
    ]);

    return {
      totalLoginsCount,
      onlineUsersCount: onlineUsers.length,
      onlineUsersList: onlineUsers.map((u) => ({
        email: u.email,
        role: u.role as ActiveUsersInfo["onlineUsersList"][number]["role"],
        lastActiveAt: u.lastActiveAt!.toISOString(),
      })),
    };
  }
}
