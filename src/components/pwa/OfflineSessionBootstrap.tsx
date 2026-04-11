"use client"

import { useEffect } from "react"
import { writeOfflineSessionContext } from "@/src/lib/offline-session"
import { prepareOfflineWorkspace } from "@/src/lib/offline/bootstrap"

export function OfflineSessionBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined" || !navigator.onLine) {
      return
    }

    void fetch("/api/offline-context", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return
        const payload = await response.json()
        await writeOfflineSessionContext(payload)
        await prepareOfflineWorkspace(payload.organizationId)
      })
      .catch(() => undefined)
  }, [])

  return null
}
