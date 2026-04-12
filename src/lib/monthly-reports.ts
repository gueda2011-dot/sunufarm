import ExcelJS from "exceljs"
import prisma from "@/src/lib/prisma"
import { formatDate, formatMoneyFCFA, formatNumber } from "@/src/lib/formatters"
import {
  buildMonthlyReportViewModel,
  type MonthlyReportData,
} from "@/src/lib/monthly-report-view"

export type { MonthlyReportData } from "@/src/lib/monthly-report-view"

const MONTHLY_REPORT_DETAIL_LIMIT = 500

function autosizeColumns(worksheet: ExcelJS.Worksheet) {
  worksheet.columns.forEach((column) => {
    let maxLength = 12
    if (!column) return
    if (!column.eachCell) return

    column.eachCell({ includeEmpty: true }, (cell) => {
      const value = cell.value
      if (value == null) return

      const text =
        typeof value === "object" && "richText" in value
          ? value.richText.map((part) => part.text).join("")
          : String(value)

      maxLength = Math.max(maxLength, Math.min(text.length + 2, 40))
    })

    column.width = maxLength
  })
}

function styleWorksheetTableHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } }
  row.alignment = { vertical: "middle" }
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF166534" },
  }
}

function addKpiRow(
  worksheet: ExcelJS.Worksheet,
  label: string,
  value: string | number,
  detail?: string,
) {
  const row = worksheet.addRow([label, value, detail ?? ""])
  row.getCell(1).font = { bold: true, color: { argb: "FF374151" } }
  row.getCell(2).alignment = { horizontal: "right" }
  row.getCell(3).font = { color: { argb: "FF6B7280" }, italic: true }
}

function sanitizeSpreadsheetValue(value: string | number) {
  if (typeof value !== "string") return value

  const trimmed = value.trimStart()
  if (/^[=+\-@]/.test(trimmed)) {
    return `'${value}`
  }

  return value
}

export async function getMonthlyReportData(args: {
  organizationId: string
  year: number
  month: number
}) {
  const { organizationId, year, month } = args
  const fromDate = new Date(year, month - 1, 1)
  const toDate = new Date(year, month, 0, 23, 59, 59)
  const previousFromDate = new Date(year, month - 2, 1)
  const previousToDate = new Date(year, month - 1, 0, 23, 59, 59)

  const [
    organization,
    batches,
    batchesClosedCount,
    mortalityAgg,
    expensesAgg,
    salesAgg,
    purchasesAgg,
    dailyRecordsCount,
    previousExpensesAgg,
    previousSalesAgg,
    previousMortalityAgg,
    batchPeriodAgg,
    expenses,
    sales,
    purchases,
  ] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true },
    }),
    prisma.batch.findMany({
      where: {
        organizationId,
        deletedAt: null,
        entryDate: { lte: toDate },
        OR: [{ status: "ACTIVE" }, { closedAt: { gte: fromDate } }],
      },
      orderBy: [{ entryDate: "desc" }, { number: "asc" }],
      select: {
        id: true,
        number: true,
        status: true,
        type: true,
        entryDate: true,
        entryCount: true,
        totalCostFcfa: true,
        building: {
          select: {
            name: true,
            farm: { select: { name: true } },
          },
        },
      },
    }),
    prisma.batch.count({
      where: {
        organizationId,
        deletedAt: null,
        closedAt: { gte: fromDate, lte: toDate },
      },
    }),
    prisma.dailyRecord.aggregate({
      where: {
        batch: { organizationId },
        date: { gte: fromDate, lte: toDate },
      },
      _sum: { mortality: true, feedKg: true },
    }),
    prisma.expense.aggregate({
      where: {
        organizationId,
        date: { gte: fromDate, lte: toDate },
      },
      _sum: { amountFcfa: true },
      _count: { id: true },
    }),
    prisma.sale.aggregate({
      where: {
        organizationId,
        saleDate: { gte: fromDate, lte: toDate },
      },
      _sum: { totalFcfa: true, paidFcfa: true },
      _count: { id: true },
    }),
    prisma.purchase.aggregate({
      where: {
        organizationId,
        purchaseDate: { gte: fromDate, lte: toDate },
      },
      _sum: { totalFcfa: true },
      _count: { id: true },
    }),
    prisma.dailyRecord.count({
      where: {
        batch: { organizationId },
        date: { gte: fromDate, lte: toDate },
      },
    }),
    prisma.expense.aggregate({
      where: {
        organizationId,
        date: { gte: previousFromDate, lte: previousToDate },
      },
      _sum: { amountFcfa: true },
    }),
    prisma.sale.aggregate({
      where: {
        organizationId,
        saleDate: { gte: previousFromDate, lte: previousToDate },
      },
      _sum: { totalFcfa: true },
    }),
    prisma.dailyRecord.aggregate({
      where: {
        batch: { organizationId },
        date: { gte: previousFromDate, lte: previousToDate },
      },
      _sum: { mortality: true },
    }),
    prisma.dailyRecord.groupBy({
      by: ["batchId"],
      where: {
        batch: { organizationId },
        date: { gte: fromDate, lte: toDate },
      },
      _sum: { mortality: true, feedKg: true },
      _count: { _all: true },
    }),
    prisma.expense.findMany({
      where: {
        organizationId,
        date: { gte: fromDate, lte: toDate },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: MONTHLY_REPORT_DETAIL_LIMIT,
      select: {
        date: true,
        description: true,
        amountFcfa: true,
        reference: true,
        category: { select: { name: true } },
        batch: { select: { number: true } },
      },
    }),
    prisma.sale.findMany({
      where: {
        organizationId,
        saleDate: { gte: fromDate, lte: toDate },
      },
      orderBy: [{ saleDate: "desc" }, { createdAt: "desc" }],
      take: MONTHLY_REPORT_DETAIL_LIMIT,
      select: {
        saleDate: true,
        productType: true,
        totalFcfa: true,
        paidFcfa: true,
        notes: true,
        customer: { select: { name: true } },
      },
    }),
    prisma.purchase.findMany({
      where: {
        organizationId,
        purchaseDate: { gte: fromDate, lte: toDate },
      },
      orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
      take: MONTHLY_REPORT_DETAIL_LIMIT,
      select: {
        purchaseDate: true,
        reference: true,
        totalFcfa: true,
        paidFcfa: true,
        notes: true,
        supplier: { select: { name: true } },
      },
    }),
  ])

  return buildMonthlyReportViewModel({
    organizationId,
    organizationName: organization.name,
    year,
    month,
    fromDate,
    toDate,
    batchesClosedCount,
    dailyRecordsCount,
    detailRowLimit: MONTHLY_REPORT_DETAIL_LIMIT,
    generatedAt: new Date(),
    batches,
    batchPeriodAgg,
    mortality: {
      current: mortalityAgg._sum.mortality ?? 0,
      previous: previousMortalityAgg._sum.mortality ?? 0,
      feedKg: mortalityAgg._sum.feedKg ?? 0,
    },
    expenses: {
      current: expensesAgg._sum.amountFcfa ?? 0,
      previous: previousExpensesAgg._sum.amountFcfa ?? 0,
      count: expensesAgg._count.id,
      rows: expenses,
    },
    sales: {
      current: salesAgg._sum.totalFcfa ?? 0,
      previous: previousSalesAgg._sum.totalFcfa ?? 0,
      paid: salesAgg._sum.paidFcfa ?? 0,
      count: salesAgg._count.id,
      rows: sales,
    },
    purchases: {
      current: purchasesAgg._sum.totalFcfa ?? 0,
      count: purchasesAgg._count.id,
      rows: purchases,
    },
  })
}

export function buildMonthlyReportCsv(report: MonthlyReportData) {
  const toCsvRow = (values: Array<string | number>) => (
    values
      .map((value) => sanitizeSpreadsheetValue(value))
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(",")
  )

  const lines = [
    toCsvRow(["Indicateur", "Valeur", "Detail"]),
    toCsvRow(["Periode", report.periodLabel, `${formatDate(report.fromDate)} - ${formatDate(report.toDate)}`]),
    toCsvRow(["Revenus ventes FCFA", report.totalSales, `${report.salesCount} ventes`]),
    toCsvRow(["Encaissements FCFA", report.totalPaid, "Montants encaisses"]),
    toCsvRow(["Depenses FCFA", report.totalExpenses, `${report.expensesCount} depenses`]),
    toCsvRow(["Achats fournisseurs FCFA", report.totalPurchases, `${report.purchasesCount} achats`]),
    toCsvRow(["Resultat net FCFA", report.netResult, "Revenus - depenses"]),
    toCsvRow(["Mortalite", report.totalMortality, "Sujets sur la periode"]),
    toCsvRow(["Aliment distribue kg", report.totalFeedKg, "Volume total"]),
    toCsvRow(["Saisies journalieres", report.dailyRecordsCount, "Nombre de saisies"]),
    "",
    toCsvRow(["Lot", "Statut", "Ferme", "Batiment", "Entree", "Effectif", "Mortalite periode", "Aliment kg", "Cout initial FCFA"]),
    ...report.batchesActive.map((batch) => (
      toCsvRow([
        batch.number,
        sanitizeSpreadsheetValue(batch.status),
        sanitizeSpreadsheetValue(batch.farmName),
        sanitizeSpreadsheetValue(batch.buildingName),
        batch.entryDate.toISOString().slice(0, 10),
        batch.entryCount,
        batch.periodMortality,
        batch.periodFeedKg,
        batch.totalCostFcfa,
      ])
    )),
  ]

  return lines.join("\n")
}

export async function buildMonthlyReportWorkbook(report: MonthlyReportData) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "SunuFarm"
  workbook.company = "SunuFarm"
  workbook.created = report.generatedAt
  workbook.modified = report.generatedAt
  workbook.subject = `Rapport mensuel ${report.periodLabel}`
  workbook.title = `SunuFarm - ${report.periodLabel}`

  const summarySheet = workbook.addWorksheet("Synthese", {
    views: [{ state: "frozen", ySplit: 4 }],
  })
  summarySheet.mergeCells("A1:C1")
  summarySheet.getCell("A1").value = `SunuFarm - Rapport mensuel ${report.periodLabel}`
  summarySheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF14532D" } }
  summarySheet.getCell("A2").value = report.organizationName
  summarySheet.getCell("A3").value = `Genere le ${formatDate(report.generatedAt)}`
  summarySheet.addRow([])
  styleWorksheetTableHeader(summarySheet.addRow(["KPI", "Valeur", "Lecture"]))
  addKpiRow(summarySheet, "Revenus ventes", report.totalSales, `${report.salesCount} ventes`)
  addKpiRow(summarySheet, "Encaissements", report.totalPaid, "Montants encaisses")
  addKpiRow(summarySheet, "Depenses", report.totalExpenses, `${report.expensesCount} depenses`)
  addKpiRow(summarySheet, "Achats fournisseurs", report.totalPurchases, `${report.purchasesCount} achats`)
  addKpiRow(summarySheet, "Resultat net", report.netResult, "Revenus - depenses")
  addKpiRow(summarySheet, "Mortalite", report.totalMortality, `${formatNumber(report.totalEntryCount)} sujets suivis`)
  addKpiRow(summarySheet, "Aliment distribue", report.totalFeedKg, "Kilogrammes distribues")
  addKpiRow(summarySheet, "Saisies journalieres", report.dailyRecordsCount, "Enregistrements")
  addKpiRow(summarySheet, "Lots actifs", report.batchesActive.length, `${report.batchesClosedCount} lots clotures`)

  summarySheet.addRow([])
  styleWorksheetTableHeader(summarySheet.addRow(["Comparatif", "Valeur", "Variation vs mois precedent"]))
  addKpiRow(
    summarySheet,
    "Ventes",
    formatMoneyFCFA(report.comparison.sales.current),
    `${report.comparison.sales.deltaPercent?.toFixed(1) ?? "n/a"}%`,
  )
  addKpiRow(
    summarySheet,
    "Depenses",
    formatMoneyFCFA(report.comparison.expenses.current),
    `${report.comparison.expenses.deltaPercent?.toFixed(1) ?? "n/a"}%`,
  )
  addKpiRow(
    summarySheet,
    "Mortalite",
    report.comparison.mortality.current,
    `${report.comparison.mortality.deltaPercent?.toFixed(1) ?? "n/a"}%`,
  )
  if (report.expensesTruncated || report.salesTruncated || report.purchasesTruncated) {
    summarySheet.addRow([])
    styleWorksheetTableHeader(summarySheet.addRow(["Export detaille", "Statut", "Note"]))
    addKpiRow(summarySheet, "Lignes max par onglet", report.detailRowLimit, "Borne de performance")
    if (report.expensesTruncated) {
      addKpiRow(summarySheet, "Depenses", "Partiel", "Le detail a ete borne pour ce mois")
    }
    if (report.salesTruncated) {
      addKpiRow(summarySheet, "Ventes", "Partiel", "Le detail a ete borne pour ce mois")
    }
    if (report.purchasesTruncated) {
      addKpiRow(summarySheet, "Achats", "Partiel", "Le detail a ete borne pour ce mois")
    }
  }
  autosizeColumns(summarySheet)

  const batchesSheet = workbook.addWorksheet("Lots", {
    views: [{ state: "frozen", ySplit: 1 }],
  })
  styleWorksheetTableHeader(batchesSheet.addRow([
    "Lot",
    "Statut",
    "Type",
    "Ferme",
    "Batiment",
    "Date entree",
    "Effectif initial",
    "Mortalite periode",
    "Aliment periode (kg)",
    "Saisies",
    "Cout initial FCFA",
  ]))
  report.batchesActive.forEach((batch) => {
    batchesSheet.addRow([
      batch.number,
      sanitizeSpreadsheetValue(batch.status),
      sanitizeSpreadsheetValue(batch.type),
      sanitizeSpreadsheetValue(batch.farmName),
      sanitizeSpreadsheetValue(batch.buildingName),
      formatDate(batch.entryDate),
      batch.entryCount,
      batch.periodMortality,
      batch.periodFeedKg,
      batch.dailyRecordsCount,
      batch.totalCostFcfa,
    ])
  })
  autosizeColumns(batchesSheet)

  const expensesSheet = workbook.addWorksheet("Depenses", {
    views: [{ state: "frozen", ySplit: 1 }],
  })
  styleWorksheetTableHeader(expensesSheet.addRow([
    "Date",
    "Categorie",
    "Description",
    "Lot",
    "Reference",
    "Montant FCFA",
  ]))
  report.expenses.forEach((expense) => {
    expensesSheet.addRow([
      formatDate(expense.date),
      sanitizeSpreadsheetValue(expense.category),
      sanitizeSpreadsheetValue(expense.description),
      sanitizeSpreadsheetValue(expense.batchNumber),
      sanitizeSpreadsheetValue(expense.reference),
      expense.amountFcfa,
    ])
  })
  autosizeColumns(expensesSheet)

  const salesSheet = workbook.addWorksheet("Ventes", {
    views: [{ state: "frozen", ySplit: 1 }],
  })
  styleWorksheetTableHeader(salesSheet.addRow([
    "Date",
    "Client",
    "Produit",
    "Total FCFA",
    "Encaisse FCFA",
    "Reste a encaisser FCFA",
    "Notes",
  ]))
  report.sales.forEach((sale) => {
    salesSheet.addRow([
      formatDate(sale.date),
      sanitizeSpreadsheetValue(sale.customer),
      sanitizeSpreadsheetValue(sale.productType),
      sale.totalFcfa,
      sale.paidFcfa,
      sale.dueFcfa,
      sanitizeSpreadsheetValue(sale.notes),
    ])
  })
  autosizeColumns(salesSheet)

  const purchasesSheet = workbook.addWorksheet("Achats", {
    views: [{ state: "frozen", ySplit: 1 }],
  })
  styleWorksheetTableHeader(purchasesSheet.addRow([
    "Date",
    "Fournisseur",
    "Reference",
    "Total FCFA",
    "Paye FCFA",
    "Reste a payer FCFA",
    "Notes",
  ]))
  report.purchases.forEach((purchase) => {
    purchasesSheet.addRow([
      formatDate(purchase.date),
      sanitizeSpreadsheetValue(purchase.supplier),
      sanitizeSpreadsheetValue(purchase.reference),
      purchase.totalFcfa,
      purchase.paidFcfa,
      purchase.dueFcfa,
      sanitizeSpreadsheetValue(purchase.notes),
    ])
  })
  autosizeColumns(purchasesSheet)

  return workbook
}
