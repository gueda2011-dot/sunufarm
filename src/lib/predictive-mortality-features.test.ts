import { describe, expect, it } from "vitest"
import { computeBatchMortalityFeatures } from "./predictive-mortality-features"

const NOW = new Date("2026-04-01T12:00:00.000Z")

describe("computeBatchMortalityFeatures", () => {
  it("computes recent and previous mortality windows", () => {
    const features = computeBatchMortalityFeatures({
      batchId: "b1",
      batchType: "CHAIR",
      entryCount: 1000,
      entryDate: new Date("2026-03-10T00:00:00.000Z"),
      entryAgeDay: 0,
      dailyRecords: [
        { date: new Date("2026-04-01T00:00:00.000Z"), mortality: 4 },
        { date: new Date("2026-03-31T00:00:00.000Z"), mortality: 3 },
        { date: new Date("2026-03-27T00:00:00.000Z"), mortality: 2 },
        { date: new Date("2026-03-24T00:00:00.000Z"), mortality: 5 },
      ],
      vaccinationRecords: [],
      treatmentRecords: [],
      now: NOW,
    })

    expect(features.recentMortality).toBe(9)
    expect(features.previousMortality).toBe(5)
    expect(features.recentMortalityRate).toBeCloseTo(0.009)
    expect(features.previousMortalityRate).toBeCloseTo(0.005)
  })

  it("counts missing daily records on the recent window", () => {
    const features = computeBatchMortalityFeatures({
      batchId: "b1",
      batchType: "CHAIR",
      entryCount: 500,
      entryDate: new Date("2026-03-20T00:00:00.000Z"),
      entryAgeDay: 0,
      dailyRecords: [
        { date: new Date("2026-04-01T00:00:00.000Z"), mortality: 1 },
        { date: new Date("2026-03-30T00:00:00.000Z"), mortality: 0 },
      ],
      vaccinationRecords: [],
      treatmentRecords: [],
      now: NOW,
    })

    expect(features.observedRecentDays).toBe(2)
    expect(features.missingDailyRecords).toBe(5)
    expect(features.missingSinceDays).toBe(0)
  })

  it("derives overdue vaccines and active treatments", () => {
    const features = computeBatchMortalityFeatures({
      batchId: "b1",
      batchType: "CHAIR",
      entryCount: 800,
      entryDate: new Date("2026-03-01T00:00:00.000Z"),
      entryAgeDay: 0,
      dailyRecords: [],
      vaccinationRecords: [{ vaccineName: "Marek" }],
      treatmentRecords: [
        { startDate: new Date("2026-03-31T00:00:00.000Z"), endDate: null },
        { startDate: new Date("2026-03-20T00:00:00.000Z"), endDate: new Date("2026-03-22T00:00:00.000Z") },
      ],
      now: NOW,
    })

    expect(features.activeTreatments).toBe(1)
    expect(features.overdueVaccines).toBeGreaterThan(0)
  })
})
