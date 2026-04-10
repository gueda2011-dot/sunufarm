"use client"

import { useEffect, useState } from "react"
import {
  readOfflineSessionContext,
  type OfflineSessionContext,
} from "@/src/lib/offline-session"

export function useOfflineSessionContext() {
  const [context, setContext] = useState<OfflineSessionContext | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadContext() {
      const cached = readOfflineSessionContext()
      if (!cancelled) {
        setContext(cached)
      }

      if (typeof window !== "undefined" && navigator.onLine) {
        try {
          const response = await fetch("/api/offline-context", { cache: "no-store" })
          if (!response.ok) {
            setIsLoading(false)
            return
          }

          const payload = (await response.json()) as OfflineSessionContext
          if (!cancelled) {
            setContext(payload)
          }
        } catch {
          // Offline fallback keeps the cached value.
        }
      }

      if (!cancelled) {
        setIsLoading(false)
      }
    }

    void loadContext()

    return () => {
      cancelled = true
    }
  }, [])

  return { context, isLoading }
}

