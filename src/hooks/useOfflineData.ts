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
  localLoader?: () => Promise<T | undefined>
  localSaver?: (data: T) => Promise<void>
}

export function useOfflineData<T>({
  key,
  organizationId,
  initialData,
  ttlMs,
  version = 1,
  enabled = true,
  localLoader,
  localSaver,
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

    void (async () => {
      await setCachedResource({
        key,
        organizationId,
        version,
        savedAt: new Date().toISOString(),
        ttlMs,
        data: initialData,
      })

      if (localSaver) {
        await localSaver(initialData)
      }
    })()
  }, [enabled, initialData, key, localSaver, organizationId, ttlMs, version])

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return

    let cancelled = false

    async function loadCachedValue() {
      setIsLoading(true)
      const localData = localLoader ? await localLoader() : undefined
      if (!cancelled && localData !== undefined) {
        setData(localData)
        setIsOfflineFallback(true)
        setIsStale(false)
        setIsLoading(false)
        return
      }

      if (!cancelled && initialData !== undefined) {
        setData(initialData)
        setIsOfflineFallback(false)
        setIsStale(false)
        setIsLoading(false)
        return
      }

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
  }, [enabled, initialData, key, localLoader, organizationId])

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
