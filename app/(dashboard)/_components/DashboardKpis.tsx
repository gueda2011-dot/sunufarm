/**
 * SunuFarm - KPI cards du tableau de bord global
 *
 * 6 indicateurs en grille 2 colonnes :
 *   1. Lots actifs + effectif total
 *   2. Charges globales (cout lots + achats + autres depenses)
 *   3. Argent sorti
 *   4. Reste a payer fournisseurs
 *   5. Mortalite cumulee + taux approximatif
 *   6. Lots en alerte saisie
 */

import {
  formatMoneyFCFACompact,
  formatNumber,
  formatPercent,
} from "@/src/lib/formatters"

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: React.ReactNode
  sub?: string
  accent?: "red" | "orange" | "green" | "default"
}) {
  const valueClass =
    accent === "red" ? "text-red-600" :
    accent === "orange" ? "text-orange-600" :
    accent === "green" ? "text-green-700" :
    "text-gray-900"

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-1 text-xs text-gray-400">{label}</div>
      <div className={`text-xl font-bold leading-tight tabular-nums ${valueClass}`}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-gray-400">{sub}</div> : null}
    </div>
  )
}

interface DashboardKpisProps {
  activeBatchCount: number
  totalEntryCount: number
  totalChargesFcfa: number
  totalCashOutFcfa: number
  totalPurchasesFcfa: number
  totalOtherExpensesFcfa: number
  totalSupplierBalanceFcfa: number
  totalMortality: number
  mortalityRate: number
  alertCount: number
}

export function DashboardKpis({
  activeBatchCount,
  totalEntryCount,
  totalChargesFcfa,
  totalCashOutFcfa,
  totalPurchasesFcfa,
  totalOtherExpensesFcfa,
  totalSupplierBalanceFcfa,
  totalMortality,
  mortalityRate,
  alertCount,
}: DashboardKpisProps) {
  const mortalityAccent =
    mortalityRate > 2 ? "red" :
    mortalityRate > 1 ? "orange" :
    "green"

  const alertAccent = alertCount > 0 ? "orange" : "green"

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
        sub={`Achats ${formatMoneyFCFACompact(totalPurchasesFcfa)} • Depenses ${formatMoneyFCFACompact(totalOtherExpensesFcfa)}`}
      />
      <KpiCard
        label="Argent sorti"
        value={formatMoneyFCFACompact(totalCashOutFcfa)}
        sub="Sorties deja payees"
      />
      <KpiCard
        label="Reste a payer"
        value={formatMoneyFCFACompact(totalSupplierBalanceFcfa)}
        sub="Dettes fournisseurs"
        accent={totalSupplierBalanceFcfa > 0 ? "orange" : "green"}
      />
      <KpiCard
        label="Mortalite cumulee"
        value={formatNumber(totalMortality)}
        sub={totalEntryCount > 0 ? `${formatPercent(mortalityRate)} des sujets` : "-"}
        accent={totalMortality > 0 ? mortalityAccent : "green"}
      />
      <KpiCard
        label="Alertes saisie"
        value={alertCount === 0 ? "Aucune" : alertCount}
        sub={alertCount === 0 ? "Tout est a jour" : `lot${alertCount > 1 ? "s" : ""} en retard`}
        accent={alertAccent}
      />
    </div>
  )
}
