-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ANALYST', 'VIEWER');

-- CreateEnum
CREATE TYPE "ServiceName" AS ENUM ('SCCP', 'DSX', 'IPX');

-- CreateEnum
CREATE TYPE "DiscrepancyType" AS ENUM ('MISSING_IN_REACHLIST', 'MISSING_IN_IR21', 'PROVIDER_MISMATCH');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MnoMaster" (
    "id" SERIAL NOT NULL,
    "operatorName" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "mcc" TEXT NOT NULL,
    "mnc" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "tadigCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MnoMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderMaster" (
    "id" SERIAL NOT NULL,
    "providerName" TEXT NOT NULL,
    "providerType" TEXT,
    "headquarters" TEXT,
    "website" TEXT,

    CONSTRAINT "ProviderMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" SERIAL NOT NULL,
    "serviceName" "ServiceName" NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ir21Connectivity" (
    "id" SERIAL NOT NULL,
    "mnoId" INTEGER NOT NULL,
    "providerId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "remarks" TEXT,

    CONSTRAINT "Ir21Connectivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderReachlist" (
    "id" SERIAL NOT NULL,
    "mnoId" INTEGER NOT NULL,
    "providerId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderReachlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataDiscrepancy" (
    "id" SERIAL NOT NULL,
    "mnoId" INTEGER NOT NULL,
    "providerId" INTEGER,
    "service" "ServiceName" NOT NULL,
    "ir21Status" TEXT NOT NULL,
    "reachlistStatus" TEXT NOT NULL,
    "discrepancyType" "DiscrepancyType" NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataDiscrepancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadHistory" (
    "id" SERIAL NOT NULL,
    "filename" TEXT NOT NULL,
    "uploadTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT NOT NULL,
    "recordsLoaded" INTEGER NOT NULL,
    "status" "UploadStatus" NOT NULL,
    "errorLog" TEXT,

    CONSTRAINT "UploadHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "MnoMaster_tadigCode_key" ON "MnoMaster"("tadigCode");

-- CreateIndex
CREATE INDEX "MnoMaster_operatorName_idx" ON "MnoMaster"("operatorName");

-- CreateIndex
CREATE INDEX "MnoMaster_country_idx" ON "MnoMaster"("country");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderMaster_providerName_key" ON "ProviderMaster"("providerName");

-- CreateIndex
CREATE UNIQUE INDEX "Service_serviceName_key" ON "Service"("serviceName");

-- CreateIndex
CREATE UNIQUE INDEX "Ir21Connectivity_mnoId_serviceId_key" ON "Ir21Connectivity"("mnoId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderReachlist_mnoId_providerId_serviceId_key" ON "ProviderReachlist"("mnoId", "providerId", "serviceId");

-- CreateIndex
CREATE INDEX "DataDiscrepancy_discrepancyType_idx" ON "DataDiscrepancy"("discrepancyType");

-- CreateIndex
CREATE INDEX "DataDiscrepancy_service_idx" ON "DataDiscrepancy"("service");

-- AddForeignKey
ALTER TABLE "Ir21Connectivity" ADD CONSTRAINT "Ir21Connectivity_mnoId_fkey" FOREIGN KEY ("mnoId") REFERENCES "MnoMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ir21Connectivity" ADD CONSTRAINT "Ir21Connectivity_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ir21Connectivity" ADD CONSTRAINT "Ir21Connectivity_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderReachlist" ADD CONSTRAINT "ProviderReachlist_mnoId_fkey" FOREIGN KEY ("mnoId") REFERENCES "MnoMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderReachlist" ADD CONSTRAINT "ProviderReachlist_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderReachlist" ADD CONSTRAINT "ProviderReachlist_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataDiscrepancy" ADD CONSTRAINT "DataDiscrepancy_mnoId_fkey" FOREIGN KEY ("mnoId") REFERENCES "MnoMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataDiscrepancy" ADD CONSTRAINT "DataDiscrepancy_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
