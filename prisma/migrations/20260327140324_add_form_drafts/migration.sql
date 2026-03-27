-- CreateTable
CREATE TABLE "FormDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "formKey" TEXT NOT NULL,
    "title" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FormDraft_organizationId_updatedAt_idx" ON "FormDraft"("organizationId", "updatedAt");

-- CreateIndex
CREATE INDEX "FormDraft_userId_updatedAt_idx" ON "FormDraft"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FormDraft_userId_formKey_key" ON "FormDraft"("userId", "formKey");

-- AddForeignKey
ALTER TABLE "FormDraft" ADD CONSTRAINT "FormDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormDraft" ADD CONSTRAINT "FormDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
