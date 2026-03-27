"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import type { SubscriptionPlan } from "@/src/generated/prisma/client"
import { Button } from "@/src/components/ui/button"
import { adminStartTrial } from "@/src/actions/subscriptions"
import { PLAN_DEFINITIONS } from "@/src/lib/subscriptions"

interface AdminSubscriptionControlProps {
  organizationId: string
  currentPlan: SubscriptionPlan
  currentStatus: string
  trialEndsAt: Date | null
}

const PLAN_OPTIONS: SubscriptionPlan[] = ["BASIC", "PRO", "BUSINESS"]

export function AdminSubscriptionControl({
  organizationId,
  currentPlan,
  currentStatus,
  trialEndsAt,
}: AdminSubscriptionControlProps) {
  const router = useRouter()
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>(currentPlan)
  const [isPending, startTransition] = useTransition()
  const [isTrialPending, startTrialTransition] = useTransition()

  const isTrialActive =
    currentStatus === "TRIAL" &&
    trialEndsAt !== null &&
    new Date(trialEndsAt) > new Date()

  function handleSubmit() {
    if (selectedPlan === currentPlan && currentStatus !== "TRIAL") {
      toast.message("Aucun changement a appliquer.")
      return
    }

    startTransition(async () => {
      const response = await fetch(`/api/admin/subscriptions/${organizationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan }),
      })

      const result = await response.json() as {
        success: boolean
        error?: string
        data?: { plan: SubscriptionPlan }
      }

      if (result.success) {
        toast.success(`Plan mis a jour vers ${result.data?.plan ?? selectedPlan}.`)
        router.refresh()
      } else {
        toast.error(result.error ?? "Impossible de mettre a jour le plan.")
      }
    })
  }

  function handleStartTrial() {
    startTrialTransition(async () => {
      const result = await adminStartTrial({ organizationId })

      if (result.success) {
        const endsAt = new Date(result.data.trialEndsAt)
        toast.success(`Essai de 7 jours démarré. Expire le ${endsAt.toLocaleDateString("fr-FR")}.`)
        router.refresh()
      } else {
        toast.error(result.error ?? "Impossible de démarrer l'essai.")
      }
    })
  }

  const anyPending = isPending || isTrialPending

  return (
    <div className="flex min-w-[260px] flex-col gap-2">
      <div className="flex items-center gap-2">
        <select
          value={selectedPlan}
          onChange={(event) => setSelectedPlan(event.target.value as SubscriptionPlan)}
          className="h-10 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          disabled={anyPending}
        >
          {PLAN_OPTIONS.map((plan) => (
            <option key={plan} value={plan}>
              {PLAN_DEFINITIONS[plan].label} - {PLAN_DEFINITIONS[plan].monthlyPriceFcfa.toLocaleString("fr-FR")} FCFA
            </option>
          ))}
        </select>

        <Button
          size="sm"
          variant="outline"
          onClick={handleSubmit}
          loading={isPending}
          disabled={anyPending}
        >
          Appliquer
        </Button>
      </div>

      <Button
        size="sm"
        variant="outline"
        onClick={handleStartTrial}
        loading={isTrialPending}
        disabled={anyPending}
        className={
          isTrialActive
            ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
            : "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100"
        }
      >
        {isTrialActive
          ? `Essai actif — relancer 7j`
          : "Démarrer essai 7 jours"}
      </Button>
    </div>
  )
}
