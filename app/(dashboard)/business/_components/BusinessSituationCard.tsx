function toneClasses(level: "critical" | "warning" | "ok") {
  if (level === "critical") return "border-red-200 bg-red-50"
  if (level === "warning") return "border-orange-200 bg-orange-50"
  return "border-green-200 bg-green-50"
}

function scoreClasses(score: number) {
  if (score < 45) return "text-red-600"
  if (score < 75) return "text-orange-600"
  return "text-green-700"
}

export function BusinessSituationCard({
  level,
  label,
  headline,
  summary,
  primaryAction,
  score,
}: {
  level: "critical" | "warning" | "ok"
  label: string
  headline: string
  summary: string
  primaryAction: string
  score: number
}) {
  return (
    <section className={`rounded-3xl border p-5 shadow-sm ${toneClasses(level)}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
            {label}
          </p>
          <h2 className="mt-2 text-2xl font-bold text-gray-900">
            {headline}
          </h2>
          <p className="mt-2 text-sm text-gray-700">
            {summary}
          </p>
          <div className="mt-4 rounded-2xl border border-white/60 bg-white/70 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Priorite d&apos;action
            </p>
            <p className="mt-1 text-sm font-medium text-gray-900">
              {primaryAction}
            </p>
          </div>
        </div>

        <div className="w-full max-w-xs rounded-2xl border border-white/60 bg-white/80 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Score exploitation
          </p>
          <p className={`mt-2 text-4xl font-bold tabular-nums ${scoreClasses(score)}`}>
            {score}/100
          </p>
          <p className="mt-2 text-sm text-gray-600">
            Indicateur synthetique de vigilance construit a partir de la marge, des lots a risque et des ruptures critiques.
          </p>
        </div>
      </div>
    </section>
  )
}
