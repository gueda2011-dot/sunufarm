import type { SubscriptionPlan } from "@/src/generated/prisma/client"

interface PlanGuardCardProps {
  title: string
  message: string
  requiredPlan: "Pro" | "Business"
  currentPlan: SubscriptionPlan
  highlights?: string[]
  footerHint?: string
}

export function PlanGuardCard({
  title,
  message,
  requiredPlan,
  currentPlan,
  highlights = [],
  footerHint,
}: PlanGuardCardProps) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
        Plan {requiredPlan}
      </p>
      <h2 className="mt-1 text-lg font-semibold text-gray-900">{title}</h2>
      <p className="mt-2 text-sm text-gray-700">{message}</p>
      {highlights.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm text-gray-700">
          {highlights.map((highlight) => (
            <li key={highlight} className="rounded-xl border border-amber-100 bg-white/70 px-3 py-2">
              {highlight}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-sm font-medium text-amber-800">
        Plan actuel : {currentPlan}
      </p>
      {footerHint && (
        <p className="mt-2 text-xs text-amber-700">{footerHint}</p>
      )}
    </div>
  )
}
