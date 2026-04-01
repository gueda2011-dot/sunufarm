import type { BatchType } from "@/src/generated/prisma/client"

export interface MarginBenchmarkFeatures {
  sampleSize: number
  avgRevenuePerBirdFcfa: number | null
  avgOperationalCostPerDayFcfa: number | null
  avgMarginRate: number | null
}

export interface BatchMarginFeatureInput {
  batchId: string
  batchType: BatchType
  entryDate: Date
  entryAgeDay: number
  entryCount: number
  liveCount: number
  purchaseCostFcfa: number
  operationalCostFcfa: number
  revenueFcfa: number
  totalMortality: number
  benchmark: MarginBenchmarkFeatures | null
  now?: Date
}

export interface BatchMarginFeatures {
  batchId: string
  targetCycleDays: number
  ageDay: number
  remainingDays: number
  liveCount: number
  purchaseCostFcfa: number
  operationalCostFcfa: number
  observedOperationalCostPerDayFcfa: number
  projectedOperationalCostFcfa: number
  revenueFcfa: number
  projectedRevenueFcfa: number
  benchmark: MarginBenchmarkFeatures | null
}

const TARGET_CYCLE_DAYS: Record<BatchType, number> = {
  CHAIR: 45,
  PONDEUSE: 365,
  REPRODUCTEUR: 365,
}

function diffDaysUtc(from: Date, to: Date): number {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
  return Math.floor((end - start) / 86_400_000)
}

export function computeBatchMarginProjectionFeatures(
  input: BatchMarginFeatureInput,
): BatchMarginFeatures {
  const now = input.now ?? new Date()
  const ageDay = input.entryAgeDay + Math.max(0, diffDaysUtc(input.entryDate, now))
  const targetCycleDays = Math.max(TARGET_CYCLE_DAYS[input.batchType], ageDay)
  const remainingDays = Math.max(0, targetCycleDays - ageDay)
  const observedOperationalCostPerDayFcfa = ageDay > 0
    ? input.operationalCostFcfa / ageDay
    : input.operationalCostFcfa

  const projectedOperationalCostFcfa = Math.round(
    input.operationalCostFcfa + (observedOperationalCostPerDayFcfa * remainingDays),
  )

  const projectedRevenueFcfa = input.benchmark?.avgRevenuePerBirdFcfa != null
    ? Math.round(input.liveCount * input.benchmark.avgRevenuePerBirdFcfa)
    : input.revenueFcfa

  return {
    batchId: input.batchId,
    targetCycleDays,
    ageDay,
    remainingDays,
    liveCount: input.liveCount,
    purchaseCostFcfa: input.purchaseCostFcfa,
    operationalCostFcfa: input.operationalCostFcfa,
    observedOperationalCostPerDayFcfa: Math.round(observedOperationalCostPerDayFcfa),
    projectedOperationalCostFcfa,
    revenueFcfa: input.revenueFcfa,
    projectedRevenueFcfa,
    benchmark: input.benchmark,
  }
}
