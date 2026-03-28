"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { Download } from "lucide-react"
import {
  formatMoneyFCFA,
  formatMoneyFCFACompact,
  formatNumber,
} from "@/src/lib/formatters"
import type { MonthlyReportData } from "@/src/lib/monthly-report-view"
import { FinancialChart } from "../../_components/FinancialChart"
import { formatTrendLabel } from "@/src/lib/reporting"

const MONTHS = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
]

interface Props {
  report: MonthlyReportData
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: "green" | "red" | "orange" | "blue"
}) {
  const cls =
    accent === "green" ? "text-green-700" :
    accent === "red" ? "text-red-600" :
    accent === "orange" ? "text-orange-600" :
    accent === "blue" ? "text-blue-600" :
    "text-gray-900"

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-1 text-xs text-gray-400">{label}</div>
      <div className={`text-lg font-bold leading-tight tabular-nums ${cls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-400">{sub}</div>}
    </div>
  )
}

export function ReportsPageClient({ report }: Props) {
  const router = useRouter()

  function navigate(newMonth: number, newYear: number) {
    router.push(`/reports?month=${newMonth}&year=${newYear}`)
  }

  function prevMonth() {
    if (report.month === 1) navigate(12, report.year - 1)
    else navigate(report.month - 1, report.year)
  }

  function nextMonth() {
    const now = new Date()
    if (
      report.year > now.getFullYear() ||
      (report.year === now.getFullYear() && report.month >= now.getMonth() + 1)
    ) {
      return
    }

    if (report.month === 12) navigate(1, report.year + 1)
    else navigate(report.month + 1, report.year)
  }

  const isCurrentMonth =
    report.year === new Date().getFullYear() && report.month === new Date().getMonth() + 1

  const totalEntryCount = report.batchesActive.reduce((sum, batch) => sum + batch.entryCount, 0)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Rapport mensuel</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={prevMonth}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition-colors hover:bg-gray-50"
          >
            {"<-"}
          </button>
          <span className="font-semibold text-gray-900">
            {MONTHS[report.month - 1]} {report.year}
          </span>
          <button
            onClick={nextMonth}
            disabled={isCurrentMonth}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition-colors hover:bg-gray-50 disabled:opacity-30"
          >
            {"->"}
          </button>
          <Link
            href={`/api/reports/monthly?month=${report.month}&year=${report.year}&format=xlsx`}
            className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-100"
          >
            <Download className="h-4 w-4" />
            Export Excel
          </Link>
          <Link
            href={`/api/reports/monthly?month=${report.month}&year=${report.year}&format=pdf`}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            Export PDF
          </Link>
          <Link
            href={`/api/reports/monthly?month=${report.month}&year=${report.year}&format=csv`}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            CSV
          </Link>
        </div>
      </div>

      <FinancialChart
        totalSales={report.totalSales}
        totalExpenses={report.totalExpenses}
        totalPurchases={report.totalPurchases}
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Ventes
          </p>
          <p className="mt-2 text-sm font-medium text-gray-900">
            {formatTrendLabel(report.comparison.sales, "up")}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Mois precedent : {formatMoneyFCFA(report.comparison.sales.previous)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Depenses
          </p>
          <p className="mt-2 text-sm font-medium text-gray-900">
            {formatTrendLabel(report.comparison.expenses, "down")}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Mois precedent : {formatMoneyFCFA(report.comparison.expenses.previous)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Mortalite
          </p>
          <p className="mt-2 text-sm font-medium text-gray-900">
            {formatTrendLabel(report.comparison.mortality, "down")}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Mois precedent : {formatNumber(report.comparison.mortality.previous)} sujets
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Financier
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiCard
            label="Revenus ventes"
            value={formatMoneyFCFACompact(report.totalSales)}
            sub={`${report.salesCount} vente${report.salesCount > 1 ? "s" : ""}`}
            accent="green"
          />
          <KpiCard
            label="Depenses"
            value={formatMoneyFCFACompact(report.totalExpenses)}
            sub={`${report.expensesCount} entree${report.expensesCount > 1 ? "s" : ""}`}
          />
          <div className={`col-span-2 rounded-xl border p-4 sm:col-span-1 ${
            report.netResult >= 0
              ? "border-green-200 bg-green-50"
              : "border-red-100 bg-red-50"
          }`}>
            <div className="mb-1 text-xs text-gray-400">Resultat net</div>
            <div className={`text-xl font-bold leading-tight tabular-nums ${
              report.netResult >= 0 ? "text-green-700" : "text-red-600"
            }`}>
              {formatMoneyFCFACompact(report.netResult)}
            </div>
            <div className="mt-0.5 text-xs text-gray-400">revenus - depenses</div>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3">
          <span className="text-sm text-gray-500">Achats fournisseurs</span>
          <span className="text-sm font-medium text-gray-900 tabular-nums">
            {formatMoneyFCFA(report.totalPurchases)}
            <span className="ml-1 text-xs text-gray-400">({report.purchasesCount})</span>
          </span>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3">
          <span className="text-sm text-gray-500">Encaissements</span>
          <span className="text-sm font-medium text-green-700 tabular-nums">
            {formatMoneyFCFA(report.totalPaid)}
          </span>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Production
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            label="Lots actifs"
            value={String(report.batchesActive.length)}
            sub={`${formatNumber(totalEntryCount)} sujets`}
            accent="blue"
          />
          <KpiCard
            label="Lots clotures"
            value={String(report.batchesClosedCount)}
            sub="ce mois"
          />
          <KpiCard
            label="Mortalite"
            value={formatNumber(report.totalMortality)}
            sub="sujets ce mois"
            accent={report.totalMortality > 0 ? "orange" : undefined}
          />
          <KpiCard
            label="Saisies"
            value={String(report.dailyRecordsCount)}
            sub="enregistrements"
          />
        </div>

        {report.totalFeedKg > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3">
            <span className="text-sm text-gray-500">Aliment distribue</span>
            <span className="text-sm font-medium text-gray-900 tabular-nums">
              {formatNumber(report.totalFeedKg)} kg
            </span>
          </div>
        )}
      </section>

      {report.batchesActive.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Lots de la periode
          </h2>
          <div className="divide-y divide-gray-50 rounded-xl border border-gray-100 bg-white">
            {report.batchesActive.map((batch) => (
              <Link
                key={batch.id}
                href={`/batches/${batch.id}`}
                className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-gray-50"
              >
                <div>
                  <span className="text-sm font-medium text-gray-900">{batch.number}</span>
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                    batch.status === "ACTIVE"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}>
                    {batch.status === "ACTIVE" ? "Actif" : "Cloture"}
                  </span>
                  <div className="mt-1 text-xs text-gray-400">
                    {batch.farmName} · {batch.buildingName}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">{formatNumber(batch.entryCount)} sujets</div>
                  <div className="text-xs text-gray-400">
                    {formatNumber(batch.periodMortality)} morts · {formatNumber(batch.periodFeedKg)} kg
                  </div>
                  <div className="text-xs text-gray-400">{formatMoneyFCFA(batch.totalCostFcfa)}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-center text-sm text-gray-500">
        Les exports Excel, PDF et CSV reposent maintenant sur la meme structure mensuelle pour garder des chiffres coherents.
      </div>
    </div>
  )
}
