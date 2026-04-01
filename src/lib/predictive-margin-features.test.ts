import { describe, expect, it } from "vitest"
import { computeBatchMarginProjectionFeatures } from "./predictive-margin-features"

const NOW = new Date("2026-04-01T12:00:00.000Z")

describe("computeBatchMarginProjectionFeatures", () => {
  it("projects remaining operational cost from observed daily burn", () => {
    const features = computeBatchMarginProjectionFeatures({
      batchId: "b1",
      batchType: "CHAIR",
      entryDate: new Date("2026-03-12T00:00:00.000Z"),
      entryAgeDay: 0,
      entryCount: 1000,
      liveCount: 930,
      purchaseCostFcfa: 250000,
      operationalCostFcfa: 150000,
      revenueFcfa: 0,
      totalMortality: 70,
      benchmark: {
        sampleSize: 3,
        avgRevenuePerBirdFcfa: 1800,
        avgOperationalCostPerDayFcfa: 7000,
        avgMarginRate: 12,
      },
      now: NOW,
    })

    expect(features.ageDay).toBeGreaterThan(0)
    expect(features.remainingDays).toBeGreaterThanOrEqual(0)
    expect(features.projectedOperationalCostFcfa).toBeGreaterThan(features.operationalCostFcfa)
    expect(features.projectedRevenueFcfa).toBe(930 * 1800)
  })
})
