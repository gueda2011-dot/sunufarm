"use client"

import { useCallback, useEffect, useState } from "react"
import {
  flushOfflineMutationOutbox,
  listPendingOfflineQueueItems,
  readOfflineSyncMeta,
  subscribeToOfflineMutationOutbox,
} from "@/src/lib/offline-mutation-outbox"

const SCOPE_LABELS: Record<string, string> = {
  daily: "Saisies",
  expenses: "Depenses",
  health: "Sante",
  sales: "Ventes",
  stock: "Stock",
}

function formatLastSync(value: string | null) {
  if (!value) return "Aucune synchro"

  try {
    return new Intl.DateTimeFormat("fr-SN", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value))
  } catch {
    return "Synchro recente"
  }
}

export function GlobalSyncBanner() {
  const [isOnline, setIsOnline] = useState<boolean>(() => (
    typeof navigator === "undefined" ? true : navigator.onLine
  ))
  const [isSyncing, setIsSyncing] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)
  const [scopes, setScopes] = useState<Array<{ scope: string; count: number }>>([])
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  const refreshState = useCallback(async () => {
    const items = await listPendingOfflineQueueItems()
    const grouped = Array.from(
      items.reduce((map, item) => {
        map.set(item.scope, (map.get(item.scope) ?? 0) + 1)
        return map
      }, new Map<string, number>()),
    ).map(([scope, count]) => ({ scope, count }))

    setPendingCount(items.length)
    setFailedCount(items.filter((item) => item.status === "failed").length)
    setScopes(grouped)

    const meta = readOfflineSyncMeta()
    setLastSyncedAt(meta.lastSyncedAt)
    setLastError(meta.lastError)
  }, [])

  const syncAll = useCallback(async () => {
    if (!isOnline || isSyncing) return

    setIsSyncing(true)
    try {
      await flushOfflineMutationOutbox()
      await refreshState()
    } finally {
      setIsSyncing(false)
    }
  }, [isOnline, isSyncing, refreshState])

  useEffect(() => {
    void refreshState()

    const unsubscribe = subscribeToOfflineMutationOutbox(() => {
      void refreshState()
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
  }, [refreshState])

  useEffect(() => {
    if (!isOnline || pendingCount === 0) return
    void syncAll()
  }, [isOnline, pendingCount, syncAll])

  if (pendingCount === 0 && !lastError) {
    return null
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-950">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <p className="font-semibold">
            {pendingCount > 0
              ? `${pendingCount} action(s) en attente de synchronisation`
              : "Synchronisation globale a verifier"}
          </p>
          <p className="text-xs text-blue-800">
            {isOnline
              ? "Le reseau est disponible. Les actions en attente seront rejouees automatiquement."
              : "Mode hors ligne actif. Les actions creees sur les modules compatibles resteront dans l'outbox locale."}
          </p>
          <p className="text-xs text-blue-700">
            Derniere synchro: {formatLastSync(lastSyncedAt)}
          </p>
          {failedCount > 0 ? (
            <p className="text-xs text-red-700">
              {failedCount} action(s) necessitent une reprise manuelle.
            </p>
          ) : null}
          {lastError ? (
            <p className="text-xs text-red-700">Derniere erreur: {lastError}</p>
          ) : null}
          {scopes.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {scopes.map((item) => (
                <span
                  key={item.scope}
                  className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-700"
                >
                  {SCOPE_LABELS[item.scope] ?? item.scope}: {item.count}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => {
            void syncAll()
          }}
          disabled={!isOnline || isSyncing}
          className="shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          {isSyncing ? "Synchro..." : "Synchroniser tout"}
        </button>
      </div>
    </div>
  )
}
