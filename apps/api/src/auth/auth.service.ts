import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { LoginHistorySummary, LoginResponse } from "@ccip/shared-types";
import { parseBrowserOs } from "./user-agent.util";

const RECENT_LOGIN_LIMIT = 20;

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

    await this.prisma.loginHistory.create({
      data: { userId: user.id, ipAddress, userAgent },
    });

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
}
