"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, Check, CheckCheck, X, AlertTriangle, ArrowRight, ChevronDown, TrendingUp, TrendingDown } from "lucide-react"
import {
  getNotifications,
  getNotificationTeasers,
  markNotificationRead,
  markAllNotificationsRead,
  archiveNotification,
  type NotificationSummary,
  type NotificationTeaser,
} from "@/src/actions/notifications"
import { cn } from "@/src/lib/utils"
import { NotificationStatus } from "@/src/generated/prisma/client"
import { trackAlertAction } from "@/src/actions/analytics"

interface NotificationDropdownProps {
  organizationId: string
  unreadCount: number
}

function formatRelative(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - new Date(date).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return "A l'instant"
  if (minutes < 60) return `Il y a ${minutes} min`
  if (hours < 24) return `Il y a ${hours}h`
  if (days === 1) return "Hier"
  return `Il y a ${days} jours`
}

// Styles selon la priorité de l'alerte
function getPriorityStyles(priority: "high" | "medium" | "low" | undefined, isUnread: boolean) {
  if (priority === "high") {
    return {
      row: cn("border-l-2 border-l-red-400", isUnread ? "bg-red-50" : "bg-white"),
      dot: "bg-red-500",
      signalBg: "bg-red-50 border-red-200 text-red-700",
      label: "bg-red-100 text-red-700",
    }
  }
  if (priority === "medium") {
    return {
      row: cn("border-l-2 border-l-amber-400", isUnread ? "bg-amber-50" : "bg-white"),
      dot: "bg-amber-500",
      signalBg: "bg-amber-50 border-amber-200 text-amber-700",
      label: "bg-amber-100 text-amber-700",
    }
  }
  return {
    row: cn("border-l-2 border-l-transparent", isUnread ? "bg-green-50" : "bg-white"),
    dot: "bg-green-400",
    signalBg: "bg-slate-50 border-slate-200 text-slate-600",
    label: "bg-slate-100 text-slate-600",
  }
}

// ---------------------------------------------------------------------------
// Tendance — copie UX par resourceType
// ---------------------------------------------------------------------------

const TREND_COPY: Record<string, Record<"worsening" | "improving", { label: string; explanation: string }>> = {
  DAILY_RECORD: {
    worsening: { label: "S'aggrave",   explanation: "La mortalite augmente sur les dernieres saisies." },
    improving: { label: "S'ameliore",  explanation: "La mortalite recule sur les dernieres saisies." },
  },
  FEED_STOCK: {
    worsening: { label: "S'aggrave",   explanation: "Le stock s'epuise plus vite qu'avant." },
    improving: { label: "S'ameliore",  explanation: "La consommation ralentit ou du stock a ete reconstitue." },
  },
  MEDICINE_STOCK: {
    worsening: { label: "S'aggrave",   explanation: "Le stock medicament diminue." },
    improving: { label: "S'ameliore",  explanation: "Le stock medicament se reconstitue." },
  },
  FEED_STOCK_RUPTURE: {
    worsening: { label: "S'aggrave",   explanation: "Le delai avant rupture aliment se reduit." },
    improving: { label: "S'ameliore",  explanation: "Le delai avant rupture aliment augmente." },
  },
  MEDICINE_STOCK_RUPTURE: {
    worsening: { label: "S'aggrave",   explanation: "Le delai avant rupture medicament se reduit." },
    improving: { label: "S'ameliore",  explanation: "Le delai avant rupture medicament augmente." },
  },
  BATCH_MORTALITY_PREDICTIVE: {
    worsening: { label: "S'aggrave",   explanation: "Le risque de mortalite continue d augmenter sur ce lot." },
    improving: { label: "S'ameliore",  explanation: "Le risque de mortalite recule sur ce lot." },
  },
  BATCH_MARGIN_PREDICTIVE: {
    worsening: { label: "S'aggrave",   explanation: "La marge projetee continue de se degrader." },
    improving: { label: "S'ameliore",  explanation: "La marge projetee se redresse." },
  },
  MEDICINE_STOCK_EXPIRY: {
    worsening: { label: "S'aggrave",   explanation: "La peremption est tres proche (moins de 7 jours)." },
    improving: { label: "S'ameliore",  explanation: "Le stock se reconstitue ou la date s eloigne." },
  },
}

function getTrendCopy(
  resourceType: string | null,
  trend: "worsening" | "stable" | "improving" | undefined,
): { label: string; explanation: string } | null {
  if (!resourceType || !trend || trend === "stable") return null
  return TREND_COPY[resourceType]?.[trend] ?? null
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-gray-100 bg-gray-50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
      {children}
    </div>
  )
}

function NotificationRow({
  notification,
  onMarkRead,
  onArchive,
  onNavigate,
}: {
  notification: NotificationSummary
  onMarkRead: (id: string) => void
  onArchive: (id: string) => void
  onNavigate: (url: string, notification: NotificationSummary) => void
}) {
  const isUnread = notification.status === NotificationStatus.NON_LU
  const styles = getPriorityStyles(notification.priority, isUnread)

  return (
    <div
      className={cn(
        "group flex items-start gap-3 border-b border-gray-50 px-4 py-3 last:border-0",
        styles.row,
      )}
    >
      <span
        className={cn(
          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
          isUnread ? styles.dot : "bg-transparent",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {notification.priority === "high" && (
            <AlertTriangle className="h-3 w-3 shrink-0 text-red-500" aria-hidden="true" />
          )}
          <p className={cn(
            "text-xs font-semibold",
            notification.priority === "high" ? "text-red-900" : "text-gray-900",
          )}>
            {notification.title}
          </p>
          {notification.signalLabel && (
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", styles.signalBg)}>
              {notification.signalLabel}
            </span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{notification.message}</p>
        {/* Consequence supprimée si la tendance est à l'amélioration (la ligne trend suffit) */}
        {notification.consequence && notification.trend !== "improving" && (
          <p className={cn(
            "mt-1 text-[11px]",
            notification.priority === "high" ? "font-medium text-red-700" : "text-gray-700",
          )}>
            {notification.consequence}
          </p>
        )}
        {/* Ligne de tendance — icône + label + micro explication */}
        {(() => {
          const trendCopy = getTrendCopy(notification.resourceType, notification.trend)
          if (!trendCopy) return null
          const isWorsening = notification.trend === "worsening"
          return (
            <div className={cn(
              "mt-2 flex items-start gap-1.5 rounded-lg px-2 py-1.5",
              isWorsening ? "bg-red-50" : "bg-green-50",
            )}>
              {isWorsening
                ? <TrendingUp className="mt-px h-3 w-3 shrink-0 text-red-500" aria-hidden="true" />
                : <TrendingDown className="mt-px h-3 w-3 shrink-0 text-green-600" aria-hidden="true" />}
              <span className={cn(
                "shrink-0 text-[10px] font-semibold",
                isWorsening ? "text-red-700" : "text-green-700",
              )}>
                {trendCopy.label}
              </span>
              <span className="text-[10px] text-gray-500">—</span>
              <span className="text-[10px] text-gray-600">{trendCopy.explanation}</span>
            </div>
          )
        })()}
        {/* Bouton d'action plein-largeur pour les alertes critiques.
            worsening / stable / undefined → rouge (urgence maximale)
            improving                      → amber (situation se redresse, action utile mais moins urgente) */}
        {notification.priority === "high" && notification.actionUrl && (
          <button
            type="button"
            onClick={() => onNavigate(notification.actionUrl!, notification)}
            className={cn(
              "mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-colors",
              notification.trend === "improving"
                ? "bg-amber-500 hover:bg-amber-600 active:bg-amber-700"
                : "bg-red-600 hover:bg-red-700 active:bg-red-800",
            )}
          >
            {notification.actionLabel ?? "Agir maintenant"}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="mt-1.5 flex items-center gap-3">
          <p className="text-[10px] text-gray-400">{formatRelative(notification.createdAt)}</p>
          {notification.isRecurring && (
            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-400">
              Persistant
            </span>
          )}
          {/* Bouton action inline pour medium / low uniquement */}
          {notification.actionUrl && notification.priority !== "high" && (
            <button
              type="button"
              onClick={() => onNavigate(notification.actionUrl!, notification)}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors",
                notification.priority === "medium"
                  ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200",
              )}
            >
              {notification.actionLabel ?? "Voir"}
              <ArrowRight className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {isUnread && (
          <button
            type="button"
            onClick={() => onMarkRead(notification.id)}
            className="rounded p-1 hover:bg-gray-100"
            title="Marquer comme lu"
          >
            <Check className="h-3 w-3 text-gray-400" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onArchive(notification.id)}
          className="rounded p-1 hover:bg-gray-100"
          title="Archiver"
        >
          <X className="h-3 w-3 text-gray-400" />
        </button>
      </div>
    </div>
  )
}

function TeaserRow({ teaser }: { teaser: NotificationTeaser }) {
  const isCritical = teaser.signalTone === "critical"
  return (
    <div className={cn(
      "border-b border-gray-50 px-4 py-3 last:border-0",
      "border-l-2",
      isCritical ? "border-l-red-300 bg-red-50/50" : "border-l-amber-300 bg-amber-50/50",
    )}>
      <div className="flex flex-wrap items-center gap-1.5">
        <AlertTriangle className={cn("h-3 w-3 shrink-0", isCritical ? "text-red-500" : "text-amber-500")} aria-hidden="true" />
        <p className="text-xs font-semibold text-gray-900">{teaser.title}</p>
        <span className={cn(
          "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
          isCritical ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700",
        )}>
          {teaser.signalLabel}
        </span>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
          Pro
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-500">{teaser.message}</p>
      <p className={cn("mt-0.5 text-[11px] font-medium", isCritical ? "text-red-700" : "text-amber-700")}>
        {teaser.consequence}
      </p>
      <p className="mt-2 inline-flex rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-800">
        {teaser.ctaLabel}
      </p>
      {teaser.footerHint && (
        <p className="mt-1.5 text-[10px] text-gray-400">{teaser.footerHint}</p>
      )}
    </div>
  )
}

export function NotificationDropdown({ organizationId, unreadCount: initialUnreadCount }: NotificationDropdownProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationSummary[]>([])
  const [teasers, setTeasers] = useState<NotificationTeaser[]>([])
  const [loading, setLoading] = useState(false)
  const [localUnreadCount, setLocalUnreadCount] = useState(initialUnreadCount)
  const [showAllLow, setShowAllLow] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLocalUnreadCount(initialUnreadCount)
  }, [initialUnreadCount])

  useEffect(() => {
    if (!open) return

    setLoading(true)
    setShowAllLow(false)
    getNotifications({ organizationId, limit: 20 })
      .then((result) => {
        if (result.success) setNotifications(result.data)
      })
      .finally(() => setLoading(false))

    getNotificationTeasers({ organizationId })
      .then((result) => {
        if (result.success) setTeasers(result.data)
      })
  }, [open, organizationId])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  const handleMarkRead = async (notificationId: string) => {
    const result = await markNotificationRead({ organizationId, notificationId })
    if (!result.success) return

    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notificationId
          ? { ...n, status: NotificationStatus.LU, readAt: new Date() }
          : n,
      ),
    )
    setLocalUnreadCount((c) => Math.max(0, c - 1))
    router.refresh()
  }

  const handleMarkAllRead = async () => {
    const result = await markAllNotificationsRead({ organizationId })
    if (!result.success) return

    setNotifications((prev) =>
      prev.map((n) => ({ ...n, status: NotificationStatus.LU, readAt: n.readAt ?? new Date() })),
    )
    setLocalUnreadCount(0)
    router.refresh()
  }

  const handleArchive = async (notificationId: string) => {
    const wasUnread = notifications.find((n) => n.id === notificationId)?.status === NotificationStatus.NON_LU
    const result = await archiveNotification({ organizationId, notificationId })
    if (!result.success) return

    setNotifications((prev) => prev.filter((n) => n.id !== notificationId))
    if (wasUnread) setLocalUnreadCount((c) => Math.max(0, c - 1))
    router.refresh()
  }

  const handleNavigate = (url: string, notification?: NotificationSummary) => {
    setOpen(false)
    if (notification) {
      // fire and forget — ne bloque pas la navigation
      void trackAlertAction({
        resourceType: notification.resourceType ?? null,
        priority: notification.priority ?? null,
        trend: notification.trend ?? null,
        actionUrl: url,
      })
    }
    router.push(url)
  }

  const visibleNotifications = notifications.filter(
    (n) => n.status !== NotificationStatus.ARCHIVE,
  )

  // Grouper par priorité — le tri vient déjà du serveur
  const highPriority  = visibleNotifications.filter((n) => n.priority === "high")
  const mediumPriority = visibleNotifications.filter((n) => n.priority === "medium")
  const lowPriority   = visibleNotifications.filter((n) => n.priority === "low" || !n.priority)

  const LOW_COLLAPSE_THRESHOLD = 3
  const visibleLow = showAllLow ? lowPriority : lowPriority.slice(0, LOW_COLLAPSE_THRESHOLD)
  const hiddenLowCount = lowPriority.length - visibleLow.length

  const hasContent = visibleNotifications.length > 0 || teasers.length > 0

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
        aria-label={
          localUnreadCount > 0
            ? `${localUnreadCount} notification${localUnreadCount > 1 ? "s" : ""} non lue${localUnreadCount > 1 ? "s" : ""}`
            : "Notifications"
        }
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {localUnreadCount > 0 && (
          <span
            className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white"
            aria-hidden="true"
          >
            {localUnreadCount > 9 ? "9+" : localUnreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed right-4 top-16 z-50 w-[min(340px,calc(100vw-2rem))] rounded-2xl border border-gray-200 bg-white shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="text-sm font-semibold text-gray-900">
              Notifications
              {localUnreadCount > 0 && (
                <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">
                  {localUnreadCount}
                </span>
              )}
            </span>
            {localUnreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Tout lire
              </button>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-sm text-gray-400">Chargement...</div>
            ) : !hasContent ? (
              <div className="py-8 text-center text-sm text-gray-400">Aucune notification</div>
            ) : (
              <>
                {/* Alertes critiques */}
                {highPriority.length > 0 && (
                  <>
                    <SectionLabel>Critique</SectionLabel>
                    {highPriority.map((n) => (
                      <NotificationRow
                        key={n.id}
                        notification={n}
                        onMarkRead={handleMarkRead}
                        onArchive={handleArchive}
                        onNavigate={handleNavigate}
                      />
                    ))}
                  </>
                )}

                {/* Alertes importantes */}
                {mediumPriority.length > 0 && (
                  <>
                    <SectionLabel>Important</SectionLabel>
                    {mediumPriority.map((n) => (
                      <NotificationRow
                        key={n.id}
                        notification={n}
                        onMarkRead={handleMarkRead}
                        onArchive={handleArchive}
                        onNavigate={handleNavigate}
                      />
                    ))}
                  </>
                )}

                {/* Rappels simples — collapse après 3 */}
                {lowPriority.length > 0 && (
                  <>
                    <SectionLabel>Rappels</SectionLabel>
                    {visibleLow.map((n) => (
                      <NotificationRow
                        key={n.id}
                        notification={n}
                        onMarkRead={handleMarkRead}
                        onArchive={handleArchive}
                        onNavigate={handleNavigate}
                      />
                    ))}
                    {hiddenLowCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowAllLow(true)}
                        className="flex w-full items-center justify-center gap-1.5 border-b border-gray-50 py-2.5 text-[11px] font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                      >
                        <ChevronDown className="h-3 w-3" />
                        {hiddenLowCount} autre{hiddenLowCount > 1 ? "s" : ""} rappel{hiddenLowCount > 1 ? "s" : ""}
                      </button>
                    )}
                  </>
                )}

                {/* Teasers Pro */}
                {teasers.length > 0 && (
                  <>
                    <SectionLabel>Alertes Pro</SectionLabel>
                    {teasers.map((teaser) => (
                      <TeaserRow key={teaser.id} teaser={teaser} />
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
