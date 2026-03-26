"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/src/components/ui/button"

interface PendingPaymentItem {
  id: string
  requestedPlan: string
  amountFcfa: number
  paymentMethod: string
  paymentReference: string | null
  notes: string | null
  requestedAt: Date
  requestedBy: {
    name: string | null
    email: string
  }
}

interface ManageSubscriptionPaymentsProps {
  organizationId: string
  payments: PendingPaymentItem[]
}

export function ManageSubscriptionPayments({
  organizationId,
  payments,
}: ManageSubscriptionPaymentsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleConfirm(paymentId: string) {
    startTransition(async () => {
      const response = await fetch(`/api/subscriptions/payments/${paymentId}/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ organizationId }),
      })
      const result = await response.json() as {
        success: boolean
        error?: string
        data?: { plan: string }
      }

      if (result.success) {
        toast.success(`Plan ${result.data?.plan ?? ""} active.`)
        router.refresh()
      } else {
        toast.error(result.error ?? "Impossible de confirmer ce paiement.")
      }
    })
  }

  function handleReject(paymentId: string) {
    startTransition(async () => {
      const response = await fetch(`/api/subscriptions/payments/${paymentId}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ organizationId }),
      })
      const result = await response.json() as { success: boolean; error?: string }

      if (result.success) {
        toast.success("Paiement refuse.")
        router.refresh()
      } else {
        toast.error(result.error ?? "Impossible de refuser ce paiement.")
      }
    })
  }

  return (
    <div className="space-y-3">
      {payments.map((payment) => (
        <div
          key={payment.id}
          className="rounded-2xl border border-gray-100 bg-white p-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-gray-900">
                {payment.requestedBy.name || payment.requestedBy.email} demande {payment.requestedPlan}
              </p>
              <p className="text-sm text-gray-600">
                {payment.amountFcfa.toLocaleString("fr-SN")} FCFA via {payment.paymentMethod}
              </p>
              {payment.paymentReference && (
                <p className="text-xs text-gray-500">
                  Reference: {payment.paymentReference}
                </p>
              )}
              {payment.notes && (
                <p className="text-xs text-gray-500">{payment.notes}</p>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                className="min-w-[110px]"
                loading={isPending}
                onClick={() => handleConfirm(payment.id)}
              >
                <CheckCircle2 className="h-4 w-4" />
                Confirmer
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="min-w-[110px]"
                disabled={isPending}
                onClick={() => handleReject(payment.id)}
              >
                <XCircle className="h-4 w-4" />
                Refuser
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
