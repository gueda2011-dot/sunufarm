export interface MetricComparison {
  current: number
  previous: number
  delta: number
  deltaPercent: number | null
  trend: "up" | "down" | "flat"
}

export function buildMetricComparison(current: number, previous: number): MetricComparison {
  const delta = current - previous
  const trend = delta > 0 ? "up" : delta < 0 ? "down" : "flat"
  const deltaPercent = previous === 0
    ? (current === 0 ? 0 : null)
    : (delta / previous) * 100

  return {
    current,
    previous,
    delta,
    deltaPercent,
    trend,
  }
}

export function formatTrendLabel(
  comparison: MetricComparison,
  positiveDirection: "up" | "down" = "up",
): string {
  if (comparison.trend === "flat") {
    return "Stable par rapport au mois precedent"
  }

  const directionIsPositive = comparison.trend === positiveDirection
  const prefix = directionIsPositive ? "Evolution favorable" : "Attention"

  if (comparison.deltaPercent === null) {
    return `${prefix} par rapport au mois precedent`
  }

  return `${prefix} : ${Math.abs(comparison.deltaPercent).toFixed(1)}% vs mois precedent`
}
