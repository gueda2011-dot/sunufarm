import { Lightbulb } from "lucide-react"
import type { BusinessRecommendation } from "@/src/lib/business-dashboard"

function toneClasses(tone: BusinessRecommendation["tone"]) {
  if (tone === "critical") return "border-red-200 bg-red-50"
  if (tone === "warning") return "border-orange-200 bg-orange-50"
  return "border-green-200 bg-green-50"
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
          <h2 className="text-lg font-semibold text-gray-900">Recommandations Business</h2>
          <p className="text-sm text-gray-500">
            Regles simples pour transformer les signaux en decisions de pilotage.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {recommendations.map((recommendation) => (
          <div
            key={recommendation.id}
            className={`rounded-2xl border p-4 ${toneClasses(recommendation.tone)}`}
          >
            <p className="text-sm font-semibold text-gray-900">
              {recommendation.title}
            </p>
            <p className="mt-2 text-sm text-gray-700">
              {recommendation.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
