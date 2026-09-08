import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UserRow } from "@ccip/shared-types";

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async list(q?: string, role?: Role): Promise<UserRow[]> {
    const users = await this.prisma.user.findMany({
      where: {
        AND: [
          q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {},
          role ? { role } : {},
        ],
      },
      orderBy: { createdAt: "asc" },
    });
    if (users.length === 0) return [];

    // One query for every user's login count and most recent LoginHistory
    // row, rather than per-user round-trips — _count/_max grouped by userId
    // gives both in a single query.
    const loginStats = await this.prisma.loginHistory.groupBy({
      by: ["userId"],
      where: { userId: { in: users.map((u) => u.id) } },
      _count: { _all: true },
      _max: { loginAt: true },
    });
    const statsByUserId = new Map(loginStats.map((s) => [s.userId, s]));

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      isActive: u.isActive,
      authProvider: u.authProvider,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: statsByUserId.get(u.id)?._max.loginAt?.toISOString() ?? null,
      loginCount: statsByUserId.get(u.id)?._count._all ?? 0,
      totalTimeSpentSeconds: u.totalTimeSpentSeconds,
      lastActiveAt: u.lastActiveAt?.toISOString() ?? null,
    }));
  }

  /** currentUserId is whoever is making the request (from the JWT) — an
   * admin can freely change anyone else's role, including to/from ADMIN,
   * but never their own: a self-demotion would either lock them out
   * immediately (JwtStrategy re-checks role isn't relevant here, but the
   * RolesGuard on admin-only routes would be) or, worse, let the very last
   * admin strip their own access with no one left to undo it. */
  async updateRole(userId: number, role: Role, currentUserId: number): Promise<UserRow> {
    if (userId === currentUserId) {
      throw new ForbiddenException("You cannot change your own role");
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    const updated = await this.prisma.user.update({ where: { id: userId }, data: { role } });
    return this.toRow(updated);
  }

  async updateStatus(userId: number, isActive: boolean, currentUserId: number): Promise<UserRow> {
    if (userId === currentUserId && !isActive) {
      throw new ForbiddenException("You cannot deactivate your own account");
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");
    if (!isActive && user.role === Role.ADMIN) {
      const activeAdminCount = await this.prisma.user.count({ where: { role: Role.ADMIN, isActive: true } });
      if (activeAdminCount <= 1) {
        throw new BadRequestException("Cannot deactivate the last active admin account");
      }
    }

    const updated = await this.prisma.user.update({ where: { id: userId }, data: { isActive } });
    return this.toRow(updated);
  }

  // Both callers above are immediately followed by the frontend re-fetching
  // the whole list (see /admin/users' load() after every mutation), so this
  // return value is never actually rendered — still queried for real rather
  // than stubbed, since a wrong loginCount/lastLoginAt in an API response is
  // a bug waiting to bite the next caller that doesn't happen to refetch.
  private async toRow(u: {
    id: number;
    email: string;
    name: string | null;
    role: Role;
    isActive: boolean;
    authProvider: string;
    createdAt: Date;
    totalTimeSpentSeconds: number;
    lastActiveAt: Date | null;
  }): Promise<UserRow> {
    const [loginCount, lastLogin] = await Promise.all([
      this.prisma.loginHistory.count({ where: { userId: u.id } }),
      this.prisma.loginHistory.findFirst({ where: { userId: u.id }, orderBy: { loginAt: "desc" }, select: { loginAt: true } }),
    ]);
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      isActive: u.isActive,
      authProvider: u.authProvider as UserRow["authProvider"],
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: lastLogin?.loginAt.toISOString() ?? null,
      loginCount,
      totalTimeSpentSeconds: u.totalTimeSpentSeconds,
      lastActiveAt: u.lastActiveAt?.toISOString() ?? null,
    };
  }
}
