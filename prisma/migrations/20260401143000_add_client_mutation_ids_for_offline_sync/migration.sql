ALTER TABLE "DailyRecord"
ADD COLUMN "clientMutationId" TEXT;

ALTER TABLE "VaccinationRecord"
ADD COLUMN "clientMutationId" TEXT;

ALTER TABLE "TreatmentRecord"
ADD COLUMN "clientMutationId" TEXT;

ALTER TABLE "Sale"
ADD COLUMN "clientMutationId" TEXT;

ALTER TABLE "Expense"
ADD COLUMN "clientMutationId" TEXT;

ALTER TABLE "FeedMovement"
ADD COLUMN "clientMutationId" TEXT;

ALTER TABLE "MedicineMovement"
ADD COLUMN "clientMutationId" TEXT;

CREATE UNIQUE INDEX "DailyRecord_organizationId_clientMutationId_key"
ON "DailyRecord"("organizationId", "clientMutationId");

CREATE UNIQUE INDEX "VaccinationRecord_organizationId_clientMutationId_key"
ON "VaccinationRecord"("organizationId", "clientMutationId");

CREATE UNIQUE INDEX "TreatmentRecord_organizationId_clientMutationId_key"
ON "TreatmentRecord"("organizationId", "clientMutationId");

CREATE UNIQUE INDEX "Sale_organizationId_clientMutationId_key"
ON "Sale"("organizationId", "clientMutationId");

CREATE UNIQUE INDEX "Expense_organizationId_clientMutationId_key"
ON "Expense"("organizationId", "clientMutationId");

CREATE UNIQUE INDEX "FeedMovement_organizationId_clientMutationId_key"
ON "FeedMovement"("organizationId", "clientMutationId");

CREATE UNIQUE INDEX "MedicineMovement_organizationId_clientMutationId_key"
ON "MedicineMovement"("organizationId", "clientMutationId");
