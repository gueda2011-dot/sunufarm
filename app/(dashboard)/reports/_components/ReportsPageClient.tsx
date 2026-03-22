"use client"

/**
 * SunuFarm — Page Rapports (Client Component)
 *
 * Rapport mensuel : navigation entre mois, synthèse production + financière.
 */

import { useRouter }   from "next/navigation"
import Link            from "next/link"
import {
  formatMoneyFCFA,
  formatMoneyFCFACompact,
  formatNumber,
}                      from "@/src/lib/formatters"

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const MONTHS = [
  "Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre",
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BatchInfo {
  id:            string
  batchNumber:   string
  status:        string
  entryCount:    number
  totalCostFcfa: number
  entryDate:     Date
}

interface Props {
  year:               number
  month:              number
  batchesActive:      BatchInfo[]
  batchesClosedCount: number
  totalMortality:     number
  totalFeedKg:        number
  totalExpenses:      number
  expensesCount:      number
  totalSales:         number
  totalPaid:          number
  salesCount:         number
  totalPurchases:     number
  purchasesCount:     number
  dailyRecordsCount:  number
  netResult:          number
}

// ---------------------------------------------------------------------------
// KpiCard
// ---------------------------------------------------------------------------

function KpiCard({
  label, value, sub, accent,
}: {
  label: string; value: string; sub?: string; accent?: "green" | "red" | "orange" | "blue"
}) {
  const cls =
    accent === "green"  ? "text-green-700"  :
    accent === "red"    ? "text-red-600"    :
    accent === "orange" ? "text-orange-600" :
    accent === "blue"   ? "text-blue-600"   :
    "text-gray-900"
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-lg font-bold tabular-nums leading-tight ${cls}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
    if (year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1))
      return
    if (month === 12) navigate(1, year + 1)
    else navigate(month + 1, year)
  }

  const isCurrentMonth =
    year === new Date().getFullYear() && month === new Date().getMonth() + 1

  const totalEntryCount = batchesActive.reduce((s, b) => s + b.entryCount, 0)

  return (
    <div className="mx-auto max-w-3xl space-y-6">

      {/* ── En-tête + navigation ────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Rapport mensuel</h1>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={prevMonth}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
          >
            ←
          </button>
          <span className="font-semibold text-gray-900">
            {MONTHS[month - 1]} {year}
          </span>
          <button
            onClick={nextMonth}
            disabled={isCurrentMonth}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-30 transition-colors"
          >
            →
          </button>
        </div>
      </div>

      {/* ── KPI financiers ─────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
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
            label="Dépenses"
            value={formatMoneyFCFACompact(totalExpenses)}
            sub={`${expensesCount} entrée${expensesCount > 1 ? "s" : ""}`}
          />
          <div className={`col-span-2 sm:col-span-1 rounded-xl border p-4 ${
            netResult >= 0
              ? "border-green-200 bg-green-50"
              : "border-red-100 bg-red-50"
          }`}>
            <div className="text-xs text-gray-400 mb-1">Résultat net</div>
            <div className={`text-xl font-bold tabular-nums leading-tight ${
              netResult >= 0 ? "text-green-700" : "text-red-600"
            }`}>
              {formatMoneyFCFACompact(netResult)}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">revenus − dépenses</div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-gray-500">Achats fournisseurs</span>
          <span className="font-medium text-sm text-gray-900 tabular-nums">
            {formatMoneyFCFA(totalPurchases)}
            <span className="text-gray-400 ml-1 text-xs">({purchasesCount})</span>
          </span>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-gray-500">Encaissements</span>
          <span className="font-medium text-sm text-green-700 tabular-nums">
            {formatMoneyFCFA(totalPaid)}
          </span>
        </div>
      </section>

      {/* ── KPI production ─────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
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
            label="Lots clôturés"
            value={String(batchesClosedCount)}
            sub="ce mois"
          />
          <KpiCard
            label="Mortalité"
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
          <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-gray-500">Aliment distribué</span>
            <span className="font-medium text-sm text-gray-900 tabular-nums">
              {formatNumber(totalFeedKg)} kg
            </span>
          </div>
        )}
      </section>

      {/* ── Détail lots ────────────────────────────────────────────────────── */}
      {batchesActive.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Lots de la période
          </h2>
          <div className="rounded-xl border border-gray-100 bg-white divide-y divide-gray-50">
            {batchesActive.map((b) => (
              <Link
                key={b.id}
                href={`/batches/${b.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div>
                  <span className="text-sm font-medium text-gray-900">{b.batchNumber}</span>
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                    b.status === "ACTIVE"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}>
                    {b.status === "ACTIVE" ? "Actif" : "Clôturé"}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">{formatNumber(b.entryCount)} sujets</div>
                  <div className="text-xs text-gray-400">{formatMoneyFCFA(b.totalCostFcfa)}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Note exports ───────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-400 text-center">
        Export PDF et Excel disponibles en V2
      </div>
    </div>
  )
}
