"use client"

export const OFFLINE_EVENTS = {
  storageChanged: "sunufarm:offline-storage-changed",
  syncChanged: "sunufarm:offline-sync-changed",
  bootstrapChanged: "sunufarm:offline-bootstrap-changed",
  sessionChanged: "sunufarm:offline-session-changed",
} as const

export function emitOfflineEvent(eventName: string) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(eventName))
}

export function subscribeOfflineEvent(eventName: string, callback: () => void) {
  if (typeof window === "undefined") {
    return () => {}
  }

  const handler = () => callback()
  window.addEventListener(eventName, handler)
  return () => window.removeEventListener(eventName, handler)
}
