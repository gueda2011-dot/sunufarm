import { livingCount, mortalityRate, netMargin } from "@/src/lib/kpi"

export interface BatchProfitabilitySnapshot {
  entryCount: number
  purchaseCostFcfa: number
  operationalCostFcfa: number
  revenueFcfa: number
  saleItemsCount: number
  totalMortality: number
  totalEggsProduced?: number
  totalSellableEggs?: number
}

export interface ComputedBatchProfitability extends BatchProfitabilitySnapshot {
  totalCostFcfa: number
  profitFcfa: number
  marginRate: number | null
  costPerBird: number | null
  breakEvenSalePricePerLiveBirdFcfa: number | null
  costPerEggProducedFcfa: number | null
  costPerSellableEggFcfa: number | null
  breakEvenEggSalePriceFcfa: number | null
  breakEvenTraySalePriceFcfa: number | null
  sellableEggRatePct: number | null
  mortalityRatePct: number | null
  liveCount: number
}

export function computeBatchProfitability(
  snapshot: BatchProfitabilitySnapshot,
): ComputedBatchProfitability {
  const totalCostFcfa = snapshot.purchaseCostFcfa + snapshot.operationalCostFcfa
  const margin = netMargin(snapshot.revenueFcfa, totalCostFcfa)
  const liveCountValue = livingCount(snapshot.entryCount, snapshot.totalMortality)
  const mortalityRatePct = mortalityRate(snapshot.totalMortality, snapshot.entryCount)
  const totalEggsProduced = snapshot.totalEggsProduced ?? 0
  const totalSellableEggs = snapshot.totalSellableEggs ?? 0

  return {
    ...snapshot,
    totalEggsProduced,
    totalSellableEggs,
    totalCostFcfa,
    profitFcfa: margin.amount,
    marginRate: margin.rate,
    costPerBird:
      totalCostFcfa > 0 && snapshot.entryCount > 0
        ? Math.round(totalCostFcfa / snapshot.entryCount)
        : null,
    breakEvenSalePricePerLiveBirdFcfa:
      totalCostFcfa > 0 && liveCountValue > 0
        ? Math.ceil(totalCostFcfa / liveCountValue)
        : null,
    costPerEggProducedFcfa:
      totalCostFcfa > 0 && totalEggsProduced > 0
        ? Math.ceil(totalCostFcfa / totalEggsProduced)
        : null,
    costPerSellableEggFcfa:
      totalCostFcfa > 0 && totalSellableEggs > 0
        ? Math.ceil(totalCostFcfa / totalSellableEggs)
        : null,
    breakEvenEggSalePriceFcfa:
      totalCostFcfa > 0 && totalSellableEggs > 0
        ? Math.ceil(totalCostFcfa / totalSellableEggs)
        : null,
    breakEvenTraySalePriceFcfa:
      totalCostFcfa > 0 && totalSellableEggs > 0
        ? Math.ceil((totalCostFcfa / totalSellableEggs) * 30)
        : null,
    sellableEggRatePct:
      totalEggsProduced > 0
        ? Math.round((totalSellableEggs / totalEggsProduced) * 10000) / 100
        : null,
    mortalityRatePct,
    liveCount: liveCountValue,
  }
}
