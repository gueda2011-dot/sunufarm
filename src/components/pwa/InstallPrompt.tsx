"use client"

import { useEffect, useState } from "react"
import { Download } from "lucide-react"
import { Button } from "@/src/components/ui/button"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    window.addEventListener("beforeinstallprompt", handler)
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  if (!deferredPrompt || dismissed) {
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
            onClick={() => setDismissed(true)}
          >
            Plus tard
          </Button>
        </div>
      </div>
    </div>
  )
}
