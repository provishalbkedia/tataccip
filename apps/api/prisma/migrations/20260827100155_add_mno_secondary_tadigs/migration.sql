-- DropForeignKey
ALTER TABLE "MnoProviderOverride" DROP CONSTRAINT "MnoProviderOverride_mnoId_fkey";

-- AlterTable
ALTER TABLE "MnoMaster" ADD COLUMN     "secondaryTadigs" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AddForeignKey
ALTER TABLE "MnoProviderOverride" ADD CONSTRAINT "MnoProviderOverride_mnoId_fkey" FOREIGN KEY ("mnoId") REFERENCES "MnoMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
