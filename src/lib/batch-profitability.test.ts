import { describe, expect, it } from "vitest"
import { computeBatchProfitability } from "@/src/lib/batch-profitability"

describe("batch-profitability", () => {
  it("calcule correctement les KPI de rentabilite d un lot", () => {
    expect(
      computeBatchProfitability({
        entryCount: 100,
        purchaseCostFcfa: 200000,
        operationalCostFcfa: 50000,
        revenueFcfa: 320000,
        saleItemsCount: 3,
        totalMortality: 4,
      }),
    ).toEqual({
      entryCount: 100,
      purchaseCostFcfa: 200000,
      operationalCostFcfa: 50000,
      revenueFcfa: 320000,
      saleItemsCount: 3,
      totalMortality: 4,
      totalCostFcfa: 250000,
      profitFcfa: 70000,
      marginRate: 28,
      costPerBird: 2500,
      breakEvenSalePricePerLiveBirdFcfa: 2605,
      mortalityRatePct: 4,
      liveCount: 96,
    })
  })

  it("gere correctement une perte", () => {
    const result = computeBatchProfitability({
      entryCount: 50,
      purchaseCostFcfa: 100000,
      operationalCostFcfa: 30000,
      revenueFcfa: 90000,
      saleItemsCount: 1,
      totalMortality: 2,
    })

    expect(result.profitFcfa).toBe(-40000)
    expect(result.marginRate).toBeCloseTo(-30.77, 2)
    expect(result.liveCount).toBe(48)
    expect(result.breakEvenSalePricePerLiveBirdFcfa).toBe(2709)
  })

  it("renvoie des ratios nuls quand il n y a pas assez de base de calcul", () => {
    expect(
      computeBatchProfitability({
        entryCount: 0,
        purchaseCostFcfa: 0,
        operationalCostFcfa: 0,
        revenueFcfa: 0,
        saleItemsCount: 0,
        totalMortality: 0,
      }),
    ).toMatchObject({
      totalCostFcfa: 0,
      profitFcfa: 0,
      marginRate: null,
      costPerBird: null,
      breakEvenSalePricePerLiveBirdFcfa: null,
      mortalityRatePct: null,
      liveCount: 0,
    })
  })
})
