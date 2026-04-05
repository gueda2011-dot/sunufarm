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
        totalEggsProduced: 0,
        totalSellableEggs: 0,
      }),
    ).toEqual({
      entryCount: 100,
      purchaseCostFcfa: 200000,
      operationalCostFcfa: 50000,
      revenueFcfa: 320000,
      saleItemsCount: 3,
      totalMortality: 4,
      totalEggsProduced: 0,
      totalSellableEggs: 0,
      totalCostFcfa: 250000,
      profitFcfa: 70000,
      marginRate: 28,
      costPerBird: 2500,
      breakEvenSalePricePerLiveBirdFcfa: 2605,
      costPerEggProducedFcfa: null,
      costPerSellableEggFcfa: null,
      breakEvenEggSalePriceFcfa: null,
      breakEvenTraySalePriceFcfa: null,
      sellableEggRatePct: null,
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
      totalEggsProduced: 0,
      totalSellableEggs: 0,
    })

    expect(result.profitFcfa).toBe(-40000)
    expect(result.marginRate).toBeCloseTo(-30.77, 2)
    expect(result.liveCount).toBe(48)
    expect(result.breakEvenSalePricePerLiveBirdFcfa).toBe(2709)
  })

  it("calcule une lecture economique par oeuf", () => {
    expect(
      computeBatchProfitability({
        entryCount: 200,
        purchaseCostFcfa: 600000,
        operationalCostFcfa: 300000,
        revenueFcfa: 1200000,
        saleItemsCount: 4,
        totalMortality: 10,
        totalEggsProduced: 4500,
        totalSellableEggs: 4200,
      }),
    ).toMatchObject({
      totalCostFcfa: 900000,
      costPerBird: 4500,
      breakEvenSalePricePerLiveBirdFcfa: 4737,
      costPerEggProducedFcfa: 200,
      costPerSellableEggFcfa: 215,
      breakEvenEggSalePriceFcfa: 215,
      breakEvenTraySalePriceFcfa: 6429,
      sellableEggRatePct: 93.33,
      liveCount: 190,
    })
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
        totalEggsProduced: 0,
        totalSellableEggs: 0,
      }),
    ).toMatchObject({
      totalCostFcfa: 0,
      profitFcfa: 0,
      marginRate: null,
      costPerBird: null,
      breakEvenSalePricePerLiveBirdFcfa: null,
      costPerEggProducedFcfa: null,
      costPerSellableEggFcfa: null,
      breakEvenEggSalePriceFcfa: null,
      breakEvenTraySalePriceFcfa: null,
      sellableEggRatePct: null,
      mortalityRatePct: null,
      liveCount: 0,
    })
  })
})
