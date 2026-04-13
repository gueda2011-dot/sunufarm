import { KPI_THRESHOLDS } from "@/src/constants/kpi-thresholds"
import { BatchType } from "@/src/generated/prisma/client"
import type { AlertLevel } from "@/src/lib/kpi"
import type { BatchMortalityFeatures } from "@/src/lib/predictive-mortality-features"

export interface BatchMortalityPrediction {
  batchId: string
  riskScore: number
  alertLevel: AlertLevel
  label: string
  summary: string
  reasons: string[]
  metrics: {
    recentMortality: number
    previousMortality: number
    recentMortalityRatePct: number
    previousMortalityRatePct: number
    recentAverageDailyMortalityRatePct: number
    missingDailyRecords: number
    activeTreatments: number
    overdueVaccines: number
    dueVaccines: number
  }
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function labelFromAlertLevel(alertLevel: AlertLevel): string {
  switch (alertLevel) {
    case "critical":
      return "Risque mortalite eleve"
    case "warning":
      return "Risque mortalite a surveiller"
    default:
      return "Risque mortalite faible"
  }
}

function getAlertLevel(score: number): AlertLevel {
  if (score >= 60) return "critical"
  if (score >= 30) return "warning"
  return "ok"
}

function getMortalityThresholds(batchType: BatchType) {
  if (batchType === BatchType.PONDEUSE) {
    return {
      warning: KPI_THRESHOLDS.MORTALITY_DAILY_WARNING_RATE_LAYER,
      critical: KPI_THRESHOLDS.MORTALITY_DAILY_CRITICAL_RATE_LAYER,
    }
  }

  return {
    warning: KPI_THRESHOLDS.MORTALITY_DAILY_WARNING_RATE_BROILER,
    critical: KPI_THRESHOLDS.MORTALITY_DAILY_CRITICAL_RATE_BROILER,
  }
}

export function predictBatchMortalityRisk(
  features: BatchMortalityFeatures,
): BatchMortalityPrediction {
  if (features.ageDay < KPI_THRESHOLDS.PERFORMANCE_VERDICT_MIN_AGE_DAYS) {
    return {
      batchId: features.batchId,
      riskScore: 0,
      alertLevel: "ok",
      label: "Observation initiale",
      summary: `Lecture sanitaire en construction avant J${KPI_THRESHOLDS.PERFORMANCE_VERDICT_MIN_AGE_DAYS}.`,
      reasons: [],
      metrics: {
        recentMortality: features.recentMortality,
        previousMortality: features.previousMortality,
        recentMortalityRatePct: round(features.recentMortalityRate * 100),
        previousMortalityRatePct: round(features.previousMortalityRate * 100),
        recentAverageDailyMortalityRatePct: round(features.recentAverageDailyMortalityRate * 100),
        missingDailyRecords: features.missingDailyRecords,
        activeTreatments: features.activeTreatments,
        overdueVaccines: features.overdueVaccines,
        dueVaccines: features.dueVaccines,
      },
    }
  }

  let riskScore = 0
  const reasons: string[] = []
  const thresholds = getMortalityThresholds(features.batchType)

  if (features.recentAverageDailyMortalityRate >= thresholds.critical) {
    riskScore += 40
    reasons.push(`mortalite moyenne recente elevee (${round(features.recentAverageDailyMortalityRate * 100)}%/jour)`)
  } else if (features.recentAverageDailyMortalityRate >= thresholds.warning) {
    riskScore += 25
    reasons.push(`mortalite recente a surveiller (${round(features.recentAverageDailyMortalityRate * 100)}%/jour)`)
  }

  if (features.mortalityAcceleration >= 0.01) {
    riskScore += 15
    reasons.push("mortalite en hausse sur la seconde periode")
  } else if (features.mortalityAcceleration >= 0.005) {
    riskScore += 8
    reasons.push("mortalite en legere hausse")
  }

  if (features.overdueVaccines > 0) {
    riskScore += 15
    reasons.push(`${features.overdueVaccines} vaccination(s) en retard`)
  } else if (features.dueVaccines > 0) {
    riskScore += 5
    reasons.push(`${features.dueVaccines} vaccination(s) a faire`)
  }

  if (features.activeTreatments > 0) {
    riskScore += 10
    reasons.push(`${features.activeTreatments} traitement(s) actif(s)`)
  }

  if (features.missingDailyRecords >= 2) {
    riskScore += 15
    reasons.push(`${features.missingDailyRecords} jour(s) de saisie manquante sur la fenetre recente`)
  } else if (features.missingDailyRecords === 1) {
    riskScore += 8
    reasons.push("1 jour de saisie manquante sur la fenetre recente")
  }

  if ((features.missingSinceDays ?? 0) >= 2) {
    riskScore += 10
    reasons.push("derniere saisie trop ancienne")
  }

  if (features.recentMortality >= 5) {
    riskScore += 10
    reasons.push(`${features.recentMortality} mortalite(s) sur ${features.recentWindowDays} jours`)
  }

  const normalizedScore = Math.min(100, Math.max(0, Math.round(riskScore)))
  const alertLevel = getAlertLevel(normalizedScore)
  const label = labelFromAlertLevel(alertLevel)
  const summary = reasons.length > 0
    ? reasons.slice(0, 3).join(" · ")
    : "Aucun signal sanitaire majeur detecte sur les 7 derniers jours."

  return {
    batchId: features.batchId,
    riskScore: normalizedScore,
    alertLevel,
    label,
    summary,
    reasons,
    metrics: {
      recentMortality: features.recentMortality,
      previousMortality: features.previousMortality,
      recentMortalityRatePct: round(features.recentMortalityRate * 100),
      previousMortalityRatePct: round(features.previousMortalityRate * 100),
      recentAverageDailyMortalityRatePct: round(features.recentAverageDailyMortalityRate * 100),
      missingDailyRecords: features.missingDailyRecords,
      activeTreatments: features.activeTreatments,
      overdueVaccines: features.overdueVaccines,
      dueVaccines: features.dueVaccines,
    },
  }
}
