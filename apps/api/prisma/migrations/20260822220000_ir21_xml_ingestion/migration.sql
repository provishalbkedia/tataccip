-- CreateEnum
CREATE TYPE "VariantStatus" AS ENUM ('PENDING', 'RESOLVED', 'IGNORED');

-- CreateTable
CREATE TABLE "ProviderAlias" (
    "id" TEXT NOT NULL,
    "providerId" INTEGER NOT NULL,
    "aliasPattern" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnmappedProviderVariant" (
    "id" TEXT NOT NULL,
    "rawCarrierName" TEXT NOT NULL,
    "normalizedPattern" TEXT NOT NULL,
    "detectedService" "ServiceName" NOT NULL,
    "affectedTadigs" TEXT[],
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "status" "VariantStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedProviderId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnmappedProviderVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MnoMasterConnectivity" (
    "id" TEXT NOT NULL,
    "mnoId" INTEGER NOT NULL,
    "tadigCode" TEXT NOT NULL,
    "operatorName" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "networkType" TEXT,
    "mccMncList" TEXT[],
    "primarySccpCarrier" TEXT,
    "backupSccpCarriers" TEXT[],
    "sccpPointCodes" TEXT[],
    "grxIpxProviders" TEXT[],
    "lteIpxProviders" TEXT[],
    "interPmnIpRanges" TEXT[],
    "diameterEdgeAgentFqdn" TEXT,
    "authoritativeDnsIps" TEXT[],
    "epcRealms" TEXT[],
    "roamingContactEmail" TEXT,
    "xmlFileVersion" TEXT,
    "lastEffectiveDate" TIMESTAMP(3),
    "lastParsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MnoMasterConnectivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderAlias_aliasPattern_key" ON "ProviderAlias"("aliasPattern");

-- CreateIndex
CREATE INDEX "ProviderAlias_providerId_idx" ON "ProviderAlias"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "UnmappedProviderVariant_normalizedPattern_key" ON "UnmappedProviderVariant"("normalizedPattern");

-- CreateIndex
CREATE INDEX "UnmappedProviderVariant_status_idx" ON "UnmappedProviderVariant"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MnoMasterConnectivity_mnoId_key" ON "MnoMasterConnectivity"("mnoId");

-- CreateIndex
CREATE UNIQUE INDEX "MnoMasterConnectivity_tadigCode_key" ON "MnoMasterConnectivity"("tadigCode");

-- AddForeignKey
ALTER TABLE "ProviderAlias" ADD CONSTRAINT "ProviderAlias_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnmappedProviderVariant" ADD CONSTRAINT "UnmappedProviderVariant_resolvedProviderId_fkey" FOREIGN KEY ("resolvedProviderId") REFERENCES "ProviderMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MnoMasterConnectivity" ADD CONSTRAINT "MnoMasterConnectivity_mnoId_fkey" FOREIGN KEY ("mnoId") REFERENCES "MnoMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
