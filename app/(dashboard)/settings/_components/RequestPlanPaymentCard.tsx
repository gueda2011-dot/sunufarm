"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { ChevronDown, CreditCard } from "lucide-react"
import type { PaymentMethod, SubscriptionPlan } from "@/src/generated/prisma/client"
import { Button } from "@/src/components/ui/button"
import { Input } from "@/src/components/ui/input"

interface RequestPlanPaymentCardProps {
  organizationId: string
  requestedPlan: SubscriptionPlan
  isCurrent: boolean
  recommended?: boolean
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  ESPECES: "Especes",
  VIREMENT: "Virement",
  CHEQUE: "Cheque",
  MOBILE_MONEY: "Mobile Money",
  AUTRE: "Autre",
}

export function RequestPlanPaymentCard({
  organizationId,
  requestedPlan,
  isCurrent,
  recommended = false,
}: RequestPlanPaymentCardProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("MOBILE_MONEY")
  const [paymentReference, setPaymentReference] = useState("")
  const [notes, setNotes] = useState("")
  const [createdTransaction, setCreatedTransaction] = useState<{
    transactionId: string
    checkoutToken: string | null
  } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    startTransition(async () => {
      const response = await fetch("/api/subscriptions/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId,
          requestedPlan,
          paymentMethod,
          paymentReference: paymentReference || undefined,
          notes: notes || undefined,
        }),
      })

      const result = await response.json() as {
        success: boolean
        error?: string
        data?: {
          transactionId: string
          checkoutToken: string | null
        }
      }

      if (result.success) {
        const transactionId = result.data?.transactionId ?? ""
        const checkoutToken = result.data?.checkoutToken ?? null

        setCreatedTransaction({
          transactionId,
          checkoutToken,
        })

        if (paymentMethod === "MOBILE_MONEY" && transactionId) {
          const checkoutResponse = await fetch(`/api/payments/transactions/${transactionId}/checkout`, {
            method: "POST",
          })

          const checkoutResult = await checkoutResponse.json() as {
            success: boolean
            error?: string
            data?: {
              checkoutUrl: string
            }
          }

          if (checkoutResult.success && checkoutResult.data?.checkoutUrl) {
            toast.success("Redirection vers Wave pour finaliser le paiement.")
            window.location.assign(checkoutResult.data.checkoutUrl)
            return
          }

          toast.message(
            checkoutResult.error ??
            "La transaction est creee, mais la redirection Wave n'est pas encore disponible.",
          )
        }

        toast.success(`Demande de paiement envoyee pour ${requestedPlan}.`)
        setPaymentReference("")
        setNotes("")
        router.refresh()
      } else {
        toast.error(result.error ?? "Impossible d'envoyer la demande.")
      }
    })
  }

  if (isCurrent) {
    return (
      <Button variant="outline" className="w-full" disabled>
        Plan actuel
      </Button>
    )
  }

  if (!isOpen) {
    return (
      <Button
        variant={recommended ? "primary" : "secondary"}
        className="w-full"
        onClick={() => setIsOpen(true)}
      >
        <CreditCard className="h-4 w-4" />
        Declarer un paiement
      </Button>
    )
  }

  return (
    <div className="space-y-3 rounded-2xl border border-green-200 bg-green-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-green-900">
          Paiement pour {requestedPlan}
        </p>
        <button
          type="button"
          className="text-green-700"
          onClick={() => setIsOpen(false)}
          aria-label="Fermer le formulaire"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Moyen de paiement
        </label>
        <select
          value={paymentMethod}
          onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <Input
        placeholder="Reference ou numero de transaction"
        value={paymentReference}
        onChange={(event) => setPaymentReference(event.target.value)}
      />

      <textarea
        rows={3}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
        placeholder="Ex: paiement Wave envoye ce matin par le gerant."
      />

      <div className="flex gap-3">
        <Button className="flex-1" onClick={handleSubmit} loading={isPending}>
          Envoyer la preuve
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => setIsOpen(false)}>
          Annuler
        </Button>
      </div>

      {createdTransaction && (
        <div className="rounded-xl border border-green-200 bg-white px-4 py-3 text-sm text-green-900">
          <p className="font-semibold">Trace de transaction creee</p>
          {createdTransaction.checkoutToken && (
            <p className="mt-1">
              Reference securisee:{" "}
              <span className="font-mono text-xs">{createdTransaction.checkoutToken}</span>
            </p>
          )}
          <p className="mt-1 text-xs text-green-800">
            Conservez cette reference. Elle servira au suivi du paiement mobile et a l&apos;automatisation de l&apos;activation.
          </p>
        </div>
      )}
    </div>
  )
}
