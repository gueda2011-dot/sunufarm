"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  deleteOfflineQueueItem,
  flushOfflineMutationOutbox,
  flushOfflineQueueByScope,
  listPendingOfflineQueueItems,
  listPendingOfflineQueueItemsByScope,
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
  const [isSyncing, setIsSyncing] = useState(false)
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
    if (!isOnline || isSyncing) return

    setIsSyncing(true)
    try {
      if (scope) {
        await flushOfflineQueueByScope(scope)
      } else {
        await flushOfflineMutationOutbox()
      }
      await refresh()
    } finally {
      setIsSyncing(false)
    }
  }, [isOnline, isSyncing, refresh, scope])

  const retryItem = useCallback(async (itemId: string) => {
    if (!isOnline || isSyncing) return

    setIsSyncing(true)
    try {
      await retryOfflineQueueItem(itemId)
      await flushOfflineMutationOutbox({ itemId })
      await refresh()
    } finally {
      setIsSyncing(false)
    }
  }, [isOnline, isSyncing, refresh])

  const removeItem = useCallback(async (itemId: string) => {
    await deleteOfflineQueueItem(itemId)
    await refresh()
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

  useEffect(() => {
    if (!isOnline || items.length === 0) return
    void sync()
  }, [isOnline, items.length, sync])

  const failedCount = useMemo(
    () => items.filter((item) => item.status === "failed").length,
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
  }
}
