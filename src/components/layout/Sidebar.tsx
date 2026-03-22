"use client"

/**
 * SunuFarm — Sidebar desktop
 *
 * - Visible uniquement en desktop (lg+), fixée sur la gauche
 * - usePathname() pour mettre en évidence le lien actif
 * - Tous les liens MVP répertoriés (les pages non encore créées renvoient 404)
 * - Logo + nom organisation en haut
 */

import Link from "next/link"
import { usePathname } from "next/navigation"
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

// ---------------------------------------------------------------------------
// Définition des liens de navigation
// ---------------------------------------------------------------------------

const navItems = [
  { href: "/dashboard",  label: "Tableau de bord",   icon: LayoutDashboard },
  { href: "/daily",     label: "Saisie journalière",icon: ClipboardList,   highlight: true },
  { href: "/batches",   label: "Lots d'élevage",    icon: Bird },
  { href: "/eggs",      label: "Production œufs",   icon: Egg },
  { href: "/farms",     label: "Fermes & Bâtiments",icon: Warehouse },
  { href: "/stock",     label: "Stock",             icon: Package },
  { href: "/sales",     label: "Ventes",            icon: ShoppingCart },
  { href: "/customers", label: "Clients",           icon: Users },
  { href: "/purchases", label: "Achats",            icon: ShoppingBag },
  { href: "/health",    label: "Santé animale",     icon: Syringe },
  { href: "/finances",  label: "Finances",          icon: DollarSign },
  { href: "/reports",   label: "Rapports",          icon: BarChart3 },
] as const

const bottomNavItems = [
  { href: "/team",     label: "Équipe",      icon: Users },
  { href: "/settings", label: "Paramètres",  icon: Settings },
] as const

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

interface SidebarProps {
  orgName: string
}

export function Sidebar({ orgName }: SidebarProps) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard"
    return pathname.startsWith(href)
  }

  return (
    <aside className="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:flex-col lg:border-r lg:border-gray-200 lg:bg-white lg:shadow-sm">
      {/* En-tête : logo + nom organisation */}
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

      {/* Navigation principale */}
      <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-0.5">
          {navItems.map(({ href, label, icon: Icon, ...rest }) => {
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

        {/* Séparateur */}
        <div className="my-4 border-t border-gray-100" />

        {/* Navigation bas (équipe, paramètres) */}
        <ul className="flex flex-col gap-0.5">
          {bottomNavItems.map(({ href, label, icon: Icon }) => {
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
      </nav>
    </aside>
  )
}
