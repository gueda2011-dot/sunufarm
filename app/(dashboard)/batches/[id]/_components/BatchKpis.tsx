/**
 * SunuFarm — KPI opérationnels du détail d'un lot
 *
 * Limité aux indicateurs de production :
 *   - Effectif vivant (entryCount − mortalité cumulée)
 *   - Mortalité cumulée + taux
 *   - Dernière saisie
 *   - Taux de survie
 *
 * Les KPI financiers (revenus, charges, marge) sont dans ProfitabilityCard,
 * calculés via l'action getBatchProfitability.
 */

import {
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
  liveCount:      number
  totalMortality: number
  mortalityRate:  number
  lastRecordDate: Date | null
  isActive:       boolean
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
          label="Taux survie"
          value={`${formatPercent(100 - mortalityRate)}`}
          accent={mortalityRate > 5 ? "red" : mortalityRate > 2 ? "orange" : "green"}
        />
      </div>
    </div>
  )
}
