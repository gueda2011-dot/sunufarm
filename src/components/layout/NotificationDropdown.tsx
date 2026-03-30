"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, Check, CheckCheck, X } from "lucide-react"
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  archiveNotification,
  type NotificationSummary,
} from "@/src/actions/notifications"
import { cn } from "@/src/lib/utils"
import { NotificationStatus } from "@/src/generated/prisma/client"

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

export function NotificationDropdown({ organizationId, unreadCount: initialUnreadCount }: NotificationDropdownProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [localUnreadCount, setLocalUnreadCount] = useState(initialUnreadCount)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLocalUnreadCount(initialUnreadCount)
  }, [initialUnreadCount])

  useEffect(() => {
    if (!open) return

    setLoading(true)
    getNotifications({ organizationId, limit: 20 })
      .then((result) => {
        if (result.success) setNotifications(result.data)
      })
      .finally(() => setLoading(false))
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

  const visibleNotifications = notifications.filter(
    (n) => n.status !== NotificationStatus.ARCHIVE,
  )

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
        <div className="fixed right-4 top-16 z-50 w-[min(320px,calc(100vw-2rem))] rounded-2xl border border-gray-200 bg-white shadow-lg">
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

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-sm text-gray-400">Chargement...</div>
            ) : visibleNotifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">Aucune notification</div>
            ) : (
              visibleNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "group flex items-start gap-3 border-b border-gray-50 px-4 py-3 last:border-0",
                    notification.status === NotificationStatus.NON_LU && "bg-green-50",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      notification.status === NotificationStatus.NON_LU
                        ? "bg-green-500"
                        : "bg-transparent",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-900">{notification.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{notification.message}</p>
                    <p className="mt-1 text-[10px] text-gray-400">{formatRelative(notification.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {notification.status === NotificationStatus.NON_LU && (
                      <button
                        type="button"
                        onClick={() => handleMarkRead(notification.id)}
                        className="rounded p-1 hover:bg-gray-100"
                        title="Marquer comme lu"
                      >
                        <Check className="h-3 w-3 text-gray-400" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleArchive(notification.id)}
                      className="rounded p-1 hover:bg-gray-100"
                      title="Archiver"
                    >
                      <X className="h-3 w-3 text-gray-400" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
