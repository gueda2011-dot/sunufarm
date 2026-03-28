"use client"

/**
 * SunuFarm - Header dashboard
 *
 * Contenu :
 *   - Nom de l'organisation active (affiche a gauche, visible sur mobile)
 *   - Cloche notifications (badge rouge si count > 0)
 *   - Avatar + nom utilisateur + dropdown (deconnexion)
 *
 * Note : Le Header est un Client Component car il gere le dropdown et
 * la deconnexion via signOut(). Les donnees (orgName, userName) sont
 * passees depuis le Server Component parent (dashboard layout).
 */

import { useState, useRef, useEffect } from "react"
import { signOut } from "next-auth/react"
import { type SubscriptionPlan } from "@/src/generated/prisma/client"
import { Bell, LogOut, User, ChevronDown } from "lucide-react"
import { SunuFarmLogo } from "@/src/components/branding/SunuFarmLogo"
import { OrganizationSwitcher } from "@/src/components/layout/OrganizationSwitcher"
import type { OrganizationMembershipSummary } from "@/src/lib/active-organization"
import { formatAiCredits, formatRemainingDays } from "@/src/lib/formatters"
import { cn } from "@/src/lib/utils"

interface HeaderProps {
  orgName: string
  plan: SubscriptionPlan
  memberships: OrganizationMembershipSummary[]
  activeOrganizationId: string
  userName: string
  userEmail: string
  unreadCount?: number
  trialDaysRemaining?: number | null
  aiCreditsRemaining?: number
}

export function Header({
  orgName,
  plan,
  memberships,
  activeOrganizationId,
  userName,
  userEmail,
  unreadCount = 0,
  trialDaysRemaining = null,
  aiCreditsRemaining,
}: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [dropdownOpen])

  const initials = userName
    .split(" ")
    .map((word) => word[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("")
    || userEmail[0]?.toUpperCase()
    || "U"

  const handleSignOut = async () => {
    setDropdownOpen(false)
    await signOut({ callbackUrl: "/login" })
  }

  return (
    <header className="sticky top-0 z-30 flex min-h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-2 shadow-sm sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3 lg:hidden">
        <SunuFarmLogo
          showText={false}
          iconClassName="w-12"
          className="shrink-0"
          priority
        />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="max-w-[160px] truncate text-sm font-semibold text-gray-900">
            {orgName}
          </span>
          <OrganizationSwitcher
            memberships={memberships}
            activeOrganizationId={activeOrganizationId}
          />
        </div>
      </div>

      <div className="hidden lg:flex lg:items-center lg:gap-3">
        <OrganizationSwitcher
          memberships={memberships}
          activeOrganizationId={activeOrganizationId}
        />
        {trialDaysRemaining !== null ? (
          <span className={cn(
            "rounded-full border px-3 py-1 text-xs font-semibold",
            trialDaysRemaining <= 2
              ? "border-orange-200 bg-orange-50 text-orange-700"
              : "border-blue-200 bg-blue-50 text-blue-700",
          )}>
            Essai - {formatRemainingDays(trialDaysRemaining)}
          </span>
        ) : (
          <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-green-700">
            Plan {plan}
          </span>
        )}

        {aiCreditsRemaining !== undefined && aiCreditsRemaining !== -1 && (
          <span className={cn(
            "rounded-full border px-3 py-1 text-xs font-semibold",
            aiCreditsRemaining === 0
              ? "border-red-200 bg-red-50 text-red-600"
              : "border-purple-200 bg-purple-50 text-purple-700",
          )}>
            {formatAiCredits(aiCreditsRemaining)}
          </span>
        )}
      </div>

      {trialDaysRemaining !== null && (
        <div className="flex items-center lg:hidden">
          <span className={cn(
            "rounded-full border px-2 py-0.5 text-xs font-semibold",
            trialDaysRemaining <= 2
              ? "border-orange-200 bg-orange-50 text-orange-700"
              : "border-blue-200 bg-blue-50 text-blue-700",
          )}>
            Essai {trialDaysRemaining}j
          </span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="relative flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label={
            unreadCount > 0
              ? `${unreadCount} notification${unreadCount > 1 ? "s" : ""} non lue${unreadCount > 1 ? "s" : ""}`
              : "Notifications"
          }
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white"
              aria-hidden="true"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-100"
            aria-expanded={dropdownOpen}
            aria-haspopup="true"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white">
              {initials}
            </div>
            <span className="hidden max-w-[120px] truncate text-sm font-medium text-gray-700 sm:block">
              {userName || userEmail}
            </span>
            <ChevronDown
              className={cn(
                "hidden h-4 w-4 text-gray-400 transition-transform sm:block",
                dropdownOpen && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-1 w-56 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
              <div className="border-b border-gray-100 px-4 py-3">
                <p className="truncate text-sm font-medium text-gray-900">
                  {userName || "Utilisateur"}
                </p>
                <p className="truncate text-xs text-gray-500">{userEmail}</p>
              </div>

              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                disabled
              >
                <User className="h-4 w-4" aria-hidden="true" />
                Mon profil
                <span className="ml-auto text-xs text-gray-400">V2</span>
              </button>

              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Se deconnecter
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
