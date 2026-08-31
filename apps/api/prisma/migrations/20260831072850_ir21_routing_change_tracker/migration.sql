-- CreateEnum
CREATE TYPE "RoutingChangeType" AS ENUM ('ADDED', 'REMOVED', 'REPLACED');

-- AlterTable
ALTER TABLE "MnoMasterConnectivity" ALTER COLUMN "mnoAsNumbers" DROP DEFAULT,
ALTER COLUMN "providerAsNumbers" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Ir21RoutingChange" (
    "id" TEXT NOT NULL,
    "mnoId" INTEGER NOT NULL,
    "tadigCode" TEXT NOT NULL,
    "mnoName" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "serviceName" "ServiceName" NOT NULL,
    "changeType" "RoutingChangeType" NOT NULL,
    "oldProviderId" INTEGER,
    "oldProviderName" TEXT,
    "newProviderId" INTEGER,
    "newProviderName" TEXT,
    "sourceFile" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ir21RoutingChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ir21RoutingChange_mnoId_idx" ON "Ir21RoutingChange"("mnoId");

-- CreateIndex
CREATE INDEX "Ir21RoutingChange_serviceName_idx" ON "Ir21RoutingChange"("serviceName");

-- CreateIndex
CREATE INDEX "Ir21RoutingChange_changeType_idx" ON "Ir21RoutingChange"("changeType");

-- CreateIndex
CREATE INDEX "Ir21RoutingChange_effectiveDate_idx" ON "Ir21RoutingChange"("effectiveDate");

-- AddForeignKey
ALTER TABLE "Ir21RoutingChange" ADD CONSTRAINT "Ir21RoutingChange_mnoId_fkey" FOREIGN KEY ("mnoId") REFERENCES "MnoMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ir21RoutingChange" ADD CONSTRAINT "Ir21RoutingChange_oldProviderId_fkey" FOREIGN KEY ("oldProviderId") REFERENCES "ProviderMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ir21RoutingChange" ADD CONSTRAINT "Ir21RoutingChange_newProviderId_fkey" FOREIGN KEY ("newProviderId") REFERENCES "ProviderMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
