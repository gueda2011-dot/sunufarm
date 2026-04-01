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
  marginVerdict: string
  riskVerdict: string
  stockVerdict: string
  mortalityVerdict: string
}

function KpiCard({
  label,
  verdict,
  value,
  detail,
  tone = "default",
}: {
  label: string
  verdict: string
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
      <p className="mt-2 text-sm font-semibold text-gray-900">
        {verdict}
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
  marginVerdict,
  riskVerdict,
  stockVerdict,
  mortalityVerdict,
}: BusinessKpiGridProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Verdicts cles</h2>
          <p className="mt-1 text-sm text-gray-500">
            Les chiffres restent visibles, mais la lecture métier passe en premier.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Marge globale"
          verdict={marginVerdict}
          value={formatMoneyFCFACompact(totalMarginFcfa)}
          detail={`CA ${formatMoneyFCFACompact(totalRevenueFcfa)} · Couts ${formatMoneyFCFACompact(totalCostsFcfa)}`}
          tone={totalMarginFcfa < 0 ? "red" : totalMarginFcfa < 100_000 ? "orange" : "green"}
        />
        <KpiCard
          label="Lots a risque"
          verdict={riskVerdict}
          value={formatNumber(atRiskBatchCount)}
          detail={`${formatNumber(activeBatchCount)} lots actifs au total`}
          tone={atRiskBatchCount >= 4 ? "red" : atRiskBatchCount > 0 ? "orange" : "green"}
        />
        <KpiCard
          label="Stocks sensibles"
          verdict={stockVerdict}
          value={formatNumber(criticalStockCount)}
          detail="Articles en rupture critique"
          tone={criticalStockCount >= 2 ? "red" : criticalStockCount === 1 ? "orange" : "green"}
        />
        <KpiCard
          label="Lecture sanitaire"
          verdict={mortalityVerdict}
          value={globalMortalityRate == null ? "—" : formatPercent(globalMortalityRate)}
          detail="Taux mortalite sur l'effectif actif"
          tone={globalMortalityRate != null && globalMortalityRate >= 3 ? "red" : globalMortalityRate != null && globalMortalityRate >= 1.5 ? "orange" : "green"}
        />
      </div>
    </section>
  )
}
