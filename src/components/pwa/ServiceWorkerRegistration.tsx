"use client"

import { useEffect } from "react"
import { toast } from "sonner"

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

    navigator.serviceWorker.register("/sw.js").then((registration) => {
      // Détecter un nouveau SW en attente (mise à jour disponible)
      function handleUpdateFound() {
        const newWorker = registration.installing
        if (!newWorker) return

        newWorker.addEventListener("statechange", () => {
          // Le nouveau SW est installé et prêt — il y avait déjà un SW actif
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            toast("Mise à jour disponible", {
              description: "Une nouvelle version de SunuFarm est prête.",
              action: {
                label: "Recharger",
                onClick: () => window.location.reload(),
              },
              duration: 0, // Persiste jusqu'à action explicite
            })
          }
        })
      }

      // SW déjà en attente au montage (l'utilisateur a été inactif longtemps)
      if (registration.waiting && navigator.serviceWorker.controller) {
        toast("Mise à jour disponible", {
          description: "Une nouvelle version de SunuFarm est prête.",
          action: {
            label: "Recharger",
            onClick: () => window.location.reload(),
          },
          duration: 0,
        })
      }

      registration.addEventListener("updatefound", handleUpdateFound)
    }).catch(() => undefined)
  }, [])

  return null
}
