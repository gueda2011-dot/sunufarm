"use client"

import { useEffect, useRef } from "react"
import { writeOfflineSessionContext } from "@/src/lib/offline-session"
import { getOfflineBootstrapMeta, prepareOfflineWorkspace } from "@/src/lib/offline/bootstrap"
import { OFFLINE_BOOTSTRAP_VERSION } from "@/src/lib/offline/schema"

/**
 * TTL du bootstrap : 6 heures.
 * En deçà, on considère les données locales suffisamment fraîches et on saute le bootstrap.
 * Au-delà, ou si l'organisation/la version a changé, on relance silencieusement.
 */
const BOOTSTRAP_TTL_MS = 6 * 60 * 60 * 1000

/**
 * Cooldown anti-rebond : si un bootstrap a démarré il y a moins de 30 secondes,
 * on ne relance pas (protection contre les montages multiples en navigation rapide).
 */
const BOOTSTRAP_COOLDOWN_MS = 30 * 1000

async function fetchOrgContext() {
  const response = await fetch("/api/offline-context", { cache: "no-store" })
  if (!response.ok) return null
  return response.json() as Promise<{ userId: string; organizationId: string } & Record<string, unknown>>
}

async function shouldRunBootstrap(organizationId: string): Promise<boolean> {
  const meta = await getOfflineBootstrapMeta(organizationId)

  if (!meta) return true
  if (meta.organizationId !== organizationId) return true
  if (meta.bootstrapVersion !== OFFLINE_BOOTSTRAP_VERSION) return true
  if (meta.status === "failed") return true

  // Bootstrap en cours depuis moins de 30s → on laisse tourner
  if (meta.status === "started" || meta.status === "in_progress") {
    const startedAt = meta.startedAt ? new Date(meta.startedAt).getTime() : 0
    if (Date.now() - startedAt < BOOTSTRAP_COOLDOWN_MS) return false
    // Sinon bootstrap planté → relancer
    return true
  }

  const lastAt = meta.lastBootstrapAt ? new Date(meta.lastBootstrapAt).getTime() : 0
  return Date.now() - lastAt > BOOTSTRAP_TTL_MS
}

async function runBootstrapIfNeeded(isMounted: () => boolean) {
  if (!navigator.onLine) return

  try {
    const payload = await fetchOrgContext()
    if (!payload?.organizationId) return
    if (!isMounted()) return

    await writeOfflineSessionContext(payload)
    if (!isMounted()) return

    const needed = await shouldRunBootstrap(payload.organizationId)
    if (!needed || !isMounted()) return

    await prepareOfflineWorkspace(payload.organizationId)
  } catch {
    // Silencieux : le bootstrap est best-effort, aucune erreur ne doit remonter à l'UI
  }
}

export function OfflineSessionBootstrap() {
  const mountedRef = useRef(true)
  const lastVisibilityCheckRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Bootstrap au montage initial
  useEffect(() => {
    if (typeof window === "undefined") return
    void runBootstrapIfNeeded(() => mountedRef.current)
  }, [])

  // Re-check quand le tab redevient visible (retour depuis une autre app / un autre onglet)
  useEffect(() => {
    if (typeof window === "undefined") return

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return

      // Anti-rebond : on ne re-vérifie pas plus d'une fois par heure
      const now = Date.now()
      if (now - lastVisibilityCheckRef.current < 60 * 60 * 1000) return
      lastVisibilityCheckRef.current = now

      void runBootstrapIfNeeded(() => mountedRef.current)
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [])

  return null
}
