-- AlterTable
ALTER TABLE "UploadHistory"
    ADD COLUMN "isCurrentActive" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "mnoCount" INTEGER;
