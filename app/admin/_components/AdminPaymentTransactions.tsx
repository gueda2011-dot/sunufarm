"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckCircle2, Search, XCircle } from "lucide-react"
import { Button } from "@/src/components/ui/button"
import { Input } from "@/src/components/ui/input"

interface AdminPaymentTransactionItem {
  id: string
  provider: string
  status: string
  requestedPlan: string
  amountFcfa: number
  checkoutToken: string | null
  providerReference: string | null
  createdAt: Date
  organization: {
    id: string
    name: string
  }
  user: {
    name: string | null
    email: string
  }
}

interface AdminPaymentTransactionsProps {
  transactions: AdminPaymentTransactionItem[]
}

export function AdminPaymentTransactions({
  transactions,
}: AdminPaymentTransactionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [query, setQuery] = useState("")
  const [providerFilter, setProviderFilter] = useState("ALL")
  const [statusFilter, setStatusFilter] = useState("ALL")

  const providers = useMemo(() => (
    Array.from(new Set(transactions.map((transaction) => transaction.provider)))
  ), [transactions])

  const statuses = useMemo(() => (
    Array.from(new Set(transactions.map((transaction) => transaction.status)))
  ), [transactions])

  const filteredTransactions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return transactions.filter((transaction) => {
      const matchesProvider =
        providerFilter === "ALL" || transaction.provider === providerFilter

      const matchesStatus =
        statusFilter === "ALL" || transaction.status === statusFilter

      const haystack = [
        transaction.organization.name,
        transaction.user.name ?? "",
        transaction.user.email,
        transaction.requestedPlan,
        transaction.checkoutToken ?? "",
        transaction.providerReference ?? "",
      ].join(" ").toLowerCase()

      const matchesQuery =
        normalizedQuery.length === 0 || haystack.includes(normalizedQuery)

      return matchesProvider && matchesStatus && matchesQuery
    })
  }, [providerFilter, query, statusFilter, transactions])

  function handleConfirm(transactionId: string) {
    startTransition(async () => {
      const response = await fetch(`/api/admin/payments/transactions/${transactionId}/confirm`, {
        method: "POST",
      })
      const result = await response.json() as {
        success: boolean
        error?: string
      }

      if (result.success) {
        toast.success("Transaction confirmee et abonnement active.")
        router.refresh()
      } else {
        toast.error(result.error ?? "Impossible de confirmer cette transaction.")
      }
    })
  }

  function handleReject(transactionId: string) {
    startTransition(async () => {
      const response = await fetch(`/api/admin/payments/transactions/${transactionId}/reject`, {
        method: "POST",
      })
      const result = await response.json() as {
        success: boolean
        error?: string
      }

      if (result.success) {
        toast.success("Transaction refusee.")
        router.refresh()
      } else {
        toast.error(result.error ?? "Impossible de refuser cette transaction.")
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 lg:grid-cols-[1.4fr_0.8fr_0.8fr]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher organisation, client ou reference"
            className="pl-10"
          />
        </div>

        <select
          value={providerFilter}
          onChange={(event) => setProviderFilter(event.target.value)}
          className="h-[52px] rounded-xl border border-gray-300 bg-white px-4 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-600"
        >
          <option value="ALL">Tous les providers</option>
          {providers.map((provider) => (
            <option key={provider} value={provider}>
              {provider}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-[52px] rounded-xl border border-gray-300 bg-white px-4 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-600"
        >
          <option value="ALL">Tous les statuts</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      {filteredTransactions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
          Aucune transaction ne correspond a ces filtres.
        </div>
      ) : filteredTransactions.map((transaction) => (
        <div
          key={transaction.id}
          className="rounded-2xl border border-gray-100 bg-white p-4"
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-gray-900">
                {transaction.organization.name} · {transaction.requestedPlan}
              </p>
              <p className="text-sm text-gray-600">
                {transaction.amountFcfa.toLocaleString("fr-SN")} FCFA · {transaction.provider}
              </p>
              <p className="text-xs text-gray-500">
                Client: {transaction.user.name || transaction.user.email}
              </p>
              {transaction.checkoutToken && (
                <p className="text-xs text-gray-500">
                  Checkout token: <span className="font-mono">{transaction.checkoutToken}</span>
                </p>
              )}
              {transaction.providerReference && (
                <p className="text-xs text-gray-500">
                  Reference provider: {transaction.providerReference}
                </p>
              )}
              <p className="text-xs text-gray-500">
                Statut technique: {transaction.status}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                className="min-w-[120px]"
                loading={isPending}
                onClick={() => handleConfirm(transaction.id)}
              >
                <CheckCircle2 className="h-4 w-4" />
                Confirmer
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="min-w-[120px]"
                disabled={isPending}
                onClick={() => handleReject(transaction.id)}
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
