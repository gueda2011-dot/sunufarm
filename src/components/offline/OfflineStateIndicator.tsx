"use client"

import { useEffect, useState } from "react"
import { formatRelativeDate } from "@/src/lib/formatters"

interface OfflineStateIndicatorProps {
  /** true quand les données affichées viennent du cache local (pas du serveur) */
  isOfflineFallback: boolean
  /** true quand le TTL est dépassé */
  isStale: boolean
  /** true quand on est en fallback local mais qu'il n'y a aucune donnée */
  isEmpty?: boolean
  /** fonction asynchrone issue de useOfflineData — permet d'afficher la date de dernière sync */
  readCacheMeta?: () => Promise<{ savedAt: string } | null>
}

function SyncDot({ color }: { color: "amber" | "orange" }) {
  return (
    <span
      className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${
        color === "amber" ? "bg-amber-400" : "bg-orange-400"
      }`}
    />
  )
}

export function OfflineStateIndicator({
  isOfflineFallback,
  isStale,
  isEmpty = false,
  readCacheMeta,
}: OfflineStateIndicatorProps) {
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)

  useEffect(() => {
    if (!isOfflineFallback || !readCacheMeta) return
    void readCacheMeta().then((meta) => {
      setLastSyncAt(meta?.savedAt ?? null)
    })
  }, [isOfflineFallback, readCacheMeta])

  // État 1 — online + données fraîches : rien à afficher
  if (!isOfflineFallback) return null

  // État 3 — offline + aucune donnée locale disponible
  if (isEmpty) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-8 text-center">
        <p className="text-sm font-medium text-gray-600">
          Aucune donnée disponible hors ligne
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Connectez-vous pour synchroniser vos données.
        </p>
      </div>
    )
  }

  const syncSuffix = lastSyncAt
    ? ` · sync ${formatRelativeDate(lastSyncAt)}`
    : ""

  // État 4 — données locales stale (TTL dépassé)
  if (isStale) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
        <SyncDot color="orange" />
        <p className="text-xs text-orange-700">
          Données locales · potentiellement obsolètes{syncSuffix}
        </p>
      </div>
    )
  }

  // État 2 — offline + données locales disponibles et fraîches
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <SyncDot color="amber" />
      <p className="text-xs text-amber-700">
        Mode hors ligne · données locales{syncSuffix}
      </p>
    </div>
  )
}
