"use client"

import { useState, useCallback, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getDailyRecords } from "@/src/actions/daily-records"
import type { BatchSummary } from "@/src/actions/batches"
import type { DailyRecordDetail } from "@/src/actions/daily-records"
import { DailyForm } from "./DailyForm"
import { RecentRecords } from "./RecentRecords"
import { OfflineSyncCard } from "./OfflineSyncCard"
import {
  deleteOfflineDailyQueueItem,
  flushOfflineDailyQueue,
  listPendingOfflineQueueItemsByScope,
  readOfflineDailySyncMeta,
  retryOfflineDailyQueueItem,
  subscribeToOfflineDailyQueue,
} from "@/src/lib/offline-mutation-outbox"

function todayStr(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function computeAgeDay(batch: BatchSummary, dateStr: string): number {
  const entryMs = new Date(batch.entryDate).getTime()
  const selectedMs = new Date(`${dateStr}T00:00:00Z`).getTime()
  const diffDays = Math.max(0, Math.floor((selectedMs - entryMs) / 86_400_000))
  return batch.entryAgeDay + diffDays
}

function recordMatchesDate(record: DailyRecordDetail, dateStr: string): boolean {
  return new Date(record.date).toISOString().substring(0, 10) === dateStr
}

const MANAGER_OR_ABOVE = ["SUPER_ADMIN", "OWNER", "MANAGER"] as const

interface DailyEntryClientProps {
  organizationId: string
  userRole: string
  initialBatches: BatchSummary[]
  initialFeedStocks: Array<{
    id: string
    farmId: string
    name: string
    quantityKg: number
  }>
  defaultBatchId?: string
}

export function DailyEntryClient({
  organizationId,
  userRole,
  initialBatches,
  initialFeedStocks,
  defaultBatchId,
}: DailyEntryClientProps) {
  const queryClient = useQueryClient()
  const canEditLocked = MANAGER_OR_ABOVE.includes(
    userRole as (typeof MANAGER_OR_ABOVE)[number],
  )
  const [isOnline, setIsOnline] = useState<boolean>(() => (
    typeof navigator === "undefined" ? true : navigator.onLine
  ))
  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  const [failedSyncCount, setFailedSyncCount] = useState(0)
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

  const [selectedBatchId, setSelectedBatchId] = useState<string>(() => {
    if (defaultBatchId && initialBatches.some((batch) => batch.id === defaultBatchId)) {
      return defaultBatchId
    }

    return initialBatches.length === 1 ? initialBatches[0].id : ""
  })
  const [selectedDate, setSelectedDate] = useState<string>(todayStr())
  const [isEditMode, setIsEditMode] = useState(false)
  const [editingRecord, setEditingRecord] = useState<DailyRecordDetail | null>(null)

  const selectedBatch = initialBatches.find((batch) => batch.id === selectedBatchId)

  const { data: recentRecords = [], isLoading: loadingRecords } = useQuery({
    queryKey: ["dailyRecords", organizationId, selectedBatchId],
    queryFn: async () => {
      if (!selectedBatchId) return []

      const result = await getDailyRecords({
        organizationId,
        batchId: selectedBatchId,
        limit: 14,
      })

      return result.success ? result.data : []
    },
    enabled: !!selectedBatchId,
    staleTime: 60_000,
  })

  const existingRecord = recentRecords.find((record) => recordMatchesDate(record, selectedDate))
  const isLocked = !!(existingRecord?.isLocked && !canEditLocked)

  const handleSuccess = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["dailyRecords", organizationId, selectedBatchId],
    })
    setIsEditMode(false)
    setEditingRecord(null)
  }, [organizationId, queryClient, selectedBatchId])

  const refreshOfflineState = useCallback(async () => {
    const items = await listPendingOfflineQueueItemsByScope("daily")
    setPendingSyncCount(items.length)
    setFailedSyncCount(items.filter((item) => item.status === "failed").length)
    setPendingItems(items)

    const syncMeta = readOfflineDailySyncMeta()
    setLastSyncedAt(syncMeta.lastSyncedAt)
    setLastSyncError(syncMeta.lastError)
  }, [])

  const syncOfflineQueue = useCallback(async () => {
    if (!isOnline || isSyncing) return

    setIsSyncing(true)
    try {
      await flushOfflineDailyQueue()
      await refreshOfflineState()
      queryClient.invalidateQueries({ queryKey: ["dailyRecords", organizationId] })
    } finally {
      setIsSyncing(false)
    }
  }, [isOnline, isSyncing, organizationId, queryClient, refreshOfflineState])

  const retryOfflineItem = useCallback(async (itemId: string) => {
    if (!isOnline || isSyncing) return

    setIsSyncing(true)
    try {
      await retryOfflineDailyQueueItem(itemId)
      await flushOfflineDailyQueue({ itemId })
      await refreshOfflineState()
      queryClient.invalidateQueries({ queryKey: ["dailyRecords", organizationId] })
    } finally {
      setIsSyncing(false)
    }
  }, [isOnline, isSyncing, organizationId, queryClient, refreshOfflineState])

  const removeOfflineItem = useCallback(async (itemId: string) => {
    await deleteOfflineDailyQueueItem(itemId)
    await refreshOfflineState()
  }, [refreshOfflineState])

  useEffect(() => {
    void refreshOfflineState()

    const unsubscribe = subscribeToOfflineDailyQueue(() => {
      void refreshOfflineState()
    })

    const handleOnline = () => {
      setIsOnline(true)
    }
    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      unsubscribe()
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [refreshOfflineState])

  useEffect(() => {
    if (!isOnline || pendingSyncCount === 0) return
    void syncOfflineQueue()
  }, [isOnline, pendingSyncCount, syncOfflineQueue])

  const handleEditExisting = () => {
    if (!existingRecord) return
    setIsEditMode(true)
    setEditingRecord(existingRecord)
  }

  const ageDay = selectedBatch ? computeAgeDay(selectedBatch, selectedDate) : null
  const formDefaults = {
    mortality: editingRecord?.mortality ?? 0,
    feedKg: editingRecord?.feedKg ?? 0,
    feedStockId: editingRecord?.feedStockId ?? undefined,
    waterLiters: editingRecord?.waterLiters ?? undefined,
    avgWeightG: editingRecord?.avgWeightG ?? undefined,
    observations: editingRecord?.observations ?? "",
  }
  const availableFeedStocks = selectedBatch
    ? initialFeedStocks.filter((stock) => stock.farmId === selectedBatch.building.farmId)
    : []

  if (initialBatches.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="mb-4 text-5xl" aria-hidden>🐓</p>
        <h2 className="mb-2 text-lg font-semibold text-gray-900">
          Aucun lot actif
        </h2>
        <p className="text-sm text-gray-500">
          Creez un lot d&apos;elevage pour commencer la saisie journaliere.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Saisie journaliere</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          3 champs suffisent. Details optionnels disponibles en bas.
        </p>
      </div>

      <OfflineSyncCard
        isOnline={isOnline}
        pendingCount={pendingSyncCount}
        failedCount={failedSyncCount}
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

      <div className="space-y-1.5">
        <label htmlFor="batch-select" className="block text-sm font-medium text-gray-700">
          Lot actif
        </label>
        <select
          id="batch-select"
          value={selectedBatchId}
          onChange={(event) => {
            setSelectedBatchId(event.target.value)
            setIsEditMode(false)
            setEditingRecord(null)
          }}
          className="h-[52px] w-full rounded-xl border border-gray-300 bg-white px-4 text-base text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-green-600"
        >
          {initialBatches.length > 1 && (
            <option value="">- Selectionner un lot -</option>
          )}
          {initialBatches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.number} · {batch.building.farm.name} / {batch.building.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="date-input" className="block text-sm font-medium text-gray-700">
          Date
        </label>
        <input
          id="date-input"
          type="date"
          value={selectedDate}
          onChange={(event) => {
            setSelectedDate(event.target.value)
            setIsEditMode(false)
            setEditingRecord(null)
          }}
          max={todayStr()}
          className="h-[52px] w-full rounded-xl border border-gray-300 bg-white px-4 text-base text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-green-600"
        />
      </div>

      {selectedBatch && (
        <div className="flex items-center justify-between rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm">
          <div className="min-w-0">
            <span className="truncate font-semibold text-green-800">
              {selectedBatch.number}
            </span>
            <span className="ml-2 truncate text-xs text-green-600">
              {selectedBatch.building.farm.name} / {selectedBatch.building.name}
            </span>
          </div>
          <div className="ml-3 shrink-0 text-right text-xs font-medium tabular-nums text-green-700">
            <div>{ageDay !== null ? `Jour ${ageDay}` : ""}</div>
            <div className="text-green-500">{selectedBatch.entryCount} sujets</div>
          </div>
        </div>
      )}

      {existingRecord && !isEditMode && selectedBatch && (
        <div
          className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            isLocked
              ? "border-gray-200 bg-gray-50 text-gray-600"
              : "border-orange-200 bg-orange-50 text-orange-800"
          }`}
        >
          <p className="flex-1">
            {isLocked ? (
              <>
                <span className="font-semibold">Saisie verrouillee.</span>
                {" "}Contactez un gestionnaire pour la corriger.
              </>
            ) : (
              <>
                <span className="font-semibold">Saisie existante pour cette date.</span>
                {" "}Vous pouvez la corriger.
              </>
            )}
          </p>
          {!isLocked && (
            <button
              type="button"
              onClick={handleEditExisting}
              className="shrink-0 rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-orange-700"
            >
              Modifier
            </button>
          )}
        </div>
      )}

      {selectedBatch && (!existingRecord || isEditMode) && !isLocked && (
        <DailyForm
          key={`${selectedBatchId}-${selectedDate}-${isEditMode ? "edit" : "create"}`}
          organizationId={organizationId}
          batchId={selectedBatchId}
          selectedDate={selectedDate}
          entryCount={selectedBatch.entryCount}
          isEditMode={isEditMode}
          editingRecordId={editingRecord?.id}
          defaultValues={formDefaults}
          feedStocks={availableFeedStocks}
          onSuccess={handleSuccess}
          onOfflineQueued={() => {
            handleSuccess()
            void refreshOfflineState()
          }}
        />
      )}

      {selectedBatch && (
        <RecentRecords
          records={recentRecords}
          isLoading={loadingRecords}
          selectedDate={selectedDate}
        />
      )}
    </div>
  )
}
