/**
 * SunuFarm — KPI cards du tableau de bord global
 *
 * 4 indicateurs en grille 2×2 :
 *   1. Lots actifs + effectif total
 *   2. Charges globales (achat poussins + dépenses)
 *   3. Mortalité cumulée + taux approximatif
 *   4. Lots en alerte saisie
 *
 * Limites MVP documentées :
 *   - Charges : limitées aux 100 dernières dépenses (getExpenses limit:100)
 *   - Mortalité : agrégat sur DailyRecords de l'org, pas limité dans le temps
 *   - Taux mortalité : approximatif (réformes non déduites)
 *   - Revenus / rentabilité : non disponibles (getSales sans filtre batchId)
 */

import {
  formatMoneyFCFACompact,
  formatNumber,
  formatPercent,
} from "@/src/lib/formatters"

// ---------------------------------------------------------------------------
// Sous-composant KpiCard (même pattern que BatchKpis)
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
  accent?: "red" | "orange" | "green" | "default"
}) {
  const valueClass =
    accent === "red"    ? "text-red-600" :
    accent === "orange" ? "text-orange-600" :
    accent === "green"  ? "text-green-700" :
    "text-gray-900"

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-xl font-bold tabular-nums leading-tight ${valueClass}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DashboardKpisProps {
  activeBatchCount:    number
  totalEntryCount:     number
  totalChargesFcfa:    number
  totalMortality:      number
  mortalityRate:       number
  alertCount:          number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DashboardKpis({
  activeBatchCount,
  totalEntryCount,
  totalChargesFcfa,
  totalMortality,
  mortalityRate,
  alertCount,
}: DashboardKpisProps) {
  const mortalityAccent =
    mortalityRate > 2 ? "red" :
    mortalityRate > 1 ? "orange" :
    "green"

  const alertAccent =
    alertCount > 0 ? "orange" : "green"

  return (
    <div className="grid grid-cols-2 gap-3">
      <KpiCard
        label="Lots actifs"
        value={activeBatchCount}
        sub={totalEntryCount > 0 ? `${formatNumber(totalEntryCount)} sujets` : "Aucun sujet"}
      />
      <KpiCard
        label="Charges globales"
        value={formatMoneyFCFACompact(totalChargesFcfa)}
        sub="Achat + dépenses opérat."
      />
      <KpiCard
        label="Mortalité cumulée"
        value={formatNumber(totalMortality)}
        sub={totalEntryCount > 0 ? `${formatPercent(mortalityRate)} des sujets` : "—"}
        accent={totalMortality > 0 ? mortalityAccent : "green"}
      />
      <KpiCard
        label="Alertes saisie"
        value={alertCount === 0 ? "Aucune" : alertCount}
        sub={alertCount === 0 ? "Tout est à jour" : `lot${alertCount > 1 ? "s" : ""} en retard`}
        accent={alertAccent}
      />
    </div>
  )
}
