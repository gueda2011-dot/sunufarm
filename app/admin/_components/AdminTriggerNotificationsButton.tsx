"use client"

import { useState } from "react"
import { Bell, CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/src/components/ui/button"
import { adminTriggerNotifications, type TriggerNotificationsResult } from "@/src/actions/admin-notifications"

export function AdminTriggerNotificationsButton() {
  const [isPending, setIsPending] = useState(false)
  const [result, setResult] = useState<TriggerNotificationsResult | null>(null)

  const handleTrigger = async () => {
    setIsPending(true)
    setResult(null)

    try {
      const res = await adminTriggerNotifications()
      setResult(res)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Button
        size="sm"
        variant="outline"
        onClick={handleTrigger}
        disabled={isPending}
      >
        {isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Bell className="mr-2 h-4 w-4" />
        )}
        {isPending ? "Envoi en cours..." : "Declencher les notifications"}
      </Button>

      {result && (
        <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
          result.success
            ? "bg-emerald-50 text-emerald-800"
            : "bg-rose-50 text-rose-800"
        }`}>
          {result.success ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              {result.organizationsProcessed} orgs · {result.notificationsCreated} notifs · {result.pushSent} push · {result.emailsSent} emails
              {" "}· fcm={result.firebaseConfigured ? "ok" : "non configure"} · devices={result.devicesInDb}
            </>
          ) : (
            result.error ?? "Erreur inconnue"
          )}
        </div>
      )}
    </div>
  )
}
