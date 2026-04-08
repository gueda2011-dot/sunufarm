-- Migration: add_collective_intelligence_models
-- SunuFarm — Intelligence Collective Phase A
-- 3 nouveaux modèles : BatchOutcomeSnapshot, LearnedPattern, RecommendationFeedback

-- ============================================================
-- BatchOutcomeSnapshot : snapshots anonymisés des lots fermés
-- PAS d'organizationId — données strictement anonymisées
-- ============================================================

CREATE TABLE "BatchOutcomeSnapshot" (
    "id"                    TEXT NOT NULL,
    "batchType"             TEXT NOT NULL,
    "breedCode"             TEXT,
    "regionCode"            TEXT,
    "buildingType"          TEXT NOT NULL,
    "entryCount"            INTEGER NOT NULL,
    "durationDays"          INTEGER NOT NULL,
    "entryMonth"            INTEGER NOT NULL,
    "entryYear"             INTEGER NOT NULL,
    "finalMortalityRatePct" DOUBLE PRECISION NOT NULL,
    "finalFCR"              DOUBLE PRECISION,
    "finalMarginRatePct"    DOUBLE PRECISION,
    "avgSalePricePerKgFcfa" INTEGER,
    "avgTemperatureMax"     DOUBLE PRECISION,
    "avgHumidity"           DOUBLE PRECISION,
    "heatStressDays"        INTEGER,
    "coldStressDays"        INTEGER,
    "treatmentCount"        INTEGER NOT NULL DEFAULT 0,
    "majorMortalityDays"    INTEGER NOT NULL DEFAULT 0,
    "overdueVaccineDays"    INTEGER NOT NULL DEFAULT 0,
    "vaccinationCompleted"  BOOLEAN NOT NULL DEFAULT false,
    "totalFeedKg"           DOUBLE PRECISION,
    "feedKgPerBird"         DOUBLE PRECISION,
    "avgFinalWeightG"       INTEGER,
    "dataVersion"           INTEGER NOT NULL DEFAULT 1,
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchOutcomeSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BatchOutcomeSnapshot_batchType_breedCode_regionCode_idx"
    ON "BatchOutcomeSnapshot"("batchType", "breedCode", "regionCode");

CREATE INDEX "BatchOutcomeSnapshot_entryMonth_batchType_idx"
    ON "BatchOutcomeSnapshot"("entryMonth", "batchType");

CREATE INDEX "BatchOutcomeSnapshot_entryYear_batchType_idx"
    ON "BatchOutcomeSnapshot"("entryYear", "batchType");

CREATE INDEX "BatchOutcomeSnapshot_createdAt_idx"
    ON "BatchOutcomeSnapshot"("createdAt");

CREATE INDEX "BatchOutcomeSnapshot_regionCode_batchType_idx"
    ON "BatchOutcomeSnapshot"("regionCode", "batchType");

-- ============================================================
-- LearnedPattern : patterns appris depuis le pool collectif
-- ============================================================

CREATE TABLE "LearnedPattern" (
    "id"            TEXT NOT NULL,
    "patternType"   TEXT NOT NULL,
    "scope"         TEXT NOT NULL,
    "condition"     JSONB NOT NULL,
    "outcome"       JSONB NOT NULL,
    "confidence"    DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "sampleSize"    INTEGER NOT NULL DEFAULT 0,
    "positiveCount" INTEGER NOT NULL DEFAULT 0,
    "negativeCount" INTEGER NOT NULL DEFAULT 0,
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "lastUpdated"   TIMESTAMP(3) NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearnedPattern_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LearnedPattern_patternType_isActive_idx"
    ON "LearnedPattern"("patternType", "isActive");

CREATE INDEX "LearnedPattern_scope_isActive_idx"
    ON "LearnedPattern"("scope", "isActive");

CREATE INDEX "LearnedPattern_confidence_sampleSize_idx"
    ON "LearnedPattern"("confidence", "sampleSize");

-- ============================================================
-- RecommendationFeedback : boucle de feedback terrain
-- ============================================================

CREATE TABLE "RecommendationFeedback" (
    "id"               TEXT NOT NULL,
    "organizationId"   TEXT NOT NULL,
    "batchId"          TEXT NOT NULL,
    "patternType"      TEXT NOT NULL,
    "recommendationId" TEXT,
    "followed"         BOOLEAN,
    "followedAt"       TIMESTAMP(3),
    "outcomeTag"       TEXT,
    "outcomeNotes"     TEXT,
    "observedAt"       TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecommendationFeedback_organizationId_batchId_idx"
    ON "RecommendationFeedback"("organizationId", "batchId");

CREATE INDEX "RecommendationFeedback_patternType_idx"
    ON "RecommendationFeedback"("patternType");

CREATE INDEX "RecommendationFeedback_followed_outcomeTag_idx"
    ON "RecommendationFeedback"("followed", "outcomeTag");
