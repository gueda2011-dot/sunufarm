import ExcelJS from "exceljs"
import prisma from "@/src/lib/prisma"
import { formatDate, formatMoneyFCFA, formatNumber } from "@/src/lib/formatters"
import {
  buildMetricComparison,
  type MetricComparison,
} from "@/src/lib/reporting"

const MONTHS = [
  "Janvier",
  "Fevrier",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Aout",
  "Septembre",
  "Octobre",
  "Novembre",
  "Decembre",
]

export interface MonthlyBatchRow {
  id: string
  number: string
  status: string
  type: string
  entryDate: Date
  entryCount: number
  totalCostFcfa: number
  farmName: string
  buildingName: string
  periodMortality: number
  periodFeedKg: number
  dailyRecordsCount: number
}

export interface MonthlyExpenseRow {
  date: Date
  category: string
  description: string
  amountFcfa: number
  batchNumber: string
  reference: string
}

export interface MonthlySaleRow {
  date: Date
  customer: string
  productType: string
  totalFcfa: number
  paidFcfa: number
  dueFcfa: number
  notes: string
}

export interface MonthlyPurchaseRow {
  date: Date
  supplier: string
  reference: string
  totalFcfa: number
  paidFcfa: number
  dueFcfa: number
  notes: string
}

export interface MonthlyReportData {
  organizationId: string
  organizationName: string
  year: number
  month: number
  periodLabel: string
  generatedAt: Date
  fromDate: Date
  toDate: Date
  batchesActive: MonthlyBatchRow[]
  batchesClosedCount: number
  totalEntryCount: number
  totalMortality: number
  totalFeedKg: number
  totalExpenses: number
  expensesCount: number
  totalSales: number
  totalPaid: number
  salesCount: number
  totalPurchases: number
  purchasesCount: number
  dailyRecordsCount: number
  netResult: number
  comparison: {
    sales: MetricComparison
    expenses: MetricComparison
    mortality: MetricComparison
  }
  expenses: MonthlyExpenseRow[]
  sales: MonthlySaleRow[]
  purchases: MonthlyPurchaseRow[]
}

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

  const aggregatesByBatchId = new Map(
    batchPeriodAgg.map((item) => [
      item.batchId,
      {
        periodMortality: item._sum.mortality ?? 0,
        periodFeedKg: item._sum.feedKg ?? 0,
        dailyRecordsCount: item._count._all,
      },
    ]),
  )

  const batchesActive: MonthlyBatchRow[] = batches.map((batch) => {
    const aggregate = aggregatesByBatchId.get(batch.id)

    return {
      id: batch.id,
      number: batch.number,
      status: batch.status,
      type: batch.type,
      entryDate: batch.entryDate,
      entryCount: batch.entryCount,
      totalCostFcfa: batch.totalCostFcfa,
      farmName: batch.building.farm.name,
      buildingName: batch.building.name,
      periodMortality: aggregate?.periodMortality ?? 0,
      periodFeedKg: aggregate?.periodFeedKg ?? 0,
      dailyRecordsCount: aggregate?.dailyRecordsCount ?? 0,
    }
  })

  const totalMortality = mortalityAgg._sum.mortality ?? 0
  const totalFeedKg = mortalityAgg._sum.feedKg ?? 0
  const totalExpenses = expensesAgg._sum.amountFcfa ?? 0
  const totalSales = salesAgg._sum.totalFcfa ?? 0
  const totalPaid = salesAgg._sum.paidFcfa ?? 0
  const totalPurchases = purchasesAgg._sum.totalFcfa ?? 0
  const totalEntryCount = batchesActive.reduce((sum, batch) => sum + batch.entryCount, 0)

  return {
    organizationId,
    organizationName: organization.name,
    year,
    month,
    periodLabel: `${MONTHS[month - 1]} ${year}`,
    generatedAt: new Date(),
    fromDate,
    toDate,
    batchesActive,
    batchesClosedCount,
    totalEntryCount,
    totalMortality,
    totalFeedKg,
    totalExpenses,
    expensesCount: expensesAgg._count.id,
    totalSales,
    totalPaid,
    salesCount: salesAgg._count.id,
    totalPurchases,
    purchasesCount: purchasesAgg._count.id,
    dailyRecordsCount,
    netResult: totalSales - totalExpenses,
    comparison: {
      sales: buildMetricComparison(totalSales, previousSalesAgg._sum.totalFcfa ?? 0),
      expenses: buildMetricComparison(totalExpenses, previousExpensesAgg._sum.amountFcfa ?? 0),
      mortality: buildMetricComparison(totalMortality, previousMortalityAgg._sum.mortality ?? 0),
    },
    expenses: expenses.map((expense) => ({
      date: expense.date,
      category: expense.category?.name ?? "Non classe",
      description: expense.description,
      amountFcfa: expense.amountFcfa,
      batchNumber: expense.batch?.number ?? "General",
      reference: expense.reference ?? "",
    })),
    sales: sales.map((sale) => ({
      date: sale.saleDate,
      customer: sale.customer?.name ?? "Client divers",
      productType: sale.productType,
      totalFcfa: sale.totalFcfa,
      paidFcfa: sale.paidFcfa,
      dueFcfa: Math.max(0, sale.totalFcfa - sale.paidFcfa),
      notes: sale.notes ?? "",
    })),
    purchases: purchases.map((purchase) => ({
      date: purchase.purchaseDate,
      supplier: purchase.supplier?.name ?? "Fournisseur divers",
      reference: purchase.reference ?? "",
      totalFcfa: purchase.totalFcfa,
      paidFcfa: purchase.paidFcfa,
      dueFcfa: Math.max(0, purchase.totalFcfa - purchase.paidFcfa),
      notes: purchase.notes ?? "",
    })),
  } satisfies MonthlyReportData
}

export function buildMonthlyReportCsv(report: MonthlyReportData) {
  const toCsvRow = (values: Array<string | number>) => (
    values.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")
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
        batch.status,
        batch.farmName,
        batch.buildingName,
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
      batch.status,
      batch.type,
      batch.farmName,
      batch.buildingName,
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
      expense.category,
      expense.description,
      expense.batchNumber,
      expense.reference,
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
      sale.customer,
      sale.productType,
      sale.totalFcfa,
      sale.paidFcfa,
      sale.dueFcfa,
      sale.notes,
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
      purchase.supplier,
      purchase.reference,
      purchase.totalFcfa,
      purchase.paidFcfa,
      purchase.dueFcfa,
      purchase.notes,
    ])
  })
  autosizeColumns(purchasesSheet)

  return workbook
}
