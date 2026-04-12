"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { Download, Share2 } from "lucide-react"
import { Button } from "@/src/components/ui/button"

const DISMISS_KEY = "sunufarm:pwa-install-dismissed"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

function subscribeToInstallAvailability() {
  return () => {}
}

function getIosInstallHintSnapshot() {
  const userAgent = window.navigator.userAgent.toLowerCase()
  const isIos = /iphone|ipad|ipod/.test(userAgent)
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    || ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone))

  return isIos && !isStandalone
}

function isAlreadyInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator &&
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone))
  )
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem(DISMISS_KEY) === "1"
  })
  const showIosHint = useSyncExternalStore(
    subscribeToInstallAvailability,
    getIosInstallHintSnapshot,
    () => false,
  )

  useEffect(() => {
    // Ne rien faire si déjà installé ou si l'utilisateur a dismissé
    if (isAlreadyInstalled() || dismissed) return

    const handler = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    window.addEventListener("beforeinstallprompt", handler)
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [dismissed])

  function handleDismiss() {
    setDismissed(true)
    localStorage.setItem(DISMISS_KEY, "1")
  }

  if (dismissed) {
    return null
  }

  if (showIosHint) {
    return (
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Installer SunuFarm sur votre iPhone</p>
            <p className="mt-1 text-xs text-blue-800">
              Dans Safari, touchez Partager puis choisissez Ajouter a l&apos;ecran d&apos;accueil.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-medium text-blue-900">
              <Share2 className="h-4 w-4" />
              Partager
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDismiss}
            >
              Plus tard
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!deferredPrompt) {
    return null
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Installer SunuFarm sur cet appareil</p>
          <p className="mt-1 text-xs text-blue-800">
            Accedez plus vite aux ecrans terrain et gardez une experience proche d&apos;une application native.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={async () => {
              await deferredPrompt.prompt()
              setDeferredPrompt(null)
            }}
          >
            <Download className="h-4 w-4" />
            Installer
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDismiss}
          >
            Plus tard
          </Button>
        </div>
      </div>
    </div>
  )
}
