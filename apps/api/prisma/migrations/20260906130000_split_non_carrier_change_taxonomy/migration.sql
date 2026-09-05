-- AlterEnum
-- Renamed (not a new value) so pre-existing ADMIN_UPDATE rows transparently
-- read as ADMIN_NAME_UPDATE afterward -- Postgres RENAME VALUE repoints the
-- label on the same underlying OID, no data migration needed for this one.
ALTER TYPE "RoutingChangeType" RENAME VALUE 'ADMIN_UPDATE' TO 'ADMIN_NAME_UPDATE';

-- New non-carrier technical categories, splitting what was previously the
-- single CONFIG_UPDATE bucket. CONFIG_UPDATE itself is intentionally left in
-- the enum (Postgres has no DROP VALUE) -- existing rows are reclassified
-- into one of these three by the follow-up data migration, not by altering
-- this type further.
ALTER TYPE "RoutingChangeType" ADD VALUE 'IP_SUBNET_UPDATE';
ALTER TYPE "RoutingChangeType" ADD VALUE 'DIAMETER_REALM_UPDATE';
ALTER TYPE "RoutingChangeType" ADD VALUE 'POINT_CODE_GT_UPDATE';

-- AlterTable
ALTER TABLE "Ir21RoutingChange" ADD COLUMN "matchedRule" TEXT;
