-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('NONE', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "PoultryProductionType" AS ENUM ('BROILER', 'LAYER', 'LOCAL', 'DUAL');

-- CreateEnum
CREATE TYPE "PoultrySpecies" AS ENUM ('CHICKEN', 'GUINEA_FOWL');

-- CreateEnum
CREATE TYPE "VaccinationPlanTemplateProductionType" AS ENUM ('BROILER', 'LAYER');

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "actorUserId" TEXT,
ADD COLUMN     "effectiveUserId" TEXT,
ADD COLUMN     "impersonationSessionId" TEXT;

-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "poultryStrainId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "platformRole" "PlatformRole" NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "PoultryStrain" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productionType" "PoultryProductionType" NOT NULL,
    "species" "PoultrySpecies" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoultryStrain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminImpersonationSession" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "targetOrganizationId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminImpersonationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaccinationPlanTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productionType" "VaccinationPlanTemplateProductionType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaccinationPlanTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaccinationPlanTemplateItem" (
    "id" TEXT NOT NULL,
    "planTemplateId" TEXT NOT NULL,
    "dayOfAge" INTEGER NOT NULL,
    "vaccineName" TEXT NOT NULL,
    "disease" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaccinationPlanTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PoultryStrain_name_key" ON "PoultryStrain"("name");

-- CreateIndex
CREATE INDEX "AdminImpersonationSession_adminUserId_endedAt_idx" ON "AdminImpersonationSession"("adminUserId", "endedAt");

-- CreateIndex
CREATE INDEX "AdminImpersonationSession_targetUserId_endedAt_idx" ON "AdminImpersonationSession"("targetUserId", "endedAt");

-- CreateIndex
CREATE INDEX "AdminImpersonationSession_targetOrganizationId_idx" ON "AdminImpersonationSession"("targetOrganizationId");

-- CreateIndex
CREATE UNIQUE INDEX "VaccinationPlanTemplate_name_key" ON "VaccinationPlanTemplate"("name");

-- CreateIndex
CREATE INDEX "VaccinationPlanTemplateItem_planTemplateId_idx" ON "VaccinationPlanTemplateItem"("planTemplateId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_effectiveUserId_idx" ON "AuditLog"("effectiveUserId");

-- CreateIndex
CREATE INDEX "AuditLog_impersonationSessionId_idx" ON "AuditLog"("impersonationSessionId");

-- CreateIndex
CREATE INDEX "Batch_poultryStrainId_idx" ON "Batch"("poultryStrainId");

-- AddForeignKey
ALTER TABLE "AdminImpersonationSession" ADD CONSTRAINT "AdminImpersonationSession_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminImpersonationSession" ADD CONSTRAINT "AdminImpersonationSession_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminImpersonationSession" ADD CONSTRAINT "AdminImpersonationSession_targetOrganizationId_fkey" FOREIGN KEY ("targetOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_poultryStrainId_fkey" FOREIGN KEY ("poultryStrainId") REFERENCES "PoultryStrain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaccinationPlanTemplateItem" ADD CONSTRAINT "VaccinationPlanTemplateItem_planTemplateId_fkey" FOREIGN KEY ("planTemplateId") REFERENCES "VaccinationPlanTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
