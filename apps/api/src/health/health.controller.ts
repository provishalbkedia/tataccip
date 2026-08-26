import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("health")
@Controller("health")
export class HealthController {
  // Deliberately unauthenticated and dependency-free (no DB call) — the
  // frontend's "Refresh / Warm-up" button and its on-load ping hit this to
  // wake an idle Cloud Run instance as fast as possible, not to check DB
  // connectivity.
  @Get()
  ping() {
    return { status: "ok", timestamp: new Date().toISOString() };
  }
}
