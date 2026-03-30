"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Bell, BellOff } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/src/components/ui/button"
import {
  getWebPushToken,
  isFirebaseWebPushConfigured,
  isWebPushSupported,
  subscribeToForegroundMessages,
} from "@/src/lib/firebase-client"
import {
  deactivateCurrentUserPushDevice,
  registerCurrentUserPushDevice,
} from "@/src/actions/push-devices"

interface PushNotificationsPromptProps {
  organizationId: string
  organizationName: string
}

function getStorageKey(organizationId: string) {
  return `sunufarm:push-token:${organizationId}`
}

function inferDeviceLabel() {
  if (typeof navigator === "undefined") return "Web"

  const userAgent = navigator.userAgent.toLowerCase()

  if (userAgent.includes("android")) return "Web Android"
  if (userAgent.includes("iphone") || userAgent.includes("ipad") || userAgent.includes("ipod")) {
    return "Web iOS"
  }

  return "Web"
}

export function PushNotificationsPrompt({
  organizationId,
  organizationName,
}: PushNotificationsPromptProps) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported" | null>(null)
  const [isSupported, setIsSupported] = useState(false)
  const [isRegistered, setIsRegistered] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const syncStartedRef = useRef(false)
  const localStorageKey = useMemo(
    () => getStorageKey(organizationId),
    [organizationId],
  )

  const deactivateStoredToken = useCallback(async () => {
    if (typeof window === "undefined") return

    const storedToken = window.localStorage.getItem(localStorageKey)
    if (!storedToken) return

    const result = await deactivateCurrentUserPushDevice({
      organizationId,
      token: storedToken,
    })

    if (result.success) {
      window.localStorage.removeItem(localStorageKey)
      setIsRegistered(false)
    }
  }, [localStorageKey, organizationId])

  const syncPushToken = useCallback(async () => {
    if (typeof window === "undefined") return

    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) {
      throw new Error("Le service worker n'est pas actif sur cet environnement.")
    }

    const token = await getWebPushToken(registration)

    if (!token) {
      throw new Error("Token FCM introuvable.")
    }

    const result = await registerCurrentUserPushDevice({
      organizationId,
      token,
      deviceLabel: inferDeviceLabel(),
      userAgent: navigator.userAgent,
    })

    if (!result.success) {
      throw new Error(result.error)
    }

    window.localStorage.setItem(localStorageKey, token)
    setIsRegistered(true)
  }, [localStorageKey, organizationId])

  useEffect(() => {
    let cancelled = false
    syncStartedRef.current = false

    void (async () => {
      if (!isFirebaseWebPushConfigured()) return

      const supported = await isWebPushSupported()
      if (cancelled) return

      setIsSupported(supported)

      if (!supported) {
        setPermission("unsupported")
        return
      }

      const currentPermission = window.Notification.permission
      setPermission(currentPermission)

      if (currentPermission === "granted" && !syncStartedRef.current) {
        syncStartedRef.current = true

        try {
          await syncPushToken()
        } catch {
          setIsRegistered(false)
        }
      }

      if (currentPermission === "denied") {
        await deactivateStoredToken()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [deactivateStoredToken, syncPushToken])

  useEffect(() => {
    let unsubscribe: (() => void) | undefined

    void (async () => {
      unsubscribe = await subscribeToForegroundMessages((payload) => {
        const title = payload.notification?.title ?? payload.data?.title ?? "SunuFarm"
        const description = payload.notification?.body ?? payload.data?.body ?? "Nouvelle alerte terrain."

        toast(title, {
          description,
        })
      })
    })()

    return () => unsubscribe?.()
  }, [])

  const handleEnableNotifications = () => {
    void (async () => {
      if (!isSupported) return

      setIsPending(true)

      try {
        const nextPermission = await window.Notification.requestPermission()
        setPermission(nextPermission)

        if (nextPermission !== "granted") {
          await deactivateStoredToken()

          if (nextPermission === "denied") {
            toast.error("Notifications bloquees", {
              description: "Autorisez les notifications dans le navigateur pour recevoir les alertes SunuFarm.",
            })
          }
          return
        }

        await syncPushToken()
        toast.success("Notifications actives", {
          description: `Les alertes terrain de ${organizationName} arriveront maintenant sur cet appareil.`,
        })
      } catch (error) {
        toast.error("Activation impossible", {
          description: error instanceof Error
            ? error.message
            : "Le device n'a pas pu etre enregistre.",
        })
      } finally {
        setIsPending(false)
      }
    })()
  }

  if (permission === null || !isFirebaseWebPushConfigured() || permission === "unsupported") {
    return null
  }

  if (permission === "granted" && isRegistered) {
    return null
  }

  if (permission === "denied") {
    return (
      <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950">
        <div className="flex items-start gap-3">
          <BellOff className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Notifications bloquees sur cet appareil</p>
            <p className="mt-1 text-xs text-orange-900">
              Autorisez les notifications dans les reglages du navigateur si vous voulez recevoir les alertes terrain SunuFarm.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Bell className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Activer les alertes push terrain</p>
            <p className="mt-1 text-xs text-emerald-900">
              Recevez les alertes critiques de {organizationName} directement sur ce telephone ou ce navigateur.
            </p>
          </div>
        </div>

        <Button size="sm" onClick={handleEnableNotifications} disabled={isPending}>
          {isPending ? "Activation..." : "Activer"}
        </Button>
      </div>
    </div>
  )
}
