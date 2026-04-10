"use client"

import { useEffect } from "react"
import { writeOfflineSessionContext } from "@/src/lib/offline-session"

export function OfflineSessionBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined" || !navigator.onLine) {
      return
    }

    void fetch("/api/offline-context", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return
        const payload = await response.json()
        writeOfflineSessionContext(payload)
      })
      .catch(() => undefined)
  }, [])

  return null
}
