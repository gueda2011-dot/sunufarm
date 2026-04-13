-- Migration : Enrichissement BatchOutcomeSnapshot pour Phase 4
-- Ajout de champs de traçabilité zootechnique et qualité données ML
-- Tous les champs sont nullable → migration non-destructive, rétro-compatible

-- Traçabilité du référentiel utilisé lors du snapshot
ALTER TABLE "BatchOutcomeSnapshot" ADD COLUMN "curveVersion" TEXT;
ALTER TABLE "BatchOutcomeSnapshot" ADD COLUMN "senegalProfileUsed" TEXT;
ALTER TABLE "BatchOutcomeSnapshot" ADD COLUMN "farmAdjustmentStatus" TEXT;

-- Qualité des données d'entrée J1–J14 (features pour le modèle ML)
ALTER TABLE "BatchOutcomeSnapshot" ADD COLUMN "pctEstimatedJ14" DOUBLE PRECISION;
ALTER TABLE "BatchOutcomeSnapshot" ADD COLUMN "avgConfidenceJ14" DOUBLE PRECISION;
