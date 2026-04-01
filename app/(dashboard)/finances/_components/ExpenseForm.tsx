"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createExpense } from "@/src/actions/expenses"
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card"
import { Input } from "@/src/components/ui/input"
import { Label } from "@/src/components/ui/label"
import { Button } from "@/src/components/ui/button"
import { OfflineSyncCard } from "@/app/(dashboard)/daily/_components/OfflineSyncCard"
import {
  createClientMutationId,
  deleteOfflineDailyQueueItem,
  enqueueOfflineExpense,
  flushOfflineDailyQueue,
  listPendingOfflineQueueItemsByScope,
  readOfflineDailySyncMeta,
  retryOfflineDailyQueueItem,
  subscribeToOfflineDailyQueue,
} from "@/src/lib/offline-mutation-outbox"

interface ExpenseFormProps {
  organizationId: string
}

function isOfflineFailure(error: unknown) {
  return (
    (typeof navigator !== "undefined" && !navigator.onLine) ||
    (error instanceof Error && /fetch|network|offline|failed to fetch/i.test(error.message))
  )
}

export function ExpenseForm({ organizationId }: ExpenseFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [isOnline, setIsOnline] = useState<boolean>(() => (
    typeof navigator === "undefined" ? true : navigator.onLine
  ))
  const [pendingItems, setPendingItems] = useState<Array<{
    id: string
    label: string
    createdAt: string
    status: "pending" | "failed"
    lastError?: string
  }>>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [lastSyncError, setLastSyncError] = useState<string | null>(null)

  const refreshOfflineState = useCallback(async () => {
    const items = await listPendingOfflineQueueItemsByScope("expenses")
    setPendingItems(items)
    const meta = readOfflineDailySyncMeta()
    setLastSyncedAt(meta.lastSyncedAt)
    setLastSyncError(meta.lastError)
  }, [])

  const syncOfflineQueue = useCallback(async () => {
    if (!isOnline || isSyncing) return

    setIsSyncing(true)
    try {
      await flushOfflineDailyQueue()
      await refreshOfflineState()
      router.refresh()
    } finally {
      setIsSyncing(false)
    }
  }, [isOnline, isSyncing, refreshOfflineState, router])

  const retryOfflineItem = useCallback(async (itemId: string) => {
    if (!isOnline || isSyncing) return

    setIsSyncing(true)
    try {
      await retryOfflineDailyQueueItem(itemId)
      await flushOfflineDailyQueue({ itemId })
      await refreshOfflineState()
      router.refresh()
    } finally {
      setIsSyncing(false)
    }
  }, [isOnline, isSyncing, refreshOfflineState, router])

  const removeOfflineItem = useCallback(async (itemId: string) => {
    await deleteOfflineDailyQueueItem(itemId)
    await refreshOfflineState()
  }, [refreshOfflineState])

  useEffect(() => {
    void refreshOfflineState()

    const unsubscribe = subscribeToOfflineDailyQueue(() => {
      void refreshOfflineState()
    })
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      unsubscribe()
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [refreshOfflineState])

  useEffect(() => {
    if (!isOnline || pendingItems.length === 0) return
    void syncOfflineQueue()
  }, [isOnline, pendingItems.length, syncOfflineQueue])

  function handleSubmit(formData: FormData) {
    setError("")
    setSuccess("")

    startTransition(async () => {
      const payload = {
        clientMutationId: createClientMutationId("expense"),
        organizationId,
        description: String(formData.get("description") ?? ""),
        amountFcfa: Number(formData.get("amountFcfa") ?? 0),
        date: String(formData.get("date") ?? ""),
        reference: String(formData.get("reference") ?? "") || undefined,
        notes: String(formData.get("notes") ?? "") || undefined,
      }

      const queueExpense = async () => {
        await enqueueOfflineExpense(payload)
        setSuccess("Depense enregistree hors ligne et mise en attente.")
        await refreshOfflineState()
      }

      try {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          await queueExpense()
          return
        }

        const result = await createExpense(payload)
        if (!result.success) {
          setError(result.error)
          return
        }

        setSuccess("Depense enregistree.")
        router.refresh()
      } catch (submitError) {
        if (!isOfflineFailure(submitError)) {
          throw submitError
        }

        await queueExpense()
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nouvelle depense</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <OfflineSyncCard
          isOnline={isOnline}
          pendingCount={pendingItems.length}
          failedCount={pendingItems.filter((item) => item.status === "failed").length}
          isSyncing={isSyncing}
          lastSyncedAt={lastSyncedAt}
          lastError={lastSyncError}
          items={pendingItems}
          onSync={() => {
            void syncOfflineQueue()
          }}
          onRetryItem={(itemId) => {
            void retryOfflineItem(itemId)
          }}
          onRemoveItem={(itemId) => {
            void removeOfflineItem(itemId)
          }}
        />

        <form action={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="description" required>Description</Label>
            <Input
              id="description"
              name="description"
              placeholder="Ex : Achat d'aliment"
            />
          </div>

          <div>
            <Label htmlFor="amountFcfa" required>Montant (FCFA)</Label>
            <Input
              id="amountFcfa"
              name="amountFcfa"
              type="number"
              min="1"
              step="1"
              placeholder="50000"
            />
          </div>

          <div>
            <Label htmlFor="date" required>Date</Label>
            <Input
              id="date"
              name="date"
              type="date"
            />
          </div>

          <div>
            <Label htmlFor="reference">Reference</Label>
            <Input
              id="reference"
              name="reference"
              placeholder="Facture, BL, recu..."
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              name="notes"
              className="min-h-[90px] w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-green-600"
              placeholder="Details complementaires"
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {success ? <p className="text-sm text-green-600">{success}</p> : null}

          <Button type="submit" className="w-full" loading={isPending}>
            Ajouter la depense
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
