import { describe, it, expect } from "vitest"
import { predictFeedStockRupture, predictMedicineStockRupture } from "./predictive-rules"
import type { FeedStockFeatures, MedicineStockFeatures } from "./predictive-features"

const baseFeedFeatures: FeedStockFeatures = {
  feedStockId: "fs1",
  currentQuantityKg: 100,
  avgDailyConsumptionKg: 10,
  windowDays: 14,
  daysToStockout: 10,
}

describe("predictFeedStockRupture", () => {
  it("returns ok when > 3 days remaining", () => {
    const pred = predictFeedStockRupture({ ...baseFeedFeatures, daysToStockout: 10 })
    expect(pred.alertLevel).toBe("ok")
  })

  it("returns warning between 1 and 3 days remaining", () => {
    const pred = predictFeedStockRupture({ ...baseFeedFeatures, daysToStockout: 2 })
    expect(pred.alertLevel).toBe("warning")
    expect(pred.label).toMatch(/2 jour/)
  })

  it("returns critical when <= 1 day remaining", () => {
    const pred = predictFeedStockRupture({ ...baseFeedFeatures, daysToStockout: 1 })
    expect(pred.alertLevel).toBe("critical")
  })

  it("returns critical when stock is already empty (daysToStockout = 0)", () => {
    const pred = predictFeedStockRupture({ ...baseFeedFeatures, daysToStockout: 0 })
    expect(pred.alertLevel).toBe("critical")
    expect(pred.label).toBe("Rupture")
  })

  it("returns ok with label 'Pas de donnees' when no consumption known", () => {
    const pred = predictFeedStockRupture({ ...baseFeedFeatures, daysToStockout: null })
    expect(pred.alertLevel).toBe("ok")
    expect(pred.label).toBe("Pas de donnees")
  })

  it("unit is kg for feed stocks", () => {
    const pred = predictFeedStockRupture(baseFeedFeatures)
    expect(pred.unit).toBe("kg")
  })

  it("stockId matches feedStockId", () => {
    const pred = predictFeedStockRupture(baseFeedFeatures)
    expect(pred.stockId).toBe("fs1")
  })
})

const baseMedicineFeatures: MedicineStockFeatures = {
  medicineStockId: "ms1",
  currentQuantityOnHand: 10,
  unit: "flacon",
  avgDailyConsumption: 2,
  windowDays: 14,
  daysToStockout: 5,
}

describe("predictMedicineStockRupture", () => {
  it("returns critical for 2 days remaining (medicine critical threshold = 2)", () => {
    const pred = predictMedicineStockRupture({ ...baseMedicineFeatures, daysToStockout: 2 })
    expect(pred.alertLevel).toBe("critical")
  })

  it("returns warning for 5 days remaining (medicine warning threshold = 7)", () => {
    const pred = predictMedicineStockRupture({ ...baseMedicineFeatures, daysToStockout: 5 })
    expect(pred.alertLevel).toBe("warning")
  })

  it("returns critical for 0 days remaining", () => {
    const pred = predictMedicineStockRupture({ ...baseMedicineFeatures, daysToStockout: 0 })
    expect(pred.alertLevel).toBe("critical")
  })

  it("preserves unit from features", () => {
    const pred = predictMedicineStockRupture(baseMedicineFeatures)
    expect(pred.unit).toBe("flacon")
  })

  it("stockId matches medicineStockId", () => {
    const pred = predictMedicineStockRupture(baseMedicineFeatures)
    expect(pred.stockId).toBe("ms1")
  })
})
