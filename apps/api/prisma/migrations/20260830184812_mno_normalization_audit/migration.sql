-- CreateEnum
CREATE TYPE "MnoMatchStatus" AS ENUM ('EXACT_TADIG', 'ALIAS_MATCHED', 'PENDING_REVIEW', 'MANUALLY_OVERRIDDEN');

-- CreateTable
CREATE TABLE "MnoNormalizationAudit" (
    "id" TEXT NOT NULL,
    "rawOperatorName" TEXT NOT NULL DEFAULT '',
    "rawTadigCode" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "providerId" INTEGER NOT NULL,
    "affectedServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "affectedFiles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "matchStatus" "MnoMatchStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "canonicalMnoId" INTEGER,
    "reasonNote" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MnoNormalizationAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MnoNormalizationAudit_matchStatus_idx" ON "MnoNormalizationAudit"("matchStatus");

-- CreateIndex
CREATE UNIQUE INDEX "MnoNormalizationAudit_providerId_rawTadigCode_rawOperatorNa_key" ON "MnoNormalizationAudit"("providerId", "rawTadigCode", "rawOperatorName");

-- AddForeignKey
ALTER TABLE "MnoNormalizationAudit" ADD CONSTRAINT "MnoNormalizationAudit_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MnoNormalizationAudit" ADD CONSTRAINT "MnoNormalizationAudit_canonicalMnoId_fkey" FOREIGN KEY ("canonicalMnoId") REFERENCES "MnoMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
