-- CreateTable
CREATE TABLE "PredictiveSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "predictionType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "alertLevel" TEXT NOT NULL,
    "daysToStockout" DOUBLE PRECISION,
    "avgDailyConsumption" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "features" JSONB NOT NULL,
    "modelVersion" TEXT NOT NULL DEFAULT 'v1.0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PredictiveSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PredictiveSnapshot_organizationId_predictionType_entityId_s_idx" ON "PredictiveSnapshot"("organizationId", "predictionType", "entityId", "snapshotDate");

-- CreateIndex
CREATE INDEX "PredictiveSnapshot_organizationId_snapshotDate_idx" ON "PredictiveSnapshot"("organizationId", "snapshotDate");

-- CreateIndex
CREATE INDEX "PredictiveSnapshot_alertLevel_snapshotDate_idx" ON "PredictiveSnapshot"("alertLevel", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "PredictiveSnapshot_organizationId_predictionType_entityId_s_key" ON "PredictiveSnapshot"("organizationId", "predictionType", "entityId", "snapshotDate");
