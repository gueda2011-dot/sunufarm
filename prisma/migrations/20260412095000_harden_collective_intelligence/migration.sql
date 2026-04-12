-- Migration: harden_collective_intelligence
-- Ajoute un drapeau de partage organisationnel et une empreinte anonyme
-- stable pour dedupliquer les snapshots de lots.

ALTER TABLE "Organization"
ADD COLUMN "collectiveIntelligenceSharingEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "BatchOutcomeSnapshot"
ADD COLUMN "sourceFingerprint" TEXT;

UPDATE "BatchOutcomeSnapshot"
SET "sourceFingerprint" = "id"
WHERE "sourceFingerprint" IS NULL;

ALTER TABLE "BatchOutcomeSnapshot"
ALTER COLUMN "sourceFingerprint" SET NOT NULL;

CREATE UNIQUE INDEX "BatchOutcomeSnapshot_sourceFingerprint_key"
ON "BatchOutcomeSnapshot"("sourceFingerprint");
