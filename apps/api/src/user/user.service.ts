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

    // One query for every user's most recent LoginHistory row, rather than
    // per-user round-trips — distinct+orderBy gives exactly the latest row
    // per userId in a single query.
    const latestLogins = await this.prisma.loginHistory.findMany({
      where: { userId: { in: users.map((u) => u.id) } },
      orderBy: { loginAt: "desc" },
      distinct: ["userId"],
      select: { userId: true, loginAt: true },
    });
    const lastLoginByUserId = new Map(latestLogins.map((l) => [l.userId, l.loginAt]));

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      isActive: u.isActive,
      authProvider: u.authProvider,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: lastLoginByUserId.get(u.id)?.toISOString() ?? null,
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

  private toRow(u: {
    id: number;
    email: string;
    name: string | null;
    role: Role;
    isActive: boolean;
    authProvider: string;
    createdAt: Date;
  }): UserRow {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      isActive: u.isActive,
      authProvider: u.authProvider as UserRow["authProvider"],
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: null,
    };
  }
}
