"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type {
  FeedStockSummary,
  MedicineStockSummary,
} from "@/src/actions/stock"
import {
  createFeedMovement,
  createMedicineMovement,
} from "@/src/actions/stock"
import { OfflineSyncCard } from "@/app/(dashboard)/daily/_components/OfflineSyncCard"
import {
  createClientMutationId,
  deleteOfflineQueueItem,
  enqueueOfflineFeedMovement,
  enqueueOfflineMedicineMovement,
  flushOfflineMutationOutbox,
  listPendingOfflineQueueItemsByScope,
  readOfflineSyncMeta,
  retryOfflineQueueItem,
  subscribeToOfflineMutationOutbox,
} from "@/src/lib/offline-mutation-outbox"

type StockTab = "ALIMENT" | "MEDICAMENT"

interface StockMovementPanelProps {
  organizationId: string
  tab: StockTab
  canCreateMovement: boolean
  feedStocks: FeedStockSummary[]
  medicineStocks: MedicineStockSummary[]
  batches: Array<{
    id: string
    number: string
  }>
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function isOfflineFailure(error: unknown) {
  return (
    (typeof navigator !== "undefined" && !navigator.onLine) ||
    (error instanceof Error && /fetch|network|offline|failed to fetch/i.test(error.message))
  )
}

export function StockMovementPanel({
  organizationId,
  tab,
  canCreateMovement,
  feedStocks,
  medicineStocks,
  batches,
}: StockMovementPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState<boolean>(() => (
    typeof navigator === "undefined" ? true : navigator.onLine
  ))
  const [pendingItems, setPendingItems] = useState<Array<{
    id: string
    label: string
    createdAt: string
    status: "pending" | "syncing" | "failed" | "conflict"
    type?: string
    scope?: string
    payload?: unknown
    lastError?: string
  }>>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [lastSyncError, setLastSyncError] = useState<string | null>(null)

  const [feedStockId, setFeedStockId] = useState("")
  const [feedMovementType, setFeedMovementType] = useState<"ENTREE" | "SORTIE" | "INVENTAIRE" | "AJUSTEMENT">("ENTREE")
  const [feedQuantityKg, setFeedQuantityKg] = useState("")
  const [feedUnitPriceFcfa, setFeedUnitPriceFcfa] = useState("")
  const [feedBatchId, setFeedBatchId] = useState("")
  const [feedReference, setFeedReference] = useState("")
  const [feedNotes, setFeedNotes] = useState("")
  const [feedDate, setFeedDate] = useState(todayStr())

  const [medicineStockId, setMedicineStockId] = useState("")
  const [medicineMovementType, setMedicineMovementType] = useState<"ENTREE" | "SORTIE" | "PEREMPTION" | "INVENTAIRE">("ENTREE")
  const [medicineQuantity, setMedicineQuantity] = useState("")
  const [medicineUnitPriceFcfa, setMedicineUnitPriceFcfa] = useState("")
  const [medicineBatchId, setMedicineBatchId] = useState("")
  const [medicineReference, setMedicineReference] = useState("")
  const [medicineNotes, setMedicineNotes] = useState("")
  const [medicineDate, setMedicineDate] = useState(todayStr())

  const refreshOfflineState = useCallback(async () => {
    const items = await listPendingOfflineQueueItemsByScope("stock")
    setPendingItems(items)
    const meta = readOfflineSyncMeta()
    setLastSyncedAt(meta.lastSyncedAt)
    setLastSyncError(meta.lastError)
  }, [])

  const syncOfflineQueue = useCallback(async () => {
    if (!isOnline || isSyncing) return

    setIsSyncing(true)
    try {
      await flushOfflineMutationOutbox()
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
      await retryOfflineQueueItem(itemId)
      await flushOfflineMutationOutbox({ itemId })
      await refreshOfflineState()
      router.refresh()
    } finally {
      setIsSyncing(false)
    }
  }, [isOnline, isSyncing, refreshOfflineState, router])

  const removeOfflineItem = useCallback(async (itemId: string) => {
    await deleteOfflineQueueItem(itemId)
    await refreshOfflineState()
  }, [refreshOfflineState])

  useEffect(() => {
    void refreshOfflineState()

    const unsubscribe = subscribeToOfflineMutationOutbox(() => {
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

  if (!canCreateMovement && pendingItems.length === 0 && !lastSyncError) {
    return null
  }

  function resetFeedForm() {
    setFeedStockId("")
    setFeedMovementType("ENTREE")
    setFeedQuantityKg("")
    setFeedUnitPriceFcfa("")
    setFeedBatchId("")
    setFeedReference("")
    setFeedNotes("")
    setFeedDate(todayStr())
  }

  function resetMedicineForm() {
    setMedicineStockId("")
    setMedicineMovementType("ENTREE")
    setMedicineQuantity("")
    setMedicineUnitPriceFcfa("")
    setMedicineBatchId("")
    setMedicineReference("")
    setMedicineNotes("")
    setMedicineDate(todayStr())
  }

  function submitFeedMovement() {
    setError(null)
    setSuccess(null)

    startTransition(async () => {
      const payload = {
        clientMutationId: createClientMutationId("feed-movement"),
        organizationId,
        feedStockId,
        type: feedMovementType,
        quantityKg: Number(feedQuantityKg),
        unitPriceFcfa: feedUnitPriceFcfa ? Number(feedUnitPriceFcfa) : undefined,
        batchId: feedBatchId || undefined,
        reference: feedReference || undefined,
        notes: feedNotes || undefined,
        date: new Date(`${feedDate}T00:00:00Z`).toISOString(),
      }

      const queueMovement = async () => {
        await enqueueOfflineFeedMovement(payload)
        setSuccess("Mouvement aliment enregistre hors ligne et mis en attente.")
        resetFeedForm()
        await refreshOfflineState()
      }

      try {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          await queueMovement()
          return
        }

        const result = await createFeedMovement({
          ...payload,
          date: new Date(payload.date),
        })
        if (!result.success) {
          setError(result.error)
          return
        }

        setSuccess("Mouvement aliment enregistre.")
        resetFeedForm()
        router.refresh()
      } catch (submitError) {
        if (!isOfflineFailure(submitError)) {
          throw submitError
        }
        await queueMovement()
      }
    })
  }

  function submitMedicineMovement() {
    setError(null)
    setSuccess(null)

    startTransition(async () => {
      const payload = {
        clientMutationId: createClientMutationId("medicine-movement"),
        organizationId,
        medicineStockId,
        type: medicineMovementType,
        quantity: Number(medicineQuantity),
        unitPriceFcfa: medicineUnitPriceFcfa ? Number(medicineUnitPriceFcfa) : undefined,
        batchId: medicineBatchId || undefined,
        reference: medicineReference || undefined,
        notes: medicineNotes || undefined,
        date: new Date(`${medicineDate}T00:00:00Z`).toISOString(),
      }

      const queueMovement = async () => {
        await enqueueOfflineMedicineMovement(payload)
        setSuccess("Mouvement medicament enregistre hors ligne et mis en attente.")
        resetMedicineForm()
        await refreshOfflineState()
      }

      try {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          await queueMovement()
          return
        }

        const result = await createMedicineMovement({
          ...payload,
          date: new Date(payload.date),
        })
        if (!result.success) {
          setError(result.error)
          return
        }

        setSuccess("Mouvement medicament enregistre.")
        resetMedicineForm()
        router.refresh()
      } catch (submitError) {
        if (!isOfflineFailure(submitError)) {
          throw submitError
        }
        await queueMovement()
      }
    })
  }

  return (
    <div className="space-y-4">
      <OfflineSyncCard
        isOnline={isOnline}
        pendingCount={pendingItems.length}
        failedCount={pendingItems.filter((item) => item.status === "failed" || item.status === "conflict").length}
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

      {canCreateMovement ? (
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          {tab === "ALIMENT" ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Nouveau mouvement d&apos;aliment</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Enregistre une entree, une sortie, un inventaire ou un ajustement de stock.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Article</label>
                  <select
                    value={feedStockId}
                    onChange={(event) => setFeedStockId(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  >
                    <option value="">Selectionner</option>
                    {feedStocks.map((stock) => (
                      <option key={stock.id} value={stock.id}>{stock.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Type</label>
                  <select
                    value={feedMovementType}
                    onChange={(event) => setFeedMovementType(event.target.value as typeof feedMovementType)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  >
                    <option value="ENTREE">Entree</option>
                    <option value="SORTIE">Sortie</option>
                    <option value="INVENTAIRE">Inventaire</option>
                    <option value="AJUSTEMENT">Ajustement</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Quantite (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={feedQuantityKg}
                    onChange={(event) => setFeedQuantityKg(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Date</label>
                  <input
                    type="date"
                    value={feedDate}
                    onChange={(event) => setFeedDate(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Prix unitaire</label>
                  <input
                    type="number"
                    min="0"
                    value={feedUnitPriceFcfa}
                    onChange={(event) => setFeedUnitPriceFcfa(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Lot</label>
                  <select
                    value={feedBatchId}
                    onChange={(event) => setFeedBatchId(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  >
                    <option value="">Aucun lot</option>
                    {batches.map((batch) => (
                      <option key={batch.id} value={batch.id}>{batch.number}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Reference</label>
                  <input
                    value={feedReference}
                    onChange={(event) => setFeedReference(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  />
                </div>
                <div className="lg:col-span-4">
                  <label className="text-sm font-medium text-gray-700">Notes</label>
                  <textarea
                    rows={3}
                    value={feedNotes}
                    onChange={(event) => setFeedNotes(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  />
                </div>
              </div>

              {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
              {success ? <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{success}</div> : null}

              <button
                type="button"
                onClick={submitFeedMovement}
                disabled={isPending}
                className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
              >
                {isPending ? "Enregistrement..." : "Enregistrer le mouvement"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Nouveau mouvement de medicament</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Enregistre une entree, une sortie, une peremption ou un inventaire.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Article</label>
                  <select
                    value={medicineStockId}
                    onChange={(event) => setMedicineStockId(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  >
                    <option value="">Selectionner</option>
                    {medicineStocks.map((stock) => (
                      <option key={stock.id} value={stock.id}>{stock.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Type</label>
                  <select
                    value={medicineMovementType}
                    onChange={(event) => setMedicineMovementType(event.target.value as typeof medicineMovementType)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  >
                    <option value="ENTREE">Entree</option>
                    <option value="SORTIE">Sortie</option>
                    <option value="PEREMPTION">Peremption</option>
                    <option value="INVENTAIRE">Inventaire</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Quantite</label>
                  <input
                    type="number"
                    step="0.01"
                    value={medicineQuantity}
                    onChange={(event) => setMedicineQuantity(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Date</label>
                  <input
                    type="date"
                    value={medicineDate}
                    onChange={(event) => setMedicineDate(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Prix unitaire</label>
                  <input
                    type="number"
                    min="0"
                    value={medicineUnitPriceFcfa}
                    onChange={(event) => setMedicineUnitPriceFcfa(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Lot</label>
                  <select
                    value={medicineBatchId}
                    onChange={(event) => setMedicineBatchId(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  >
                    <option value="">Aucun lot</option>
                    {batches.map((batch) => (
                      <option key={batch.id} value={batch.id}>{batch.number}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Reference</label>
                  <input
                    value={medicineReference}
                    onChange={(event) => setMedicineReference(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  />
                </div>
                <div className="lg:col-span-4">
                  <label className="text-sm font-medium text-gray-700">Notes</label>
                  <textarea
                    rows={3}
                    value={medicineNotes}
                    onChange={(event) => setMedicineNotes(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  />
                </div>
              </div>

              {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
              {success ? <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{success}</div> : null}

              <button
                type="button"
                onClick={submitMedicineMovement}
                disabled={isPending}
                className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
              >
                {isPending ? "Enregistrement..." : "Enregistrer le mouvement"}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
