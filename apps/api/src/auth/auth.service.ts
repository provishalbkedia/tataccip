import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthProvider, Role } from "@prisma/client";
import { createRemoteJWKSet, jwtVerify } from "jose";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { ActiveUsersInfo, LoginHistorySummary, LoginResponse } from "@ccip/shared-types";
import { parseBrowserOs } from "./user-agent.util";

const RECENT_LOGIN_LIMIT = 20;
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

// Microsoft's multi-tenant OpenID discovery keyset — same keys serve every
// Azure AD tenant, so this one remote set covers any @tatacommunications.com
// user regardless of which tenant their account actually lives in.
// createRemoteJWKSet caches keys and handles rotation automatically.
const MICROSOFT_JWKS = createRemoteJWKSet(
  new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys"),
);
// A real Microsoft-issued token's iss claim is tenant-specific
// ("https://login.microsoftonline.com/<tenant-guid>/v2.0"), so it can't be
// checked as a single fixed string via jwtVerify's `issuer` option — matched
// against this pattern after signature verification instead.
const MICROSOFT_ISSUER_PATTERN = /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]{36}\/v2\.0$/i;

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
    // Microsoft-provisioned accounts carry a sentinel, never a real bcrypt
    // hash — bcrypt.compare against it just fails closed like any other
    // wrong password, but this check short-circuits without hashing the
    // input at all, and gives a clearer failure reason in a debugger.
    if (user.authProvider === AuthProvider.MICROSOFT) {
      throw new UnauthorizedException("This account signs in with Microsoft SSO, not a password");
    }
    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException("Invalid credentials");
    }
    if (!user.isActive) {
      throw new ForbiddenException("This account has been deactivated");
    }

    return this.issueSession(user, ipAddress, userAgent);
  }

  /** Verifies a Microsoft-issued OpenID Connect ID token (signature, issuer
   * shape, audience — see MICROSOFT_JWKS/MICROSOFT_ISSUER_PATTERN above),
   * enforces the corporate email domain, and auto-provisions a VIEWER
   * account on first sign-in. Never trusts any claim in the token before
   * jwtVerify's signature check succeeds. */
  async microsoftLogin(idToken: string, ipAddress?: string, userAgent?: string): Promise<LoginResponse> {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    if (!clientId) {
      throw new ForbiddenException("Microsoft sign-in is not configured on this server");
    }

    let payload: Record<string, unknown>;
    try {
      const result = await jwtVerify(idToken, MICROSOFT_JWKS, { audience: clientId });
      payload = result.payload;
    } catch {
      throw new UnauthorizedException("Invalid or expired Microsoft sign-in token");
    }

    const issuer = typeof payload.iss === "string" ? payload.iss : "";
    if (!MICROSOFT_ISSUER_PATTERN.test(issuer)) {
      throw new UnauthorizedException("Token was not issued by Microsoft Entra ID");
    }

    const email = String(payload.preferred_username ?? payload.email ?? payload.upn ?? "").toLowerCase();
    const name = typeof payload.name === "string" ? payload.name : null;
    if (!email) {
      throw new UnauthorizedException("Microsoft token did not include an email/UPN claim");
    }

    const allowedDomain = (process.env.ALLOWED_EMAIL_DOMAIN ?? "tatacommunications.com").toLowerCase();
    if (!email.endsWith(`@${allowedDomain}`)) {
      throw new ForbiddenException(`Access restricted to @${allowedDomain} accounts.`);
    }

    const defaultRole = (process.env.DEFAULT_SSO_ROLE as Role | undefined) ?? Role.VIEWER;
    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          name,
          role: defaultRole,
          isActive: true,
          authProvider: AuthProvider.MICROSOFT,
          passwordHash: "SSO_MANAGED_MICROSOFT",
        },
      });
    } else if (!user.isActive) {
      throw new ForbiddenException("This account has been deactivated");
    } else if (name && name !== user.name) {
      // Keep the display name in sync with Entra ID's directory on every
      // sign-in — role/authProvider are left untouched here, an admin's
      // prior role assignment should never be silently reset by a login.
      user = await this.prisma.user.update({ where: { id: user.id }, data: { name } });
    }

    return this.issueSession(user, ipAddress, userAgent);
  }

  private async issueSession(
    user: { id: number; email: string; role: Role; name: string | null },
    ipAddress?: string,
    userAgent?: string,
  ): Promise<LoginResponse> {
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
      user: { id: user.id, email: user.email, role: user.role as LoginResponse["user"]["role"], name: user.name },
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
