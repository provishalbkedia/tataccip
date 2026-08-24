-- AlterTable
ALTER TABLE "Ir21Connectivity" ADD COLUMN "isManualOverride" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MnoProviderOverride" (
    "id" TEXT NOT NULL,
    "tadigCode" TEXT NOT NULL,
    "mnoId" INTEGER NOT NULL,
    "serviceName" "ServiceName" NOT NULL,
    "overrideProviderId" INTEGER NOT NULL,
    "originalRawString" TEXT NOT NULL DEFAULT '',
    "reasonNote" TEXT,
    "updatedBy" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MnoProviderOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MnoProviderOverride_mnoId_idx" ON "MnoProviderOverride"("mnoId");

-- CreateIndex
CREATE UNIQUE INDEX "MnoProviderOverride_tadigCode_serviceName_key" ON "MnoProviderOverride"("tadigCode", "serviceName");

-- AddForeignKey
ALTER TABLE "MnoProviderOverride" ADD CONSTRAINT "MnoProviderOverride_mnoId_fkey" FOREIGN KEY ("mnoId") REFERENCES "MnoMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MnoProviderOverride" ADD CONSTRAINT "MnoProviderOverride_overrideProviderId_fkey" FOREIGN KEY ("overrideProviderId") REFERENCES "ProviderMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
