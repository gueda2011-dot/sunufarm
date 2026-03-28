import { livingCount, mortalityRate, netMargin } from "@/src/lib/kpi"

export interface BatchProfitabilitySnapshot {
  entryCount: number
  purchaseCostFcfa: number
  operationalCostFcfa: number
  revenueFcfa: number
  saleItemsCount: number
  totalMortality: number
}

export interface ComputedBatchProfitability extends BatchProfitabilitySnapshot {
  totalCostFcfa: number
  profitFcfa: number
  marginRate: number | null
  costPerBird: number | null
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

  return {
    ...snapshot,
    totalCostFcfa,
    profitFcfa: margin.amount,
    marginRate: margin.rate,
    costPerBird:
      totalCostFcfa > 0 && snapshot.entryCount > 0
        ? Math.round(totalCostFcfa / snapshot.entryCount)
        : null,
    mortalityRatePct,
    liveCount: liveCountValue,
  }
}
