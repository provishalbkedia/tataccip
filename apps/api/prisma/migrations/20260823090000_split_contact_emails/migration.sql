-- AlterTable
ALTER TABLE "MnoMasterConnectivity"
    DROP COLUMN "roamingContactEmail",
    ADD COLUMN "roamingCoordinatorEmail" TEXT,
    ADD COLUMN "ts24x7Email" TEXT,
    ADD COLUMN "distributionEmail" TEXT;
