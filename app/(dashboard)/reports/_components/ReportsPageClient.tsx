"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { Download } from "lucide-react"
import {
  formatMoneyFCFA,
  formatMoneyFCFACompact,
  formatNumber,
} from "@/src/lib/formatters"
import { FinancialChart } from "../../_components/FinancialChart"

const MONTHS = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
]

interface BatchInfo {
  id: string
  number: string
  status: string
  entryCount: number
  totalCostFcfa: number
  entryDate: Date
}

interface Props {
  year: number
  month: number
  batchesActive: BatchInfo[]
  batchesClosedCount: number
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

export function ReportsPageClient({
  year,
  month,
  batchesActive,
  batchesClosedCount,
  totalMortality,
  totalFeedKg,
  totalExpenses,
  expensesCount,
  totalSales,
  totalPaid,
  salesCount,
  totalPurchases,
  purchasesCount,
  dailyRecordsCount,
  netResult,
}: Props) {
  const router = useRouter()

  function navigate(newMonth: number, newYear: number) {
    router.push(`/reports?month=${newMonth}&year=${newYear}`)
  }

  function prevMonth() {
    if (month === 1) navigate(12, year - 1)
    else navigate(month - 1, year)
  }

  function nextMonth() {
    const now = new Date()
    if (year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1)) {
      return
    }

    if (month === 12) navigate(1, year + 1)
    else navigate(month + 1, year)
  }

  const isCurrentMonth =
    year === new Date().getFullYear() && month === new Date().getMonth() + 1

  const totalEntryCount = batchesActive.reduce((sum, batch) => sum + batch.entryCount, 0)

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
            {MONTHS[month - 1]} {year}
          </span>
          <button
            onClick={nextMonth}
            disabled={isCurrentMonth}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition-colors hover:bg-gray-50 disabled:opacity-30"
          >
            {"->"}
          </button>
          <Link
            href={`/api/reports/monthly?month=${month}&year=${year}`}
            className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-100"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Link>
        </div>
      </div>

      <FinancialChart
        totalSales={totalSales}
        totalExpenses={totalExpenses}
        totalPurchases={totalPurchases}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Financier
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiCard
            label="Revenus ventes"
            value={formatMoneyFCFACompact(totalSales)}
            sub={`${salesCount} vente${salesCount > 1 ? "s" : ""}`}
            accent="green"
          />
          <KpiCard
            label="Depenses"
            value={formatMoneyFCFACompact(totalExpenses)}
            sub={`${expensesCount} entree${expensesCount > 1 ? "s" : ""}`}
          />
          <div className={`col-span-2 rounded-xl border p-4 sm:col-span-1 ${
            netResult >= 0
              ? "border-green-200 bg-green-50"
              : "border-red-100 bg-red-50"
          }`}>
            <div className="mb-1 text-xs text-gray-400">Resultat net</div>
            <div className={`text-xl font-bold leading-tight tabular-nums ${
              netResult >= 0 ? "text-green-700" : "text-red-600"
            }`}>
              {formatMoneyFCFACompact(netResult)}
            </div>
            <div className="mt-0.5 text-xs text-gray-400">revenus - depenses</div>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3">
          <span className="text-sm text-gray-500">Achats fournisseurs</span>
          <span className="text-sm font-medium text-gray-900 tabular-nums">
            {formatMoneyFCFA(totalPurchases)}
            <span className="ml-1 text-xs text-gray-400">({purchasesCount})</span>
          </span>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3">
          <span className="text-sm text-gray-500">Encaissements</span>
          <span className="text-sm font-medium text-green-700 tabular-nums">
            {formatMoneyFCFA(totalPaid)}
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
            value={String(batchesActive.length)}
            sub={`${formatNumber(totalEntryCount)} sujets`}
            accent="blue"
          />
          <KpiCard
            label="Lots clotures"
            value={String(batchesClosedCount)}
            sub="ce mois"
          />
          <KpiCard
            label="Mortalite"
            value={formatNumber(totalMortality)}
            sub="sujets ce mois"
            accent={totalMortality > 0 ? "orange" : undefined}
          />
          <KpiCard
            label="Saisies"
            value={String(dailyRecordsCount)}
            sub="enregistrements"
          />
        </div>

        {totalFeedKg > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3">
            <span className="text-sm text-gray-500">Aliment distribue</span>
            <span className="text-sm font-medium text-gray-900 tabular-nums">
              {formatNumber(totalFeedKg)} kg
            </span>
          </div>
        )}
      </section>

      {batchesActive.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Lots de la periode
          </h2>
          <div className="divide-y divide-gray-50 rounded-xl border border-gray-100 bg-white">
            {batchesActive.map((batch) => (
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
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">{formatNumber(batch.entryCount)} sujets</div>
                  <div className="text-xs text-gray-400">{formatMoneyFCFA(batch.totalCostFcfa)}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-center text-sm text-gray-500">
        Export CSV disponible maintenant. PDF et Excel pourront suivre ensuite sans changer la structure du rapport.
      </div>
    </div>
  )
}
