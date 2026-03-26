-- AlterTable
ALTER TABLE "Subscription"
ADD COLUMN "trialEndsAt" TIMESTAMP(3),
ADD COLUMN "aiCreditsTotal" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "aiCreditsUsed" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Subscription_trialEndsAt_idx" ON "Subscription"("trialEndsAt");
