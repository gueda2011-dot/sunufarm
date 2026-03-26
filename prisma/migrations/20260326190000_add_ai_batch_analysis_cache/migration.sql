-- CreateTable
CREATE TABLE "AIBatchAnalysis" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "accessTier" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "responseJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIBatchAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIBatchAnalysis_organizationId_batchId_createdAt_idx" ON "AIBatchAnalysis"("organizationId", "batchId", "createdAt");

-- CreateIndex
CREATE INDEX "AIBatchAnalysis_createdById_createdAt_idx" ON "AIBatchAnalysis"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "AIBatchAnalysis_organizationId_inputHash_accessTier_idx" ON "AIBatchAnalysis"("organizationId", "inputHash", "accessTier");

-- AddForeignKey
ALTER TABLE "AIBatchAnalysis" ADD CONSTRAINT "AIBatchAnalysis_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIBatchAnalysis" ADD CONSTRAINT "AIBatchAnalysis_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIBatchAnalysis" ADD CONSTRAINT "AIBatchAnalysis_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
