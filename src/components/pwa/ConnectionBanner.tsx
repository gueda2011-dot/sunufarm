"use client"

import { useSyncExternalStore } from "react"
import { CloudOff, Wifi } from "lucide-react"

function subscribe(callback: () => void) {
  window.addEventListener("online", callback)
  window.addEventListener("offline", callback)

  return () => {
    window.removeEventListener("online", callback)
    window.removeEventListener("offline", callback)
  }
}

function getOnlineSnapshot() {
  return navigator.onLine
}

export function ConnectionBanner() {
  const isOnline = useSyncExternalStore(subscribe, getOnlineSnapshot, () => null)

  if (isOnline === null) return null

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${
      isOnline
        ? "border-green-200 bg-green-50 text-green-800"
        : "border-orange-200 bg-orange-50 text-orange-900"
    }`}>
      <div className="flex items-start gap-3">
        {isOnline ? (
          <Wifi className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <div>
          <p className="font-semibold">
            {isOnline ? "Connexion active" : "Mode connexion limitee"}
          </p>
          <p className="mt-1 text-xs opacity-90">
            {isOnline
              ? "Les brouillons et les donnees peuvent se synchroniser normalement."
              : "Vous pouvez continuer a saisir. Les ecrans deja visites et les brouillons restent prioritaires."}
          </p>
        </div>
      </div>
    </div>
  )
}
