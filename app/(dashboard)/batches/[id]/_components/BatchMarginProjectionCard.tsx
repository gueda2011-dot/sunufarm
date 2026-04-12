import type { BatchMarginProjection } from "@/src/lib/predictive-margin-rules"
import type { MarginTrendResult } from "@/src/lib/predictive-snapshots"
import { formatMoneyFCFACompact, formatPercent } from "@/src/lib/formatters"

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ")
}

function getAlertStyles(level: BatchMarginProjection["alertLevel"]) {
  switch (level) {
    case "critical":
      return {
        card: "border-red-200 bg-red-50",
        chip: "bg-red-100 text-red-700",
        value: "text-red-700",
      }
    case "warning":
      return {
        card: "border-orange-200 bg-orange-50",
        chip: "bg-orange-100 text-orange-700",
        value: "text-orange-700",
      }
    default:
      return {
        card: "border-emerald-200 bg-emerald-50",
        chip: "bg-emerald-100 text-emerald-700",
        value: "text-emerald-700",
      }
  }
}

function getTrendBadge(trend: MarginTrendResult) {
  if (trend.trend === "unknown") return null
  if (trend.trend === "improving") {
    return { label: "↑ S'ameliore", cls: "bg-emerald-100 text-emerald-700" }
  }
  if (trend.trend === "degrading") {
    return { label: "↓ Se degrade", cls: "bg-red-100 text-red-700" }
  }
  return { label: "→ Stable", cls: "bg-gray-100 text-gray-600" }
}

export function BatchMarginProjectionCard({
  prediction,
  trend,
}: {
  prediction: BatchMarginProjection
  trend: MarginTrendResult
}) {
  const styles = getAlertStyles(prediction.alertLevel)
  const trendBadge = getTrendBadge(trend)

  return (
    <section id="alerte-marge" className={cn("rounded-2xl border p-4", styles.card)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">Projection marge finale</p>
          <p className="mt-1 text-sm text-gray-600">{prediction.summary}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", styles.chip)}>
            {prediction.label}
          </span>
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-200">
            Confiance {prediction.confidence}
          </span>
          {trendBadge ? (
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", trendBadge.cls)} title="Tendance sur 7 jours">
              {trendBadge.label}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-white/80 px-3 py-3">
          <div className="text-xs text-gray-500">Marge projetee</div>
          <div className={cn("mt-1 text-2xl font-bold", styles.value)}>
            {formatMoneyFCFACompact(prediction.projectedProfitFcfa)}
          </div>
          <div className="mt-1 text-xs text-gray-500">{formatPercent(prediction.projectedMarginRate)}</div>
        </div>
        <div className="rounded-xl bg-white/80 px-3 py-3">
          <div className="text-xs text-gray-500">Revenus projetes</div>
          <div className="mt-1 text-lg font-semibold text-gray-900">
            {formatMoneyFCFACompact(prediction.projectedRevenueFcfa)}
          </div>
        </div>
        <div className="rounded-xl bg-white/80 px-3 py-3">
          <div className="text-xs text-gray-500">Charges projetees</div>
          <div className="mt-1 text-lg font-semibold text-gray-900">
            {formatMoneyFCFACompact(prediction.projectedTotalCostFcfa)}
          </div>
        </div>
        <div className="rounded-xl bg-white/80 px-3 py-3">
          <div className="text-xs text-gray-500">Jours restants</div>
          <div className="mt-1 text-lg font-semibold text-gray-900">
            {prediction.metrics.remainingDays}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-white/80 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Hypotheses</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {prediction.reasons.slice(0, 4).map((reason) => (
            <span key={reason} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200">
              {reason}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
