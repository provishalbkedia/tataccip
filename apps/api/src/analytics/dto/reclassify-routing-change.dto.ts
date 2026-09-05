import { IsBoolean, IsIn, IsOptional } from "class-validator";
import { RoutingChangeType } from "@ccip/shared-types";

const ROUTING_CHANGE_TYPES = Object.values(RoutingChangeType);

export class ReclassifyRoutingChangeDto {
  @IsIn(ROUTING_CHANGE_TYPES)
  changeType!: RoutingChangeType;

  // Lets an admin also correct a wrong onboarding flag either direction --
  // e.g. a bulk-load ADDED row an admin knows was genuinely a new carrier
  // win (isInitialOnboarding: false), or the reverse. Omitted = left as-is.
  @IsOptional()
  @IsBoolean()
  isInitialOnboarding?: boolean;
}
