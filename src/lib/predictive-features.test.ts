import { describe, it, expect } from "vitest"
import {
  computeFeedStockFeatures,
  computeMedicineStockFeatures,
} from "./predictive-features"

describe("computeFeedStockFeatures", () => {
  it("returns daysToStockout based on average daily consumption", () => {
    const sorties = [
      { feedStockId: "fs1", quantityKg: 70, date: new Date() },
      { feedStockId: "fs1", quantityKg: 70, date: new Date() },
    ]
    // total = 140 kg sur 14 jours → 10 kg/j. Stock = 50 kg → 5 jours
    const features = computeFeedStockFeatures("fs1", 50, sorties, 14)
    expect(features.avgDailyConsumptionKg).toBeCloseTo(10)
    expect(features.daysToStockout).toBeCloseTo(5)
  })

  it("returns daysToStockout = 0 when stock is already empty", () => {
    const sorties = [{ feedStockId: "fs1", quantityKg: 100, date: new Date() }]
    const features = computeFeedStockFeatures("fs1", 0, sorties, 14)
    expect(features.daysToStockout).toBe(0)
  })

  it("returns daysToStockout = null when no sorties exist", () => {
    const features = computeFeedStockFeatures("fs1", 200, [], 14)
    expect(features.avgDailyConsumptionKg).toBe(0)
    expect(features.daysToStockout).toBeNull()
  })

  it("ignores sorties from other feedStockIds", () => {
    const sorties = [
      { feedStockId: "fs2", quantityKg: 100, date: new Date() },
    ]
    const features = computeFeedStockFeatures("fs1", 200, sorties, 14)
    expect(features.daysToStockout).toBeNull()
  })

  it("uses provided windowDays for average computation", () => {
    const sorties = [{ feedStockId: "fs1", quantityKg: 7, date: new Date() }]
    // windowDays = 7 → avgDaily = 7/7 = 1 kg/j. Stock = 10 → 10 jours
    const features = computeFeedStockFeatures("fs1", 10, sorties, 7)
    expect(features.avgDailyConsumptionKg).toBeCloseTo(1)
    expect(features.daysToStockout).toBeCloseTo(10)
  })
})

describe("computeMedicineStockFeatures", () => {
  it("returns correct daysToStockout for medicine stock", () => {
    const sorties = [
      { medicineStockId: "ms1", quantity: 14, date: new Date() },
    ]
    // 14 unités sur 14 jours → 1/j. Stock = 5 → 5 jours
    const features = computeMedicineStockFeatures("ms1", 5, "flacon", sorties, 14)
    expect(features.avgDailyConsumption).toBeCloseTo(1)
    expect(features.daysToStockout).toBeCloseTo(5)
  })

  it("returns null daysToStockout when no sorties", () => {
    const features = computeMedicineStockFeatures("ms1", 10, "dose", [], 14)
    expect(features.daysToStockout).toBeNull()
  })

  it("preserves unit in output", () => {
    const features = computeMedicineStockFeatures("ms1", 10, "litre", [], 14)
    expect(features.unit).toBe("litre")
  })
})
