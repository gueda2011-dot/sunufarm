import { describe, expect, it } from "vitest"
import { predictBatchMortalityRisk } from "./predictive-mortality-rules"
import type { BatchMortalityFeatures } from "./predictive-mortality-features"

const baseFeatures: BatchMortalityFeatures = {
  batchId: "b1",
  ageDay: 21,
  recentWindowDays: 7,
  previousWindowDays: 7,
  recentMortality: 2,
  previousMortality: 1,
  recentMortalityRate: 0.002,
  previousMortalityRate: 0.001,
  recentAverageDailyMortalityRate: 0.0003,
  mortalityAcceleration: 0.001,
  activeTreatments: 0,
  overdueVaccines: 0,
  dueVaccines: 0,
  missingDailyRecords: 0,
  missingSinceDays: 0,
  lastRecordDate: new Date("2026-04-01T00:00:00.000Z"),
  observedRecentDays: 7,
}

describe("predictBatchMortalityRisk", () => {
  it("returns ok for low risk profiles", () => {
    const prediction = predictBatchMortalityRisk(baseFeatures)
    expect(prediction.alertLevel).toBe("ok")
    expect(prediction.riskScore).toBeLessThan(30)
  })

  it("returns warning for moderate risk profiles", () => {
    const prediction = predictBatchMortalityRisk({
      ...baseFeatures,
      recentAverageDailyMortalityRate: 0.006,
      recentMortality: 6,
      recentMortalityRate: 0.02,
      missingDailyRecords: 1,
    })

    expect(prediction.alertLevel).toBe("warning")
    expect(prediction.riskScore).toBeGreaterThanOrEqual(30)
  })

  it("returns critical for compounded high-risk signals", () => {
    const prediction = predictBatchMortalityRisk({
      ...baseFeatures,
      recentAverageDailyMortalityRate: 0.012,
      recentMortality: 14,
      recentMortalityRate: 0.05,
      previousMortalityRate: 0.01,
      mortalityAcceleration: 0.04,
      overdueVaccines: 2,
      activeTreatments: 1,
      missingDailyRecords: 2,
      missingSinceDays: 3,
    })

    expect(prediction.alertLevel).toBe("critical")
    expect(prediction.riskScore).toBeGreaterThanOrEqual(60)
    expect(prediction.reasons.length).toBeGreaterThan(0)
  })
})
