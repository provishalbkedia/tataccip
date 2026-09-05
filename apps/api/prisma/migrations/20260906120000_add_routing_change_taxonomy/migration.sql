-- AlterEnum
ALTER TYPE "RoutingChangeType" ADD VALUE 'CONFIG_UPDATE';
ALTER TYPE "RoutingChangeType" ADD VALUE 'ADMIN_UPDATE';

-- CreateEnum
CREATE TYPE "ChangeSource" AS ENUM ('LIVE_DIFF', 'CHANGE_HISTORY');

-- AlterTable
ALTER TABLE "Ir21RoutingChange"
ADD COLUMN "description" TEXT,
ADD COLUMN "changeSource" "ChangeSource" NOT NULL DEFAULT 'LIVE_DIFF',
ADD COLUMN "isInitialOnboarding" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isManuallyReviewed" BOOLEAN NOT NULL DEFAULT false;
