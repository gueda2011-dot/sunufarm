import type { AlertLevel } from "@/src/lib/kpi"
import type { BatchMarginFeatures } from "@/src/lib/predictive-margin-features"

export type MarginConfidence = "low" | "medium" | "high"
export type MarginProjectionStatus = "favorable" | "fragile" | "negative"

export interface BatchMarginProjection {
  batchId: string
  alertLevel: AlertLevel
  status: MarginProjectionStatus
  label: string
  summary: string
  confidence: MarginConfidence
  projectedRevenueFcfa: number
  projectedOperationalCostFcfa: number
  projectedTotalCostFcfa: number
  projectedProfitFcfa: number
  projectedMarginRate: number | null
  reasons: string[]
  metrics: {
    ageDay: number
    targetCycleDays: number
    remainingDays: number
    liveCount: number
    observedOperationalCostPerDayFcfa: number
    benchmarkSampleSize: number
    benchmarkMarginRate: number | null
  }
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function getConfidence(sampleSize: number): MarginConfidence {
  if (sampleSize >= 4) return "high"
  if (sampleSize >= 1) return "medium"
  return "low"
}

function getStatus(projectedProfitFcfa: number, projectedMarginRate: number | null): {
  alertLevel: AlertLevel
  status: MarginProjectionStatus
  label: string
} {
  if (projectedProfitFcfa < 0 || (projectedMarginRate != null && projectedMarginRate < 0)) {
    return { alertLevel: "critical", status: "negative", label: "Projection negative" }
  }
  if (projectedMarginRate == null || projectedMarginRate < 10) {
    return { alertLevel: "warning", status: "fragile", label: "Projection fragile" }
  }
  return { alertLevel: "ok", status: "favorable", label: "Projection favorable" }
}

export function predictBatchMarginProjection(
  features: BatchMarginFeatures,
): BatchMarginProjection {
  const projectedTotalCostFcfa = features.purchaseCostFcfa + features.projectedOperationalCostFcfa
  const projectedProfitFcfa = features.projectedRevenueFcfa - projectedTotalCostFcfa
  const projectedMarginRate = projectedTotalCostFcfa > 0
    ? round((projectedProfitFcfa / projectedTotalCostFcfa) * 100)
    : null

  const confidence = getConfidence(features.benchmark?.sampleSize ?? 0)
  const state = getStatus(projectedProfitFcfa, projectedMarginRate)

  const reasons: string[] = []
  if (features.benchmark?.avgRevenuePerBirdFcfa != null) {
    reasons.push(`benchmark interne base sur ${features.benchmark.sampleSize} lot(s) similaire(s)`)
  } else {
    reasons.push("pas de benchmark interne fiable, projection prudente")
  }
  if (features.remainingDays > 0) {
    reasons.push(`${features.remainingDays} jour(s) restants estimes sur le cycle`)
  }
  reasons.push(`cout operationnel observe ~ ${features.observedOperationalCostPerDayFcfa} FCFA/j`)
  if (projectedMarginRate != null) {
    reasons.push(`marge projetee ${projectedMarginRate}%`)
  }

  const summary = [
    `Revenus projetes ${features.projectedRevenueFcfa} FCFA`,
    `charges projetees ${projectedTotalCostFcfa} FCFA`,
    state.label.toLowerCase(),
  ].join(" · ")

  return {
    batchId: features.batchId,
    alertLevel: state.alertLevel,
    status: state.status,
    label: state.label,
    summary,
    confidence,
    projectedRevenueFcfa: features.projectedRevenueFcfa,
    projectedOperationalCostFcfa: features.projectedOperationalCostFcfa,
    projectedTotalCostFcfa,
    projectedProfitFcfa,
    projectedMarginRate,
    reasons,
    metrics: {
      ageDay: features.ageDay,
      targetCycleDays: features.targetCycleDays,
      remainingDays: features.remainingDays,
      liveCount: features.liveCount,
      observedOperationalCostPerDayFcfa: features.observedOperationalCostPerDayFcfa,
      benchmarkSampleSize: features.benchmark?.sampleSize ?? 0,
      benchmarkMarginRate: features.benchmark?.avgMarginRate ?? null,
    },
  }
}
