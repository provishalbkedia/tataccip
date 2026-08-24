-- AlterTable
ALTER TABLE "MnoMasterConnectivity"
    ADD COLUMN "pdfFileName" TEXT,
    ADD COLUMN "pdfStoragePath" TEXT,
    ADD COLUMN "pdfFileSize" INTEGER,
    ADD COLUMN "hasPdfDocument" BOOLEAN NOT NULL DEFAULT false;
