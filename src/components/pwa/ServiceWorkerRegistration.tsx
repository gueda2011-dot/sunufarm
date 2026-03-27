"use client"

import { useEffect } from "react"

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return
    }

    const configuredHost = process.env.NEXT_PUBLIC_APP_URL
      ? new URL(process.env.NEXT_PUBLIC_APP_URL).host
      : null
    const currentHost = window.location.host
    const isPreviewDeployment =
      currentHost.endsWith(".vercel.app") &&
      (!configuredHost || currentHost !== configuredHost)

    if (isPreviewDeployment) {
      return
    }

    void navigator.serviceWorker.register("/sw.js").catch(() => undefined)
  }, [])

  return null
}
