ALTER TABLE "UserOrganization"
ADD COLUMN "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Batch_organizationId_status_deletedAt_idx"
ON "Batch"("organizationId", "status", "deletedAt");

CREATE INDEX "Batch_organizationId_entryDate_idx"
ON "Batch"("organizationId", "entryDate");

CREATE INDEX "DailyRecord_organizationId_date_idx"
ON "DailyRecord"("organizationId", "date");

CREATE INDEX "Sale_organizationId_saleDate_idx"
ON "Sale"("organizationId", "saleDate");

CREATE INDEX "Sale_organizationId_customerId_saleDate_idx"
ON "Sale"("organizationId", "customerId", "saleDate");

CREATE INDEX "Purchase_purchaseDate_idx"
ON "Purchase"("purchaseDate");

CREATE INDEX "Purchase_organizationId_purchaseDate_idx"
ON "Purchase"("organizationId", "purchaseDate");

CREATE INDEX "Purchase_organizationId_supplierId_purchaseDate_idx"
ON "Purchase"("organizationId", "supplierId", "purchaseDate");

CREATE INDEX "Expense_organizationId_date_idx"
ON "Expense"("organizationId", "date");

CREATE INDEX "Expense_organizationId_batchId_date_idx"
ON "Expense"("organizationId", "batchId", "date");

CREATE INDEX "Expense_organizationId_farmId_date_idx"
ON "Expense"("organizationId", "farmId", "date");

CREATE INDEX "Expense_organizationId_categoryId_date_idx"
ON "Expense"("organizationId", "categoryId", "date");

CREATE INDEX "Notification_userId_organizationId_status_createdAt_idx"
ON "Notification"("userId", "organizationId", "status", "createdAt");
