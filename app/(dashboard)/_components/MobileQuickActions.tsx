import Link from "next/link"
import {
  ClipboardList,
  PlusCircle,
  Warehouse,
  BarChart3,
} from "lucide-react"

const actions = [
  { href: "/daily", label: "Saisir", icon: ClipboardList },
  { href: "/batches/new", label: "Nouveau lot", icon: PlusCircle },
  { href: "/farms", label: "Fermes", icon: Warehouse },
  { href: "/reports", label: "Rapports", icon: BarChart3 },
] as const

export function MobileQuickActions() {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm lg:hidden">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Actions rapides</h2>
        <p className="mt-1 text-xs text-gray-500">
          Les ecrans les plus utiles sur telephone.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {actions.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 transition hover:border-green-200 hover:bg-green-50 hover:text-green-700"
          >
            <Icon className="h-5 w-5 text-green-600" aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
