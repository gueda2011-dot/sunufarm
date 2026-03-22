"use client"

/**
 * SunuFarm — Navigation mobile (bottom bar)
 *
 * 5 onglets : Accueil | Saisie | Lots | Stats | Menu
 * - Visible uniquement sur mobile (< lg), cachée sur desktop
 * - Ancrée en bas de l'écran, pleine largeur
 * - Touch targets 44×44px minimum (règle SunuFarm)
 * - usePathname() pour l'état actif
 *
 * Saisie est mis en avant (couleur primaire) car c'est l'écran principal terrain.
 */

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  ClipboardList,
  Bird,
  BarChart3,
  Menu,
} from "lucide-react"
import { cn } from "@/src/lib/utils"

const tabs = [
  { href: "/",         label: "Accueil",  icon: LayoutDashboard },
  { href: "/daily",    label: "Saisie",   icon: ClipboardList,   primary: true },
  { href: "/batches",  label: "Lots",     icon: Bird },
  { href: "/reports",  label: "Stats",    icon: BarChart3 },
  { href: "/settings", label: "Menu",     icon: Menu },
] as const

export function BottomNav() {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/"
    return pathname.startsWith(href)
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-stretch border-t border-gray-200 bg-white lg:hidden"
      aria-label="Navigation mobile"
    >
      {tabs.map(({ href, label, icon: Icon, ...rest }) => {
        const active    = isActive(href)
        const primary   = "primary" in rest && rest.primary

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              // Touch target min 44px (flex-1 remplit la largeur)
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
              active
                ? primary
                  ? "text-green-600"
                  : "text-green-600"
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
    </nav>
  )
}
