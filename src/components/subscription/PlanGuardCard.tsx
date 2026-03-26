import type { SubscriptionPlan } from "@/src/generated/prisma/client"

interface PlanGuardCardProps {
  title: string
  message: string
  requiredPlan: "Pro" | "Business"
  currentPlan: SubscriptionPlan
}

export function PlanGuardCard({
  title,
  message,
  requiredPlan,
  currentPlan,
}: PlanGuardCardProps) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
        Plan {requiredPlan}
      </p>
      <h2 className="mt-1 text-lg font-semibold text-gray-900">{title}</h2>
      <p className="mt-2 text-sm text-gray-700">{message}</p>
      <p className="mt-3 text-sm font-medium text-amber-800">
        Plan actuel : {currentPlan}
      </p>
    </div>
  )
}
