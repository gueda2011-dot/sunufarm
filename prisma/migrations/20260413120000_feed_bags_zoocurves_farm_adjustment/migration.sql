-- Migration: feed_bags_zoocurves_farm_adjustment
-- Phase 1 de la refonte de la logique alimentaire SunuFarm
--
-- Objectif : introduire la saisie alimentaire en sacs, les courbes zootechniques
-- de référence et le profil d'ajustement ferme progressif.
--
-- Règles :
--   - Toutes les modifications sont ADDITIVES (nouveaux champs nullable ou avec défaut)
--   - Aucun ALTER COLUMN sur des champs existants
--   - Les données existantes ne sont pas affectées
--   - DailyRecord.dataSource = 'MANUAL_KG' par défaut → compatibilité totale

-- =============================================================================
-- 1. NOUVEAUX ENUMS
-- =============================================================================

CREATE TYPE "FeedDataSource" AS ENUM (
  'MANUAL_KG',
  'ESTIMATED_FROM_BAG',
  'ADVANCED_SACS_PER_DAY'
);

CREATE TYPE "ConfidenceLevel" AS ENUM (
  'HIGH',
  'MEDIUM',
  'LOW'
);

CREATE TYPE "FeedEstimationMethod" AS ENUM (
  'LINEAR',
  'CURVE_WEIGHTED'
);

CREATE TYPE "ZootechnicalSourceType" AS ENUM (
  'GENETIC_OFFICIAL',
  'SENEGAL_ADJUSTED',
  'FARM_DERIVED'
);

CREATE TYPE "CurveGranularity" AS ENUM (
  'DAILY',
  'WEEKLY_INTERPOLATED'
);

CREATE TYPE "InterpolationMethod" AS ENUM (
  'LINEAR',
  'CUBIC_SPLINE'
);

CREATE TYPE "CurveQualityLevel" AS ENUM (
  'HIGH',
  'MEDIUM',
  'LOW',
  'ESTIMATED'
);

CREATE TYPE "FarmAdjustmentStatus" AS ENUM (
  'OBSERVING',
  'SUGGESTED',
  'ACTIVE'
);

-- =============================================================================
-- 2. NOUVELLE TABLE : FeedBagEvent
-- =============================================================================

CREATE TABLE "FeedBagEvent" (
  "id"               TEXT NOT NULL,
  "organizationId"   TEXT NOT NULL,
  "batchId"          TEXT NOT NULL,
  "feedStockId"      TEXT,
  "clientMutationId" TEXT,
  "bagWeightKg"      DOUBLE PRECISION NOT NULL,
  "startDate"        DATE NOT NULL,
  "endDate"          DATE,
  "startAgeDay"      INTEGER NOT NULL,
  "endAgeDay"        INTEGER,
  "estimationMethod" "FeedEstimationMethod" NOT NULL DEFAULT 'CURVE_WEIGHTED',
  "curveVersion"     TEXT,
  "notes"            TEXT,
  "recordedById"     TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FeedBagEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeedBagEvent_clientMutationId_key" ON "FeedBagEvent"("clientMutationId");
CREATE INDEX "FeedBagEvent_batchId_idx" ON "FeedBagEvent"("batchId");
CREATE INDEX "FeedBagEvent_organizationId_idx" ON "FeedBagEvent"("organizationId");
CREATE INDEX "FeedBagEvent_startDate_idx" ON "FeedBagEvent"("startDate");

ALTER TABLE "FeedBagEvent"
  ADD CONSTRAINT "FeedBagEvent_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FeedBagEvent"
  ADD CONSTRAINT "FeedBagEvent_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FeedBagEvent"
  ADD CONSTRAINT "FeedBagEvent_feedStockId_fkey"
    FOREIGN KEY ("feedStockId") REFERENCES "FeedStock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- 3. NOUVELLE TABLE : ZootechnicalCurvePoint
-- =============================================================================

CREATE TABLE "ZootechnicalCurvePoint" (
  "id"                  TEXT NOT NULL,
  "breedCode"           TEXT NOT NULL,
  "batchType"           "BatchType" NOT NULL,
  "ageDay"              INTEGER NOT NULL,
  "dailyFeedGPerBird"   DOUBLE PRECISION,
  "cumulativeFeedG"     DOUBLE PRECISION,
  "bodyWeightG"         DOUBLE PRECISION,
  "layingRatePct"       DOUBLE PRECISION,
  "eggMassGPerBird"     DOUBLE PRECISION,
  "feedPerEggG"         DOUBLE PRECISION,
  "version"             TEXT NOT NULL,
  "sourceType"          "ZootechnicalSourceType" NOT NULL,
  "sourceLabel"         TEXT NOT NULL,
  "sourceUrl"           TEXT,
  "granularity"         "CurveGranularity" NOT NULL,
  "interpolationMethod" "InterpolationMethod",
  "qualityLevel"        "CurveQualityLevel" NOT NULL,
  "notes"               TEXT,
  "isActive"            BOOLEAN NOT NULL DEFAULT true,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ZootechnicalCurvePoint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ZootechnicalCurvePoint_breedCode_batchType_ageDay_version_key"
  ON "ZootechnicalCurvePoint"("breedCode", "batchType", "ageDay", "version");

CREATE INDEX "ZootechnicalCurvePoint_breedCode_batchType_isActive_idx"
  ON "ZootechnicalCurvePoint"("breedCode", "batchType", "isActive");

CREATE INDEX "ZootechnicalCurvePoint_batchType_ageDay_idx"
  ON "ZootechnicalCurvePoint"("batchType", "ageDay");

-- =============================================================================
-- 4. NOUVELLE TABLE : FarmAdjustmentProfile
-- =============================================================================

CREATE TABLE "FarmAdjustmentProfile" (
  "id"                      TEXT NOT NULL,
  "organizationId"          TEXT NOT NULL,
  "farmId"                  TEXT NOT NULL,
  "status"                  "FarmAdjustmentStatus" NOT NULL DEFAULT 'OBSERVING',
  "weightFactor"            DOUBLE PRECISION,
  "feedFactor"              DOUBLE PRECISION,
  "fcrFactor"               DOUBLE PRECISION,
  "layingFactor"            DOUBLE PRECISION,
  "basedOnBatchCount"       INTEGER NOT NULL DEFAULT 0,
  "basedOnPeriodMonths"     INTEGER,
  "minBatchesForSuggestion" INTEGER NOT NULL DEFAULT 3,
  "calculatedAt"            TIMESTAMP(3),
  "validatedAt"             TIMESTAMP(3),
  "validatedByUserId"       TEXT,
  "notes"                   TEXT,
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FarmAdjustmentProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FarmAdjustmentProfile_farmId_key" ON "FarmAdjustmentProfile"("farmId");
CREATE INDEX "FarmAdjustmentProfile_organizationId_idx" ON "FarmAdjustmentProfile"("organizationId");

ALTER TABLE "FarmAdjustmentProfile"
  ADD CONSTRAINT "FarmAdjustmentProfile_farmId_fkey"
    FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FarmAdjustmentProfile"
  ADD CONSTRAINT "FarmAdjustmentProfile_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- 5. EXTENSION ADDITIVES — DailyRecord
-- =============================================================================

-- Source de la donnée alimentaire (MANUAL_KG = mode existant, défaut pour compatibilité)
ALTER TABLE "DailyRecord"
  ADD COLUMN "dataSource" "FeedDataSource" NOT NULL DEFAULT 'MANUAL_KG';

-- Lien vers le sac d'aliment source (null si saisie manuelle)
ALTER TABLE "DailyRecord"
  ADD COLUMN "feedBagEventId" TEXT;

-- Niveau de confiance de l'estimation (null si MANUAL_KG)
ALTER TABLE "DailyRecord"
  ADD COLUMN "estimationConfidence" "ConfidenceLevel";

ALTER TABLE "DailyRecord"
  ADD CONSTRAINT "DailyRecord_feedBagEventId_fkey"
    FOREIGN KEY ("feedBagEventId") REFERENCES "FeedBagEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- 6. EXTENSIONS ADDITIVES — Farm
-- =============================================================================

-- Profil Sénégal associé à la ferme (null → STANDARD_LOCAL par défaut)
ALTER TABLE "Farm"
  ADD COLUMN "senegalProfileCode" TEXT;

-- =============================================================================
-- 7. EXTENSIONS ADDITIVES — Batch
-- =============================================================================

-- Override de profil Sénégal au niveau lot (null → hérite de la ferme)
ALTER TABLE "Batch"
  ADD COLUMN "senegalProfileOverride" TEXT;
