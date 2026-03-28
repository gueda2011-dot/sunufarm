import { describe, expect, it } from "vitest"
import { buildMonthlyReportViewModel } from "@/src/lib/monthly-report-view"

describe("monthly-report-view", () => {
  it("assemble un rapport mensuel coherent a partir des agregats bruts", () => {
    const report = buildMonthlyReportViewModel({
      organizationId: "org-1",
      organizationName: "SunuFarm Nord",
      year: 2026,
      month: 3,
      fromDate: new Date("2026-03-01T00:00:00.000Z"),
      toDate: new Date("2026-03-31T23:59:59.000Z"),
      batchesClosedCount: 1,
      dailyRecordsCount: 12,
      detailRowLimit: 500,
      generatedAt: new Date("2026-03-31T12:00:00.000Z"),
      batches: [
        {
          id: "batch-1",
          number: "SF-001",
          status: "ACTIVE",
          type: "CHAIR",
          entryDate: new Date("2026-03-02T00:00:00.000Z"),
          entryCount: 120,
          totalCostFcfa: 65000,
          building: {
            name: "Batiment A",
            farm: { name: "Ferme Thiès" },
          },
        },
      ],
      batchPeriodAgg: [
        {
          batchId: "batch-1",
          _sum: { mortality: 4, feedKg: 180 },
          _count: { _all: 12 },
        },
      ],
      mortality: {
        current: 4,
        previous: 2,
        feedKg: 180,
      },
      expenses: {
        current: 15000,
        previous: 12000,
        count: 2,
        rows: [
          {
            date: new Date("2026-03-10T00:00:00.000Z"),
            description: "Transport",
            amountFcfa: 5000,
            reference: null,
            category: { name: "Logistique" },
            batch: { number: "SF-001" },
          },
        ],
      },
      sales: {
        current: 90000,
        previous: 70000,
        paid: 60000,
        count: 3,
        rows: [
          {
            saleDate: new Date("2026-03-20T00:00:00.000Z"),
            productType: "Poulets",
            totalFcfa: 90000,
            paidFcfa: 60000,
            notes: null,
            customer: { name: "Client Dakar" },
          },
        ],
      },
      purchases: {
        current: 22000,
        count: 1,
        rows: [
          {
            purchaseDate: new Date("2026-03-05T00:00:00.000Z"),
            reference: "ACH-01",
            totalFcfa: 22000,
            paidFcfa: 10000,
            notes: null,
            supplier: { name: "Provenderie SA" },
          },
        ],
      },
    })

    expect(report.periodLabel).toBe("Mars 2026")
    expect(report.totalEntryCount).toBe(120)
    expect(report.totalSales).toBe(90000)
    expect(report.totalExpenses).toBe(15000)
    expect(report.netResult).toBe(75000)
    expect(report.expensesTruncated).toBe(true)
    expect(report.salesTruncated).toBe(true)
    expect(report.purchasesTruncated).toBe(false)
    expect(report.batchesActive[0]?.periodFeedKg).toBe(180)
    expect(report.sales[0]?.dueFcfa).toBe(30000)
    expect(report.purchases[0]?.dueFcfa).toBe(12000)
  })
})
