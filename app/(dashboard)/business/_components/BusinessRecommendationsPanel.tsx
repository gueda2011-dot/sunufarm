import { Lightbulb } from "lucide-react"
import type { BusinessRecommendation } from "@/src/lib/business-dashboard"

function toneClasses(tone: BusinessRecommendation["tone"]) {
  if (tone === "critical") return "border-red-200 bg-red-50"
  if (tone === "warning") return "border-orange-200 bg-orange-50"
  return "border-green-200 bg-green-50"
}

function priorityLabel(priority: number) {
  if (priority <= 1) return "Maintenant"
  if (priority === 2) return "Cette semaine"
  return "Suivi"
}

export function BusinessRecommendationsPanel({
  recommendations,
}: {
  recommendations: BusinessRecommendation[]
}) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-green-50 p-2 text-green-700">
          <Lightbulb className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Plan d&apos;action recommande</h2>
          <p className="text-sm text-gray-500">
            Une lecture plus actionnable des decisions a prendre, triees par urgence.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {recommendations.map((recommendation) => (
          <div
            key={recommendation.id}
            className={`rounded-2xl border p-4 ${toneClasses(recommendation.tone)}`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {priorityLabel(recommendation.priority)}
              </p>
              <span className="rounded-full border border-white/70 bg-white/70 px-2 py-0.5 text-xs font-medium text-gray-700">
                Priorite {recommendation.priority}
              </span>
            </div>

            <p className="mt-3 text-base font-semibold text-gray-900">
              {recommendation.title}
            </p>

            <div className="mt-3 rounded-xl border border-white/70 bg-white/70 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Action immediate
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {recommendation.action}
              </p>
            </div>

            <p className="mt-3 text-sm text-gray-700">
              {recommendation.description}
            </p>

            {recommendation.affectedItems.length > 0 && (
              <p className="mt-3 text-xs text-gray-600">
                Concerne : {recommendation.affectedItems.join(", ")}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
