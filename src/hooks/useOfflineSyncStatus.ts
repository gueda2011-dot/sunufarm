"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  deleteOfflineQueueItem,
  flushOfflineMutationOutbox,
  flushOfflineQueueByScope,
  listPendingOfflineQueueItems,
  listPendingOfflineQueueItemsByScope,
  purgeOfflineDailyItemLocally,
  readOfflineSyncMeta,
  retryOfflineQueueItem,
  subscribeToOfflineMutationOutbox,
  type OfflineQueueItem,
} from "@/src/lib/offline-mutation-outbox"

interface UseOfflineSyncStatusOptions {
  scope?: string
}

export function useOfflineSyncStatus(options: UseOfflineSyncStatusOptions = {}) {
  const { scope } = options
  const [isOnline, setIsOnline] = useState<boolean>(() => (
    typeof navigator === "undefined" ? true : navigator.onLine
  ))
  const [items, setItems] = useState<OfflineQueueItem[]>([])
  const [isSyncingLocal, setIsSyncingLocal] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const pendingItems = scope
      ? await listPendingOfflineQueueItemsByScope(scope)
      : await listPendingOfflineQueueItems()

    setItems(pendingItems)

    const syncMeta = readOfflineSyncMeta()
    setLastSyncedAt(syncMeta.lastSyncedAt)
    setLastError(syncMeta.lastError)
  }, [scope])

  const sync = useCallback(async () => {
    if (!isOnline || isSyncingLocal) return

    setIsSyncingLocal(true)
    try {
      if (scope) {
        await flushOfflineQueueByScope(scope)
      } else {
        await flushOfflineMutationOutbox()
      }
      await refresh()
    } finally {
      setIsSyncingLocal(false)
    }
  }, [isOnline, isSyncingLocal, refresh, scope])

  const retryItem = useCallback(async (itemId: string) => {
    if (!isOnline || isSyncingLocal) return

    setIsSyncingLocal(true)
    try {
      await retryOfflineQueueItem(itemId)
      await flushOfflineMutationOutbox({ itemId })
      await refresh()
    } finally {
      setIsSyncingLocal(false)
    }
  }, [isOnline, isSyncingLocal, refresh])

  const removeItem = useCallback(async (itemId: string) => {
    try {
      await deleteOfflineQueueItem(itemId)
    } catch (error) {
      console.error("[offline-sync] removeItem failed — forcing refresh anyway", error)
    } finally {
      await refresh()
    }
  }, [refresh])

  const purgeItem = useCallback(async (itemId: string) => {
    try {
      await purgeOfflineDailyItemLocally(itemId)
    } catch (error) {
      console.error("[offline-sync] purgeItem failed — forcing refresh anyway", error)
    } finally {
      await refresh()
    }
  }, [refresh])

  useEffect(() => {
    void refresh()

    const unsubscribe = subscribeToOfflineMutationOutbox(() => {
      void refresh()
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
  }, [refresh])

  // Auto-sync only when there are genuinely pending items (not failed/conflict).
  // Failed items require explicit user action (Réessayer or Supprimer).
  // Using items.length here caused an infinite loop: every sync completion
  // changed isSyncingLocal → recreated sync callback → effect re-fired →
  // immediately re-synced the same failed item forever.
  const pendingItemsCount = useMemo(
    () => items.filter((i) => i.status === "pending").length,
    [items],
  )

  useEffect(() => {
    if (!isOnline || pendingItemsCount === 0) return
    void sync()
  }, [isOnline, pendingItemsCount, sync])

  // isSyncing est vrai si une opération de sync locale est en cours OU si des items
  // sont en statut "syncing" dans la queue (ex: reprise après crash)
  const isSyncing = useMemo(
    () => isSyncingLocal || items.some((item) => item.status === "syncing"),
    [isSyncingLocal, items],
  )

  const failedCount = useMemo(
    () => items.filter((item) => item.status === "failed" || item.status === "conflict").length,
    [items],
  )

  const groupedCounts = useMemo(() => {
    return items.reduce<Record<string, number>>((accumulator, item) => {
      accumulator[item.scope] = (accumulator[item.scope] ?? 0) + 1
      return accumulator
    }, {})
  }, [items])

  return {
    isOnline,
    isSyncing,
    items,
    pendingCount: items.length,
    failedCount,
    lastSyncedAt,
    lastError,
    groupedCounts,
    refresh,
    sync,
    retryItem,
    removeItem,
    purgeItem,
  }
}
