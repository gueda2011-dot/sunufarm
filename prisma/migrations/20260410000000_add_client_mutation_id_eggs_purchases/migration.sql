-- AlterTable
ALTER TABLE "EggProductionRecord" ADD COLUMN "clientMutationId" TEXT;
CREATE UNIQUE INDEX "EggProductionRecord_clientMutationId_key" ON "EggProductionRecord"("clientMutationId");

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN "clientMutationId" TEXT;
CREATE UNIQUE INDEX "Purchase_clientMutationId_key" ON "Purchase"("clientMutationId");
