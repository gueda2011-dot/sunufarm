"use client"

import { useEffect } from "react"

function getConfiguredAppHost(): string | null {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!configuredUrl) return null

  try {
    return new URL(configuredUrl).host
  } catch {
    return null
  }
}

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return
    }

    const configuredHost = getConfiguredAppHost()
    const currentHost = window.location.host
    const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV
    const isPreviewDeployment =
      vercelEnv === "preview" ||
      (
        currentHost.endsWith(".vercel.app") &&
        (!configuredHost || currentHost !== configuredHost)
      )

    if (isPreviewDeployment) {
      return
    }

    void navigator.serviceWorker.register("/sw.js").catch(() => undefined)
  }, [])

  return null
}
