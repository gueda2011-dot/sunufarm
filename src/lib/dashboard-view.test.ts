import { describe, expect, it } from "vitest"
import type { BatchSummary } from "@/src/actions/batches"
import type { ExpenseSummary } from "@/src/actions/expenses"
import { buildDashboardViewModel } from "@/src/lib/dashboard-view"

function createBatch(overrides: Partial<BatchSummary>): BatchSummary {
  return {
    id: "batch-1",
    organizationId: "org-1",
    buildingId: "building-1",
    number: "SF-001",
    type: "CHAIR",
    status: "ACTIVE",
    entryDate: new Date("2026-03-01T00:00:00.000Z"),
    entryCount: 100,
    entryAgeDay: 1,
    unitCostFcfa: 500,
    totalCostFcfa: 50000,
    closedAt: null,
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    breed: null,
    building: {
      id: "building-1",
      name: "Bat A",
      farmId: "farm-1",
      farm: { id: "farm-1", name: "Ferme Nord" },
    },
    _count: { dailyRecords: 0 },
    ...overrides,
  } as BatchSummary
}

function createExpense(overrides: Partial<ExpenseSummary>): ExpenseSummary {
  return {
    id: "expense-1",
    organizationId: "org-1",
    batchId: null,
    farmId: null,
    categoryId: null,
    date: new Date("2026-03-10T00:00:00.000Z"),
    description: "Transport",
    amountFcfa: 5000,
    supplierId: null,
    reference: null,
    createdAt: new Date("2026-03-10T00:00:00.000Z"),
    category: null,
    ...overrides,
  }
}

describe("dashboard-view", () => {
  it("assemble les KPI et cartes de lots depuis les donnees brutes", () => {
    const view = buildDashboardViewModel({
      activeBatches: [
        createBatch({ id: "batch-1", number: "SF-001", entryCount: 100, totalCostFcfa: 50000 }),
        createBatch({
          id: "batch-2",
          number: "SF-002",
          entryDate: new Date("2026-03-05T00:00:00.000Z"),
          entryAgeDay: 0,
          entryCount: 80,
          totalCostFcfa: 30000,
          _count: { dailyRecords: 4 },
        }),
      ],
      expenses: [createExpense({ amountFcfa: 7000 })],
      totalMortality: 9,
      recentRecordBatchIds: ["batch-2"],
      mortalityChartRows: [
        { date: new Date("2026-03-10T00:00:00.000Z"), _sum: { mortality: 3 } },
      ],
      now: new Date("2026-03-11T00:00:00.000Z"),
    })

    expect(view.activeBatchCount).toBe(2)
    expect(view.totalEntryCount).toBe(180)
    expect(view.totalChargesFcfa).toBe(87000)
    expect(view.totalMortality).toBe(9)
    expect(view.alertCount).toBe(1)
    expect(view.batchesNeedingSaisie).toEqual([{ id: "batch-1", number: "SF-001" }])
    expect(view.activeBatchCards[0]?.number).toBe("SF-001")
    expect(view.activeBatchCards[0]?.needsSaisie).toBe(true)
    expect(view.activeBatchCards[1]?.needsSaisie).toBe(false)
    expect(view.mortalityChart).toHaveLength(30)
    expect(view.mortalityChart.at(-1)).toEqual({ date: "11/03", mort: 0 })
  })
})
