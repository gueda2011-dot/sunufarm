"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  type SubscriptionPlan,
  type UserRole,
} from "@/src/generated/prisma/client"
import {
  LayoutDashboard,
  ClipboardList,
  Bird,
  Egg,
  Warehouse,
  Package,
  ShoppingCart,
  ShoppingBag,
  Syringe,
  DollarSign,
  BarChart3,
  Users,
  Settings,
} from "lucide-react"
import { cn } from "@/src/lib/utils"
import { hasModuleAccess } from "@/src/lib/permissions"
import { hasPlanFeature } from "@/src/lib/subscriptions"

const navItems = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, module: "DASHBOARD" as const },
  { href: "/daily", label: "Saisie journaliere", icon: ClipboardList, highlight: true, module: "DAILY" as const },
  { href: "/batches", label: "Lots d'elevage", icon: Bird, module: "BATCHES" as const },
  { href: "/eggs", label: "Production oeufs", icon: Egg, module: "EGGS" as const },
  { href: "/farms", label: "Fermes & batiments", icon: Warehouse, module: "FARMS" as const },
  { href: "/stock", label: "Stock", icon: Package, module: "STOCK" as const },
  { href: "/sales", label: "Ventes", icon: ShoppingCart, module: "SALES" as const },
  { href: "/customers", label: "Clients", icon: Users, module: "CUSTOMERS" as const },
  { href: "/suppliers", label: "Fournisseurs", icon: Users, module: "SUPPLIERS" as const },
  { href: "/purchases", label: "Achats", icon: ShoppingBag, module: "PURCHASES" as const },
  { href: "/health", label: "Sante animale", icon: Syringe, module: "HEALTH" as const },
  { href: "/finances", label: "Finances", icon: DollarSign, module: "FINANCES" as const },
  { href: "/reports", label: "Rapports", icon: BarChart3, module: "REPORTS" as const },
] as const

const bottomNavItems = [
  { href: "/team", label: "Equipe", icon: Users, module: "TEAM" as const },
  { href: "/settings", label: "Abonnement", icon: Settings, module: "SETTINGS" as const },
] as const

interface SidebarProps {
  orgName: string
  plan: SubscriptionPlan
  role: UserRole
  modulePermissions: unknown
}

export function Sidebar({ orgName, plan, role, modulePermissions }: SidebarProps) {
  const pathname = usePathname()
  const visibleNavItems = navItems.filter((item) => {
    if (!hasModuleAccess(role, modulePermissions, item.module)) {
      return false
    }

    if (item.href === "/reports") {
      return hasPlanFeature(plan, "REPORTS")
    }

    return true
  })
  const visibleBottomNavItems = bottomNavItems.filter((item) => (
    hasModuleAccess(role, modulePermissions, item.module)
  ))

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard"
    return pathname.startsWith(href)
  }

  return (
    <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-gray-200 lg:bg-white lg:shadow-sm">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-gray-200 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-600">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-white" aria-hidden="true">
            <path
              d="M12 3C9 3 6 5 6 8c0 2 1 3.5 2.5 4.5L8 18h8l-.5-5.5C17 11.5 18 10 18 8c0-3-3-5-6-5z"
              fill="currentColor"
              opacity="0.9"
            />
            <circle cx="10" cy="7" r="1" fill="white" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-gray-900">SunuFarm</p>
          <p className="truncate text-xs text-gray-500">{orgName}</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-0.5">
          {visibleNavItems.map(({ href, label, icon: Icon, ...rest }) => {
            const active = isActive(href)
            const highlighted = "highlight" in rest && rest.highlight

            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-green-50 text-green-700"
                      : highlighted
                        ? "text-green-600 hover:bg-green-50 hover:text-green-700"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5 shrink-0",
                      active ? "text-green-600" : highlighted ? "text-green-500" : "text-gray-400",
                    )}
                    aria-hidden="true"
                  />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>

        {visibleBottomNavItems.length > 0 && (
          <>
            <div className="my-4 border-t border-gray-100" />

            <ul className="flex flex-col gap-0.5">
              {visibleBottomNavItems.map(({ href, label, icon: Icon }) => {
                const active = isActive(href)

                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        active
                          ? "bg-green-50 text-green-700"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon
                        className={cn(
                          "h-5 w-5 shrink-0",
                          active ? "text-green-600" : "text-gray-400",
                        )}
                        aria-hidden="true"
                      />
                      {label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </nav>
    </aside>
  )
}
