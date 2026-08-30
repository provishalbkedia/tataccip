-- Convert asNumber (single value, wrong -- an MNO can declare more than
-- one AS Number) to asNumbers (array), preserving existing single values
-- as one-element arrays rather than dropping them.
ALTER TABLE "MnoMasterConnectivity" ADD COLUMN "asNumbers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "MnoMasterConnectivity" SET "asNumbers" = ARRAY["asNumber"] WHERE "asNumber" IS NOT NULL;

ALTER TABLE "MnoMasterConnectivity" DROP COLUMN "asNumber";
