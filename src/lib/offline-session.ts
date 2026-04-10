"use client"

import { OFFLINE_SESSION_STORAGE_KEY } from "@/src/lib/offline-keys"

export interface OfflineSessionContext {
  userId: string
  organizationId: string
  userRole: string
  farmPermissions: unknown
  modulePermissions?: unknown
  organizationName?: string
  savedAt: string
}

export function readOfflineSessionContext(): OfflineSessionContext | null {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(OFFLINE_SESSION_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as OfflineSessionContext
  } catch {
    return null
  }
}

export function writeOfflineSessionContext(context: OfflineSessionContext) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(OFFLINE_SESSION_STORAGE_KEY, JSON.stringify(context))
}

export function clearOfflineSessionContext() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(OFFLINE_SESSION_STORAGE_KEY)
}

