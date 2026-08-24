import { Body, Controller, Get, Param, ParseIntPipe, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { UserService } from "./user.service";
import { UpdateUserRoleDto } from "./dto/update-user-role.dto";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";

const VALID_ROLES: string[] = Object.values(Role);

@ApiTags("users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller("users")
export class UserController {
  constructor(private userService: UserService) {}

  @Get()
  list(@Query("q") q?: string, @Query("role") role?: string) {
    const parsedRole = role && VALID_ROLES.includes(role) ? (role as Role) : undefined;
    return this.userService.list(q, parsedRole);
  }

  @Put(":id/role")
  updateRole(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.userService.updateRole(id, dto.role, user.userId);
  }

  @Put(":id/status")
  updateStatus(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.userService.updateStatus(id, dto.isActive, user.userId);
  }
}
