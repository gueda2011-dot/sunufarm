"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import type { SubscriptionPlan } from "@/src/generated/prisma/client"
import { Button } from "@/src/components/ui/button"

interface AdminSubscriptionControlProps {
  organizationId: string
  currentPlan: SubscriptionPlan
}

const PLAN_OPTIONS: SubscriptionPlan[] = ["BASIC", "PRO", "BUSINESS"]

export function AdminSubscriptionControl({
  organizationId,
  currentPlan,
}: AdminSubscriptionControlProps) {
  const router = useRouter()
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>(currentPlan)
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    if (selectedPlan === currentPlan) {
      toast.message("Aucun changement a appliquer.")
      return
    }

    startTransition(async () => {
      const response = await fetch(`/api/admin/subscriptions/${organizationId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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

  return (
    <div className="flex min-w-[220px] items-center gap-2">
      <select
        value={selectedPlan}
        onChange={(event) => setSelectedPlan(event.target.value as SubscriptionPlan)}
        className="h-10 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        disabled={isPending}
      >
        {PLAN_OPTIONS.map((plan) => (
          <option key={plan} value={plan}>
            {plan}
          </option>
        ))}
      </select>

      <Button
        size="sm"
        variant="outline"
        onClick={handleSubmit}
        loading={isPending}
      >
        Appliquer
      </Button>
    </div>
  )
}
