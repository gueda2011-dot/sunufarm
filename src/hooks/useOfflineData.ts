"use client"

import { useEffect, useState } from "react"
import {
  getCachedResource,
  isCacheFresh,
  setCachedResource,
  type OfflineCacheEntry,
} from "@/src/lib/offline-cache"

interface UseOfflineDataOptions<T> {
  key: string
  organizationId: string
  initialData?: T
  ttlMs: number
  version?: number
  enabled?: boolean
}

export function useOfflineData<T>({
  key,
  organizationId,
  initialData,
  ttlMs,
  version = 1,
  enabled = true,
}: UseOfflineDataOptions<T>) {
  const [data, setData] = useState<T | undefined>(initialData)
  const [isOfflineFallback, setIsOfflineFallback] = useState(false)
  const [isLoading, setIsLoading] = useState(enabled && initialData === undefined)
  const [isStale, setIsStale] = useState(false)

  useEffect(() => {
    setData(initialData)
  }, [initialData])

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || initialData === undefined) return

    void setCachedResource({
      key,
      organizationId,
      version,
      savedAt: new Date().toISOString(),
      ttlMs,
      data: initialData,
    })
  }, [enabled, initialData, key, organizationId, ttlMs, version])

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return

    if (navigator.onLine && initialData !== undefined) {
      setIsOfflineFallback(false)
      setIsLoading(false)
      setIsStale(false)
      return
    }

    let cancelled = false

    async function loadCachedValue() {
      setIsLoading(true)
      const entry = await getCachedResource<T>(key, organizationId)

      if (cancelled) return

      if (entry) {
        setData(entry.data)
        setIsOfflineFallback(true)
        setIsStale(!isCacheFresh(entry.savedAt, entry.ttlMs))
      } else {
        setIsStale(false)
      }

      setIsLoading(false)
    }

    void loadCachedValue()

    return () => {
      cancelled = true
    }
  }, [enabled, initialData, key, organizationId])

  const cacheEntryToMeta = async (): Promise<OfflineCacheEntry<T> | null> => (
    getCachedResource<T>(key, organizationId)
  )

  return {
    data,
    isOfflineFallback,
    isLoading,
    isStale,
    readCacheMeta: cacheEntryToMeta,
  }
}

