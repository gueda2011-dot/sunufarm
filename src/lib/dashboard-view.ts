import type { BatchSummary } from "@/src/actions/batches"
import type { ExpenseSummary } from "@/src/actions/expenses"
import type { PurchaseSummary } from "@/src/actions/purchases"
import {
  getBatchOperationalSnapshot,
  hasMissingBatchSaisie,
} from "@/src/lib/batch-metrics"

export interface DashboardMortalityChartPoint {
  date: string
  mort: number
}

interface DashboardMortalityChartRow {
  date: Date
  _sum: {
    mortality: number | null
  }
}

export interface DashboardBatchCardView {
  id: string
  number: string
  farmName: string
  buildingName: string
  entryCount: number
  dailyRecordsCount: number
  ageDay: number
  needsSaisie: boolean
}

export interface DashboardViewModel {
  activeBatchCount: number
  totalActiveBatches: number
  totalEntryCount: number
  totalChargesFcfa: number
  totalCashOutFcfa: number
  totalPurchasesFcfa: number
  totalOtherExpensesFcfa: number
  totalSupplierBalanceFcfa: number
  totalMortality: number
  mortalityRate: number
  alertCount: number
  batchesNeedingSaisie: Array<{ id: string; number: string }>
  activeBatchCards: DashboardBatchCardView[]
  mortalityChart: DashboardMortalityChartPoint[]
}

interface BuildDashboardViewModelInput {
  activeBatches: BatchSummary[]
  expenses: ExpenseSummary[]
  purchases: PurchaseSummary[]
  totalMortality: number
  recentRecordBatchIds: string[]
  mortalityChartRows: DashboardMortalityChartRow[]
  now?: Date
}

export function buildDashboardViewModel(
  input: BuildDashboardViewModelInput,
): DashboardViewModel {
  const now = input.now ?? new Date()
  const recentIds = new Set(input.recentRecordBatchIds)

  const activeBatchCards = [...input.activeBatches]
    .map((batch) => {
      const snapshot = getBatchOperationalSnapshot({
        entryDate: batch.entryDate,
        entryAgeDay: batch.entryAgeDay,
        entryCount: batch.entryCount,
        status: batch.status,
        closedAt: batch.closedAt,
        totalMortality: 0,
        now,
      })
      const missingWithoutRecords = hasMissingBatchSaisie({
        status: batch.status,
        entryDate: batch.entryDate,
        lastRecordDate: null,
        now,
      })
      const needsSaisie = recentIds.has(batch.id)
        ? false
        : batch._count.dailyRecords > 0
          ? true
          : missingWithoutRecords

      return {
        id: batch.id,
        number: batch.number,
        farmName: batch.building.farm.name,
        buildingName: batch.building.name,
        entryCount: batch.entryCount,
        dailyRecordsCount: batch._count.dailyRecords,
        ageDay: snapshot.ageDay,
        needsSaisie,
      }
    })
    .sort((a, b) => b.ageDay - a.ageDay)

  const totalEntryCount = input.activeBatches.reduce((sum, batch) => sum + batch.entryCount, 0)
  const totalBatchCostFcfa = input.activeBatches.reduce((sum, batch) => sum + batch.totalCostFcfa, 0)
  const totalOtherExpensesFcfa = input.expenses.reduce((sum, expense) => sum + expense.amountFcfa, 0)
  const totalPurchasesFcfa = input.purchases.reduce((sum, purchase) => sum + purchase.totalFcfa, 0)
  const totalPurchasesPaidFcfa = input.purchases.reduce((sum, purchase) => sum + purchase.paidFcfa, 0)
  const totalSupplierBalanceFcfa = input.purchases.reduce((sum, purchase) => sum + purchase.balanceFcfa, 0)
  const totalChargesFcfa = totalBatchCostFcfa + totalPurchasesFcfa + totalOtherExpensesFcfa
  const totalCashOutFcfa = totalBatchCostFcfa + totalPurchasesPaidFcfa + totalOtherExpensesFcfa

  const mortMap = new Map(
    input.mortalityChartRows.map((row) => [
      row.date.toISOString().substring(0, 10),
      row._sum.mortality ?? 0,
    ]),
  )

  const mortalityChart: DashboardMortalityChartPoint[] = []
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 86_400_000)
    const key = date.toISOString().substring(0, 10)
    mortalityChart.push({
      date: `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`,
      mort: mortMap.get(key) ?? 0,
    })
  }

  const batchesNeedingSaisie = activeBatchCards
    .filter((batch) => batch.needsSaisie)
    .map((batch) => ({ id: batch.id, number: batch.number }))

  const mortalityRate = totalEntryCount > 0
    ? (input.totalMortality / totalEntryCount) * 100
    : 0

  return {
    activeBatchCount: input.activeBatches.length,
    totalActiveBatches: input.activeBatches.length,
    totalEntryCount,
    totalChargesFcfa,
    totalCashOutFcfa,
    totalPurchasesFcfa,
    totalOtherExpensesFcfa,
    totalSupplierBalanceFcfa,
    totalMortality: input.totalMortality,
    mortalityRate,
    alertCount: batchesNeedingSaisie.length,
    batchesNeedingSaisie,
    activeBatchCards,
    mortalityChart,
  }
}
