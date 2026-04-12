"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { BatchSummary } from "@/src/actions/batches"
import { getDailyRecords, type DailyRecordDetail } from "@/src/actions/daily-records"
import { useOfflineData } from "@/src/hooks/useOfflineData"
import { useOfflineSyncStatus } from "@/src/hooks/useOfflineSyncStatus"
import { OFFLINE_RESOURCE_KEYS } from "@/src/lib/offline-keys"
import { OFFLINE_TTL_MS } from "@/src/lib/offline-ttl"
import { subscribeOfflineEvent, OFFLINE_EVENTS } from "@/src/lib/offline/events"
import {
  loadDailyBatchesFromLocal,
  loadDailyFeedStocksFromLocal,
  loadDailyRecordsFromLocal,
  loadPendingDailyRecordsFromLocal,
  saveDailyBatchesToLocal,
  saveDailyFeedStocksToLocal,
  saveDailyRecordsToLocal,
} from "@/src/lib/offline/repositories/dailyRepository"
import { DailyForm } from "./DailyForm"
import { OfflineSyncCard } from "./OfflineSyncCard"
import { RecentRecords, type RecentRecordRow } from "./RecentRecords"

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

function recordMatchesDate(recordDate: Date | string, dateStr: string): boolean {
  return new Date(recordDate).toISOString().substring(0, 10) === dateStr
}

const MANAGER_OR_ABOVE = ["SUPER_ADMIN", "OWNER", "MANAGER"] as const

interface DailyEntryClientProps {
  organizationId: string
  userRole: string
  historyLimit: number
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
  historyLimit,
  initialBatches,
  initialFeedStocks,
  defaultBatchId,
}: DailyEntryClientProps) {
  const queryClient = useQueryClient()
  const canEditLocked = MANAGER_OR_ABOVE.includes(
    userRole as (typeof MANAGER_OR_ABOVE)[number],
  )
  const {
    isOnline,
    pendingCount: pendingSyncCount,
    failedCount: failedSyncCount,
    items: pendingItems,
    isSyncing,
    lastSyncedAt,
    lastError: lastSyncError,
    sync: syncOfflineQueue,
    retryItem: retryOfflineItem,
    removeItem: removeOfflineItem,
    purgeItem: purgeOfflineItem,
  } = useOfflineSyncStatus({ scope: "daily" })

  const {
    data: batches = initialBatches,
    isOfflineFallback: isOfflineBatches,
  } = useOfflineData({
    key: OFFLINE_RESOURCE_KEYS.dailyBatches,
    organizationId,
    initialData: initialBatches,
    ttlMs: OFFLINE_TTL_MS.references,
    localLoader: () => loadDailyBatchesFromLocal(organizationId),
    localSaver: (data) => saveDailyBatchesToLocal(organizationId, data),
  })
  const { data: feedStocks = initialFeedStocks } = useOfflineData({
    key: OFFLINE_RESOURCE_KEYS.dailyFeedStocks,
    organizationId,
    initialData: initialFeedStocks,
    ttlMs: OFFLINE_TTL_MS.references,
    localLoader: () => loadDailyFeedStocksFromLocal(organizationId),
    localSaver: (data) => saveDailyFeedStocksToLocal(organizationId, data),
  })

  const [selectedBatchId, setSelectedBatchId] = useState<string>(() => {
    if (defaultBatchId && initialBatches.some((batch) => batch.id === defaultBatchId)) {
      return defaultBatchId
    }

    return initialBatches.length === 1 ? initialBatches[0].id : ""
  })
  const [selectedDate, setSelectedDate] = useState<string>(todayStr())
  const [isEditMode, setIsEditMode] = useState(false)
  const [editingRecord, setEditingRecord] = useState<DailyRecordDetail | null>(null)
  const [optimisticRows, setOptimisticRows] = useState<RecentRecordRow[]>([])

  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId)
  const {
    data: cachedRecentRecords,
    isOfflineFallback: isOfflineRecentRecords,
  } = useOfflineData<DailyRecordDetail[]>({
    key: OFFLINE_RESOURCE_KEYS.dailyRecords(selectedBatchId || "none"),
    organizationId,
    ttlMs: OFFLINE_TTL_MS.records,
    enabled: !!selectedBatchId,
    localLoader: () => (
      selectedBatchId
        ? loadDailyRecordsFromLocal(organizationId, selectedBatchId)
        : Promise.resolve(undefined)
    ),
    localSaver: (data) => (
      selectedBatchId
        ? saveDailyRecordsToLocal(organizationId, data)
        : Promise.resolve()
    ),
  })

  const { data: onlineRecentRecords = [], isLoading: loadingRecords } = useQuery({
    queryKey: ["dailyRecords", organizationId, selectedBatchId],
    queryFn: async () => {
      if (!selectedBatchId) return []

      const result = await getDailyRecords({
        organizationId,
        batchId: selectedBatchId,
        limit: historyLimit,
      })

      return result.success ? result.data : []
    },
    enabled: !!selectedBatchId && isOnline,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!selectedBatchId || onlineRecentRecords.length === 0) return
    void saveDailyRecordsToLocal(organizationId, onlineRecentRecords)
  }, [onlineRecentRecords, organizationId, selectedBatchId])

  const onlineRecordRows: RecentRecordRow[] = onlineRecentRecords.map((record) => ({
    ...record,
    date: record.date,
  }))
  const cachedRecordRows: RecentRecordRow[] = (cachedRecentRecords ?? []).map((record) => ({
    ...record,
    date: record.date,
  }))

  useEffect(() => {
    let cancelled = false
    async function refreshOptimisticRows() {
      if (!selectedBatchId) {
        if (!cancelled) {
          setOptimisticRows([])
        }
        return
      }
      const rows = await loadPendingDailyRecordsFromLocal(organizationId, selectedBatchId)
      if (!cancelled) {
        setOptimisticRows(rows)
      }
    }

    void refreshOptimisticRows()
    const unsubscribeStorage = subscribeOfflineEvent(OFFLINE_EVENTS.storageChanged, () => {
      void refreshOptimisticRows()
    })
    const unsubscribeSync = subscribeOfflineEvent(OFFLINE_EVENTS.syncChanged, () => {
      void refreshOptimisticRows()
    })

    return () => {
      cancelled = true
      unsubscribeStorage()
      unsubscribeSync()
    }
  }, [organizationId, selectedBatchId])

  const baseRows = cachedRecordRows.length > 0 ? cachedRecordRows : onlineRecordRows
  const mergedRecentRows = useMemo(() => {
    const nonDuplicateOptimisticRows = optimisticRows.filter((optimistic) => !baseRows.some((record) => (
      recordMatchesDate(record.date, new Date(optimistic.date).toISOString().substring(0, 10))
    )))

    return [...nonDuplicateOptimisticRows, ...baseRows].sort((left, right) => (
      new Date(right.date).getTime() - new Date(left.date).getTime()
    ))
  }, [baseRows, optimisticRows])

  const existingPersistedRecord = baseRows.find((record) => recordMatchesDate(record.date, selectedDate))
  const existingRecord = mergedRecentRows.find((record) => recordMatchesDate(record.date, selectedDate))
  const isLocked = !!(existingPersistedRecord?.isLocked && !canEditLocked)

  const handleSuccess = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["dailyRecords", organizationId, selectedBatchId],
    })
    setIsEditMode(false)
    setEditingRecord(null)
  }, [organizationId, queryClient, selectedBatchId])

  useEffect(() => {
    if (pendingSyncCount === 0) return
    queryClient.invalidateQueries({ queryKey: ["dailyRecords", organizationId] })
  }, [organizationId, pendingSyncCount, queryClient])

  const handleEditExisting = () => {
    if (!existingPersistedRecord) return
    setIsEditMode(true)
    setEditingRecord(existingPersistedRecord as DailyRecordDetail)
  }

  const ageDay = selectedBatch ? computeAgeDay(selectedBatch, selectedDate) : null
  const formDefaults = {
    mortality: editingRecord?.mortality ?? 0,
    feedKg: editingRecord?.feedKg ?? 0,
    feedStockId: editingRecord?.feedStockId ?? undefined,
    waterLiters: editingRecord?.waterLiters ?? undefined,
    avgWeightG: editingRecord?.avgWeightG ?? undefined,
    temperatureMin: editingRecord?.temperatureMin ?? undefined,
    temperatureMax: editingRecord?.temperatureMax ?? undefined,
    humidity: editingRecord?.humidity ?? undefined,
    observations: editingRecord?.observations ?? "",
    audioRecordUrl: editingRecord?.audioRecordUrl ?? null,
  }
  const availableFeedStocks = selectedBatch
    ? feedStocks.filter((stock) => stock.farmId === selectedBatch.building.farmId)
    : []

  if (batches.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="mb-4 text-5xl" aria-hidden>Farm</p>
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Aucun lot actif</h2>
        <p className="text-sm text-gray-500">
          {isOfflineBatches
            ? "Aucun lot actif n'a encore ete mis en cache sur cet appareil."
            : "Creez un lot d'elevage pour commencer la saisie journaliere."}
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
        {!isOnline && (isOfflineBatches || isOfflineRecentRecords) ? (
          <p className="mt-1 text-xs text-amber-700">
            Affichage hors ligne sur la base du dernier etat connu.
          </p>
        ) : null}
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
        onPurgeItem={(itemId) => {
          void purgeOfflineItem(itemId)
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
          {batches.length > 1 ? (
            <option value="">- Selectionner un lot -</option>
          ) : null}
          {batches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.number} - {batch.building.farm.name} / {batch.building.name}
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

      {selectedBatch ? (
        <div className="flex items-center justify-between rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm">
          <div className="min-w-0">
            <span className="truncate font-semibold text-green-800">{selectedBatch.number}</span>
            <span className="ml-2 truncate text-xs text-green-600">
              {selectedBatch.building.farm.name} / {selectedBatch.building.name}
            </span>
          </div>
          <div className="ml-3 shrink-0 text-right text-xs font-medium tabular-nums text-green-700">
            <div>{ageDay !== null ? `Jour ${ageDay}` : ""}</div>
            <div className="text-green-500">{selectedBatch.entryCount} sujets</div>
          </div>
        </div>
      ) : null}

      {existingPersistedRecord && !isEditMode && selectedBatch ? (
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
                <span className="font-semibold">Saisie verrouillee.</span>{" "}
                Contactez un gestionnaire pour la corriger.
              </>
            ) : (
              <>
                <span className="font-semibold">Saisie existante pour cette date.</span>{" "}
                Vous pouvez la corriger.
              </>
            )}
          </p>
          {!isLocked ? (
            <button
              type="button"
              onClick={handleEditExisting}
              className="shrink-0 rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-orange-700"
            >
              Modifier
            </button>
          ) : null}
        </div>
      ) : null}

      {selectedBatch && (!existingPersistedRecord || isEditMode) && !isLocked ? (
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
          }}
        />
      ) : null}

      {selectedBatch ? (
        <RecentRecords
          records={mergedRecentRows}
          isLoading={loadingRecords && isOnline}
          selectedDate={selectedDate}
        />
      ) : null}

      {!isOnline && existingRecord?.isOptimistic ? (
        <p className="text-xs text-amber-700">
          Une saisie locale existe deja pour cette date. Elle sera synchronisee au retour du reseau.
        </p>
      ) : null}
    </div>
  )
}
