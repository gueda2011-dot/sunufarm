/**
 * SunuFarm — KPI cards du détail d'un lot
 *
 * KPI affichés (données réellement disponibles) :
 *   - Effectif vivant (approximation : entryCount - totalMortality)
 *   - Mortalité cumulée + taux
 *   - Dernière saisie (date)
 *   - Coût d'achat (totalCostFcfa)
 *   - Coût unitaire (unitCostFcfa)
 *   - Dépenses opérationnelles (totalExpensesFcfa)
 *   - Charges totales (totalChargesFcfa)
 *   - Nombre de lignes de vente (saleItemsCount) avec lien
 *
 * KPI absents (non disponibles sans agrégation dédiée) :
 *   - Revenus totaux par lot (getSales ne filtre pas par batchId)
 *   - Rentabilité nette (dépend des revenus)
 */

import Link                       from "next/link"
import {
  formatMoneyFCFA,
  formatMoneyFCFACompact,
  formatNumber,
  formatPercent,
  formatDate,
}                                  from "@/src/lib/formatters"

// ---------------------------------------------------------------------------
// Sous-composant KpiCard
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label:   string
  value:   React.ReactNode
  sub?:    string
  accent?: "red" | "orange" | "green"
}) {
  const valueClass =
    accent === "red"    ? "text-red-600" :
    accent === "orange" ? "text-orange-600" :
    accent === "green"  ? "text-green-700" :
    "text-gray-900"

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-lg font-bold tabular-nums leading-tight ${valueClass}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BatchKpisProps {
  liveCount:          number
  totalMortality:     number
  mortalityRate:      number
  lastRecordDate:     Date | null
  isActive:           boolean
  totalCostFcfa:      number
  unitCostFcfa:       number
  totalExpensesFcfa:  number
  totalChargesFcfa:   number
  saleItemsCount:     number
  batchId:            string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BatchKpis({
  liveCount,
  totalMortality,
  mortalityRate,
  lastRecordDate,
  isActive,
  totalCostFcfa,
  unitCostFcfa,
  totalExpensesFcfa,
  totalChargesFcfa,
  saleItemsCount,
  batchId,
}: BatchKpisProps) {
  const mortalityAccent =
    mortalityRate > 5  ? "red" :
    mortalityRate > 2  ? "orange" :
    undefined

  return (
    <div className="space-y-3">

      {/* ── Titre section ─────────────────────────────────────────────── */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
        Indicateurs
      </h2>

      {/* ── Rang 1 : production ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          label="Effectif vivant"
          value={formatNumber(liveCount)}
          sub="entryCount − mortalité cumulée"
          accent={liveCount === 0 ? "red" : undefined}
        />
        <KpiCard
          label="Mortalité cumulée"
          value={`${formatNumber(totalMortality)} sujets`}
          sub={`${formatPercent(mortalityRate)} du total`}
          accent={mortalityAccent}
        />
      </div>

      {/* ── Rang 2 : suivi ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          label="Dernière saisie"
          value={lastRecordDate ? formatDate(lastRecordDate) : "Aucune"}
          accent={isActive && !lastRecordDate ? "orange" : undefined}
        />
        <KpiCard
          label="Lignes de vente"
          value={
            saleItemsCount > 0 ? (
              <Link
                href={`/sales?batchId=${batchId}`}
                className="text-blue-600 hover:underline"
              >
                {saleItemsCount} ligne{saleItemsCount > 1 ? "s" : ""}
              </Link>
            ) : (
              <span className="text-gray-400">Aucune</span>
            )
          }
          sub="Revenus par lot non disponibles au MVP"
        />
      </div>

      {/* ── Rang 3 : finances ─────────────────────────────────────────── */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide pt-1">
        Finances
      </h2>

      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          label="Coût d'achat"
          value={formatMoneyFCFACompact(totalCostFcfa)}
          sub={unitCostFcfa > 0 ? `${formatMoneyFCFA(unitCostFcfa)} / sujet` : undefined}
        />
        <KpiCard
          label="Dépenses opérat."
          value={formatMoneyFCFACompact(totalExpensesFcfa)}
          sub={totalExpensesFcfa === 0 ? "Aucune dépense saisie" : undefined}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-400 mb-0.5">Charges totales</div>
          <div className="text-xl font-bold text-gray-900 tabular-nums">
            {formatMoneyFCFACompact(totalChargesFcfa)}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            Achat + dépenses opérationnelles
          </div>
        </div>
        <div className="text-2xl" aria-hidden>💰</div>
      </div>
    </div>
  )
}
