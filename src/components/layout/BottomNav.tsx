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
  Warehouse,
  BarChart3,
  Building2,
  Menu,
  Egg,
  Package,
  ShoppingCart,
  ShoppingBag,
  Syringe,
  Users,
  Settings,
  DollarSign,
  X,
} from "lucide-react"
import { useState } from "react"
import { cn } from "@/src/lib/utils"
import { hasModuleAccess } from "@/src/lib/permissions"
import { hasPlanFeature } from "@/src/lib/subscriptions"

const tabs = [
  { href: "/dashboard", label: "Accueil", icon: LayoutDashboard, module: "DASHBOARD" as const },
  { href: "/daily", label: "Saisie", icon: ClipboardList, primary: true, module: "DAILY" as const },
  { href: "/batches", label: "Lots", icon: Bird, module: "BATCHES" as const },
  { href: "/farms", label: "Fermes", icon: Warehouse, module: "FARMS" as const },
] as const

const moreLinks = [
  { href: "/eggs", label: "Production oeufs", icon: Egg, module: "EGGS" as const },
  { href: "/reports", label: "Rapports", icon: BarChart3, module: "REPORTS" as const, feature: "REPORTS" as const },
  { href: "/business", label: "Business", icon: Building2, module: "DASHBOARD" as const, feature: "GLOBAL_ANALYTICS" as const },
  { href: "/stock", label: "Stock", icon: Package, module: "STOCK" as const },
  { href: "/sales", label: "Ventes", icon: ShoppingCart, module: "SALES" as const },
  { href: "/customers", label: "Clients", icon: Users, module: "CUSTOMERS" as const },
  { href: "/suppliers", label: "Fournisseurs", icon: Users, module: "SUPPLIERS" as const },
  { href: "/purchases", label: "Achats fournisseur", icon: ShoppingBag, module: "PURCHASES" as const },
  { href: "/health", label: "Sante animale", icon: Syringe, module: "HEALTH" as const },
  { href: "/finances", label: "Depenses", icon: DollarSign, module: "FINANCES" as const },
  { href: "/team", label: "Equipe", icon: Users, module: "TEAM" as const },
  { href: "/settings", label: "Abonnement", icon: Settings, module: "SETTINGS" as const },
] as const

interface BottomNavProps {
  plan: SubscriptionPlan
  role: UserRole
  modulePermissions: unknown
}

export function BottomNav({ plan, role, modulePermissions }: BottomNavProps) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const visibleTabs = tabs.filter((item) => (
    hasModuleAccess(role, modulePermissions, item.module)
  ))
  const visibleMoreLinks = moreLinks.filter((item) => {
    if (!hasModuleAccess(role, modulePermissions, item.module)) {
      return false
    }

    if ("feature" in item && item.feature) {
      return hasPlanFeature(plan, item.feature)
    }

    return true
  })

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard"
    return pathname.startsWith(href)
  }

  return (
    <>
      {menuOpen && visibleMoreLinks.length > 0 && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setMenuOpen(false)} />
      )}

      {menuOpen && visibleMoreLinks.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-50 rounded-t-3xl border-t border-gray-200 bg-white px-4 pb-5 pt-4 shadow-2xl lg:hidden">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-base font-semibold text-gray-900">Plus d&apos;actions</p>
              <p className="text-sm text-gray-500">Accedez aux modules autorises pour ce compte.</p>
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600"
              aria-label="Fermer le menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {visibleMoreLinks.map(({ href, label, icon: Icon }) => {
              const active = isActive(href)

              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition-colors",
                    active
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5 shrink-0",
                      active ? "text-green-600" : "text-gray-400",
                    )}
                    aria-hidden="true"
                  />
                  <span>{label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-stretch border-t border-gray-200 bg-white lg:hidden"
        aria-label="Navigation mobile"
      >
        {visibleTabs.map(({ href, label, icon: Icon, ...rest }) => {
          const active = isActive(href)
          const primary = "primary" in rest && rest.primary

          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                active
                  ? "text-green-600"
                  : primary
                    ? "text-gray-500 hover:text-green-600"
                    : "text-gray-500 hover:text-gray-700",
              )}
              aria-current={active ? "page" : undefined}
              aria-label={label}
            >
              <Icon
                className={cn(
                  "h-5 w-5",
                  active ? "text-green-600" : "text-gray-400",
                  primary && !active && "text-green-500",
                )}
                aria-hidden="true"
              />
              <span>{label}</span>
            </Link>
          )
        })}

        {visibleMoreLinks.length > 0 && (
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
              menuOpen ? "text-green-600" : "text-gray-500 hover:text-gray-700",
            )}
            aria-expanded={menuOpen}
            aria-label="Plus"
          >
            <Menu
              className={cn("h-5 w-5", menuOpen ? "text-green-600" : "text-gray-400")}
              aria-hidden="true"
            />
            <span>Plus</span>
          </button>
        )}
      </nav>
    </>
  )
}
