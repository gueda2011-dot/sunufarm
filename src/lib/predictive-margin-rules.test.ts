import { describe, expect, it } from "vitest"
import { predictBatchMarginProjection } from "./predictive-margin-rules"
import type { BatchMarginFeatures } from "./predictive-margin-features"

const baseFeatures: BatchMarginFeatures = {
  batchId: "b1",
  targetCycleDays: 45,
  ageDay: 20,
  remainingDays: 25,
  liveCount: 900,
  purchaseCostFcfa: 300000,
  operationalCostFcfa: 120000,
  observedOperationalCostPerDayFcfa: 6000,
  projectedOperationalCostFcfa: 270000,
  revenueFcfa: 0,
  projectedRevenueFcfa: 1620000,
  benchmark: {
    sampleSize: 4,
    avgRevenuePerBirdFcfa: 1800,
    avgOperationalCostPerDayFcfa: 6500,
    avgMarginRate: 18,
  },
}

describe("predictBatchMarginProjection", () => {
  it("returns favorable when projected margin is strong", () => {
    const prediction = predictBatchMarginProjection(baseFeatures)
    expect(prediction.alertLevel).toBe("ok")
    expect(prediction.status).toBe("favorable")
    expect(prediction.projectedProfitFcfa).toBeGreaterThan(0)
  })

  it("returns fragile when projected margin is low", () => {
    const prediction = predictBatchMarginProjection({
      ...baseFeatures,
      projectedRevenueFcfa: 610000,
    })
    expect(prediction.alertLevel).toBe("warning")
    expect(prediction.status).toBe("fragile")
  })

  it("returns negative when projected profit is below zero", () => {
    const prediction = predictBatchMarginProjection({
      ...baseFeatures,
      projectedRevenueFcfa: 400000,
    })
    expect(prediction.alertLevel).toBe("critical")
    expect(prediction.status).toBe("negative")
  })
})
