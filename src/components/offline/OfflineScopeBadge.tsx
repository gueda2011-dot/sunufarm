"use client"

const SCOPE_LABELS: Record<string, string> = {
  daily: "Saisie journaliere",
  health: "Sante",
  stock: "Stock",
  sales: "Ventes",
  eggs: "Oeufs",
  purchases: "Achats",
  expenses: "Depenses",
}

export function OfflineScopeBadge({
  scope,
  count,
}: {
  scope: string
  count: number
}) {
  return (
    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
      {SCOPE_LABELS[scope] ?? scope}: {count}
    </span>
  )
}
