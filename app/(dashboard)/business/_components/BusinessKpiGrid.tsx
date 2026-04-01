import {
  formatMoneyFCFACompact,
  formatNumber,
  formatPercent,
} from "@/src/lib/formatters"

interface BusinessKpiGridProps {
  totalRevenueFcfa: number
  totalCostsFcfa: number
  totalMarginFcfa: number
  globalMortalityRate: number | null
  activeBatchCount: number
  atRiskBatchCount: number
  criticalStockCount: number
}

function KpiCard({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string
  value: string
  detail: string
  tone?: "default" | "green" | "orange" | "red"
}) {
  const valueClass =
    tone === "green" ? "text-green-700" :
    tone === "orange" ? "text-orange-600" :
    tone === "red" ? "text-red-600" :
    "text-gray-900"
  const cardClass =
    tone === "green" ? "border-green-200 bg-green-50/60" :
    tone === "orange" ? "border-orange-200 bg-orange-50/60" :
    tone === "red" ? "border-red-200 bg-red-50/60" :
    "border-gray-200 bg-white"

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${cardClass}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${valueClass}`}>
        {value}
      </p>
      <p className="mt-1 text-sm text-gray-500">{detail}</p>
    </div>
  )
}

export function BusinessKpiGrid({
  totalRevenueFcfa,
  totalCostsFcfa,
  totalMarginFcfa,
  globalMortalityRate,
  activeBatchCount,
  atRiskBatchCount,
  criticalStockCount,
}: BusinessKpiGridProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Resume dirigeant</h2>
          <p className="mt-1 text-sm text-gray-500">
            Les indicateurs qui aident a lire vite la sante economique et operationnelle.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Chiffre d'affaires"
        value={formatMoneyFCFACompact(totalRevenueFcfa)}
        detail="Recettes observees des lots actifs"
        tone="green"
      />
      <KpiCard
        label="Couts totaux"
        value={formatMoneyFCFACompact(totalCostsFcfa)}
        detail="Achat des lots + depenses operationnelles"
        tone={totalCostsFcfa > 0 ? "orange" : "default"}
      />
      <KpiCard
        label="Marge totale"
        value={formatMoneyFCFACompact(totalMarginFcfa)}
        detail="Vue consolidee sur les lots actifs"
        tone={totalMarginFcfa < 0 ? "red" : "green"}
      />
      <KpiCard
        label="Mortalite globale"
        value={globalMortalityRate == null ? "—" : formatPercent(globalMortalityRate)}
        detail="Basee sur l'effectif total en cours"
        tone={globalMortalityRate != null && globalMortalityRate >= 2 ? "red" : "default"}
      />
      <KpiCard
        label="Lots actifs"
        value={formatNumber(activeBatchCount)}
        detail="Cycles actuellement en production"
      />
      <KpiCard
        label="Lots a risque"
        value={formatNumber(atRiskBatchCount)}
        detail="Marge fragile ou risque mortalite"
        tone={atRiskBatchCount > 2 ? "red" : atRiskBatchCount > 0 ? "orange" : "green"}
      />
      <KpiCard
        label="Stocks critiques"
        value={formatNumber(criticalStockCount)}
        detail="Articles en rupture critique"
        tone={criticalStockCount > 0 ? "red" : "green"}
      />
      </div>
    </section>
  )
}
