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
  detailRowLimit: number
  expensesTruncated: boolean
  salesTruncated: boolean
  purchasesTruncated: boolean
  expenses: MonthlyExpenseRow[]
  sales: MonthlySaleRow[]
  purchases: MonthlyPurchaseRow[]
}

interface BuildMonthlyReportViewModelInput {
  organizationId: string
  organizationName: string
  year: number
  month: number
  fromDate: Date
  toDate: Date
  batchesClosedCount: number
  dailyRecordsCount: number
  detailRowLimit: number
  generatedAt?: Date
  batches: Array<{
    id: string
    number: string
    status: string
    type: string
    entryDate: Date
    entryCount: number
    totalCostFcfa: number
    building: {
      name: string
      farm: { name: string }
    }
  }>
  batchPeriodAgg: Array<{
    batchId: string
    _sum: {
      mortality: number | null
      feedKg: number | null
    }
    _count: { _all: number }
  }>
  mortality: {
    current: number
    previous: number
    feedKg: number
  }
  expenses: {
    current: number
    previous: number
    count: number
    rows: Array<{
      date: Date
      description: string
      amountFcfa: number
      reference: string | null
      category: { name: string } | null
      batch: { number: string } | null
    }>
  }
  sales: {
    current: number
    previous: number
    paid: number
    count: number
    rows: Array<{
      saleDate: Date
      productType: string
      totalFcfa: number
      paidFcfa: number
      notes: string | null
      customer: { name: string } | null
    }>
  }
  purchases: {
    current: number
    count: number
    rows: Array<{
      purchaseDate: Date
      reference: string | null
      totalFcfa: number
      paidFcfa: number
      notes: string | null
      supplier: { name: string } | null
    }>
  }
}

export function buildMonthlyReportViewModel(
  input: BuildMonthlyReportViewModelInput,
): MonthlyReportData {
  const aggregatesByBatchId = new Map(
    input.batchPeriodAgg.map((item) => [
      item.batchId,
      {
        periodMortality: item._sum.mortality ?? 0,
        periodFeedKg: item._sum.feedKg ?? 0,
        dailyRecordsCount: item._count._all,
      },
    ]),
  )

  const batchesActive: MonthlyBatchRow[] = input.batches.map((batch) => {
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

  const totalEntryCount = batchesActive.reduce((sum, batch) => sum + batch.entryCount, 0)
  const totalSales = input.sales.current
  const totalExpenses = input.expenses.current

  return {
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    year: input.year,
    month: input.month,
    periodLabel: `${MONTHS[input.month - 1]} ${input.year}`,
    generatedAt: input.generatedAt ?? new Date(),
    fromDate: input.fromDate,
    toDate: input.toDate,
    batchesActive,
    batchesClosedCount: input.batchesClosedCount,
    totalEntryCount,
    totalMortality: input.mortality.current,
    totalFeedKg: input.mortality.feedKg,
    totalExpenses,
    expensesCount: input.expenses.count,
    totalSales,
    totalPaid: input.sales.paid,
    salesCount: input.sales.count,
    totalPurchases: input.purchases.current,
    purchasesCount: input.purchases.count,
    dailyRecordsCount: input.dailyRecordsCount,
    netResult: totalSales - totalExpenses,
    comparison: {
      sales: buildMetricComparison(totalSales, input.sales.previous),
      expenses: buildMetricComparison(totalExpenses, input.expenses.previous),
      mortality: buildMetricComparison(input.mortality.current, input.mortality.previous),
    },
    detailRowLimit: input.detailRowLimit,
    expensesTruncated: input.expenses.rows.length < input.expenses.count,
    salesTruncated: input.sales.rows.length < input.sales.count,
    purchasesTruncated: input.purchases.rows.length < input.purchases.count,
    expenses: input.expenses.rows.map((expense) => ({
      date: expense.date,
      category: expense.category?.name ?? "Non classe",
      description: expense.description,
      amountFcfa: expense.amountFcfa,
      batchNumber: expense.batch?.number ?? "General",
      reference: expense.reference ?? "",
    })),
    sales: input.sales.rows.map((sale) => ({
      date: sale.saleDate,
      customer: sale.customer?.name ?? "Client divers",
      productType: sale.productType,
      totalFcfa: sale.totalFcfa,
      paidFcfa: sale.paidFcfa,
      dueFcfa: Math.max(0, sale.totalFcfa - sale.paidFcfa),
      notes: sale.notes ?? "",
    })),
    purchases: input.purchases.rows.map((purchase) => ({
      date: purchase.purchaseDate,
      supplier: purchase.supplier?.name ?? "Fournisseur divers",
      reference: purchase.reference ?? "",
      totalFcfa: purchase.totalFcfa,
      paidFcfa: purchase.paidFcfa,
      dueFcfa: Math.max(0, purchase.totalFcfa - purchase.paidFcfa),
      notes: purchase.notes ?? "",
    })),
  }
}
