import { describe, expect, it } from "vitest"
import {
  buildMonthlyReportCsv,
  buildMonthlyReportWorkbook,
  type MonthlyReportData,
} from "@/src/lib/monthly-reports"

function buildReportFixture(): MonthlyReportData {
  return {
    organizationId: "clw8orga0000000000000001",
    organizationName: "SunuFarm Test",
    year: 2026,
    month: 3,
    periodLabel: "Mars 2026",
    generatedAt: new Date("2026-03-31T12:00:00.000Z"),
    fromDate: new Date("2026-03-01T00:00:00.000Z"),
    toDate: new Date("2026-03-31T23:59:59.000Z"),
    batchesActive: [
      {
        id: "clw8batch0000000000000001",
        number: "SF-2026-001",
        status: "ACTIVE",
        type: "CHAIR",
        entryDate: new Date("2026-03-02T00:00:00.000Z"),
        entryCount: 120,
        totalCostFcfa: 65000,
        farmName: "Ferme Thies",
        buildingName: "Batiment A",
        periodMortality: 4,
        periodFeedKg: 180,
        dailyRecordsCount: 12,
      },
    ],
    batchesClosedCount: 1,
    totalEntryCount: 120,
    totalMortality: 4,
    totalFeedKg: 180,
    totalExpenses: 15000,
    expensesCount: 2,
    totalSales: 90000,
    totalPaid: 60000,
    salesCount: 3,
    totalPurchases: 22000,
    purchasesCount: 1,
    dailyRecordsCount: 12,
    netResult: 75000,
    comparison: {
      sales: { current: 90000, previous: 70000, delta: 20000, deltaPercent: 28.57, trend: "up" },
      expenses: { current: 15000, previous: 12000, delta: 3000, deltaPercent: 25, trend: "up" },
      mortality: { current: 4, previous: 2, delta: 2, deltaPercent: 100, trend: "up" },
    },
    detailRowLimit: 500,
    expensesTruncated: true,
    salesTruncated: false,
    purchasesTruncated: false,
    expenses: [
      {
        date: new Date("2026-03-10T00:00:00.000Z"),
        category: "Logistique",
        description: 'Transport "marche"',
        amountFcfa: 5000,
        batchNumber: "SF-2026-001",
        reference: "",
      },
    ],
    sales: [
      {
        date: new Date("2026-03-20T00:00:00.000Z"),
        customer: "Client Dakar",
        productType: "Poulets",
        totalFcfa: 90000,
        paidFcfa: 60000,
        dueFcfa: 30000,
        notes: "",
      },
    ],
    purchases: [
      {
        date: new Date("2026-03-05T00:00:00.000Z"),
        supplier: "Provenderie SA",
        reference: "ACH-01",
        totalFcfa: 22000,
        paidFcfa: 10000,
        dueFcfa: 12000,
        notes: "",
      },
    ],
  }
}

describe("monthly-reports", () => {
  it("genere un CSV coherent et echappe les guillemets", () => {
    const csv = buildMonthlyReportCsv(buildReportFixture())

    expect(csv).toContain('"Periode","Mars 2026","1 mars 2026 - 31 mars 2026"')
    expect(csv).toContain('"Resultat net FCFA","75000","Revenus - depenses"')
    expect(csv).toContain('"SF-2026-001","ACTIVE","Ferme Thies","Batiment A","2026-03-02","120","4","180","65000"')
    expect(csv).not.toContain('Transport "marche"')
  })

  it("genere un workbook avec les onglets attendus et les indicateurs cles", async () => {
    const workbook = await buildMonthlyReportWorkbook(buildReportFixture())

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Synthese",
      "Lots",
      "Depenses",
      "Ventes",
      "Achats",
    ])

    const summarySheet = workbook.getWorksheet("Synthese")
    const batchesSheet = workbook.getWorksheet("Lots")
    const expensesSheet = workbook.getWorksheet("Depenses")
    const summaryFirstColumnValues = summarySheet
      ? summarySheet.getColumn(1).values.filter((value) => value != null)
      : []

    expect(summarySheet?.getCell("A1").value).toBe("SunuFarm - Rapport mensuel Mars 2026")
    expect(summarySheet?.getCell("A2").value).toBe("SunuFarm Test")
    expect(summaryFirstColumnValues).toContain("KPI")
    expect(summaryFirstColumnValues).toContain("Comparatif")
    expect(summaryFirstColumnValues).toContain("Export detaille")
    expect(summaryFirstColumnValues).toContain("Depenses")

    expect(batchesSheet?.getRow(2).getCell(1).value).toBe("SF-2026-001")
    expect(expensesSheet?.getRow(2).getCell(3).value).toBe('Transport "marche"')
  })
})
