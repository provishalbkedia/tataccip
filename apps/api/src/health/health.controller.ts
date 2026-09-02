import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private prisma: PrismaService) {}

  // Deliberately unauthenticated and dependency-free (no DB call) — the
  // frontend's "Refresh / Warm-up" button and its on-load ping hit this to
  // wake an idle Cloud Run instance as fast as possible, not to check DB
  // connectivity.
  @Get()
  ping() {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  // Unlike ping() above, this one deliberately DOES touch the database —
  // its entire purpose is an active read against Postgres, not a fast
  // Cloud Run wake-up. Supabase's free/starter tier auto-pauses a project
  // after ~7 days of zero inbound database activity; app traffic alone
  // doesn't guarantee that during a genuinely quiet stretch (a weekend, a
  // lull between uploads), since Cloud Run itself scales to zero when
  // idle (no min-instances configured) and every route otherwise only
  // queries the DB in response to a real user action. An external
  // scheduler (see .github/workflows/supabase-keepalive.yml) hits this on
  // a fixed cadence well under that 7-day window — the HTTP request also
  // cold-starts Cloud Run first if it's scaled to zero, so one ping
  // covers both dormancy risks. Read-only and side-effect-free (SELECT
  // 1), so left unauthenticated like ping() above rather than managing a
  // cron secret for a query with nothing to protect.
  @Get("keepalive")
  async keepalive() {
    await this.prisma.$queryRaw`SELECT 1 as alive`;
    return { status: "ok", timestamp: new Date().toISOString(), database: "connected" };
  }
}
