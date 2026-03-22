/**
 * SunuFarm — Bandeau d'alerte saisie manquante (dashboard)
 *
 * Affiché uniquement si au moins un lot actif n'a pas de saisie depuis 48h.
 * Composant de présentation pur — reçoit le compte et les numéros de lots concernés.
 */

import Link from "next/link"

interface AlertBannerProps {
  /** Lots actifs sans saisie depuis > 48h */
  batchesNeedingSaisie: Array<{ id: string; number: string }>
}

export function AlertBanner({ batchesNeedingSaisie }: AlertBannerProps) {
  if (batchesNeedingSaisie.length === 0) return null

  const count = batchesNeedingSaisie.length
  const label = count === 1
    ? `1 lot sans saisie depuis plus de 2 jours`
    : `${count} lots sans saisie depuis plus de 2 jours`

  // Affiche les 3 premiers numéros de lot pour donner du contexte
  const preview = batchesNeedingSaisie
    .slice(0, 3)
    .map((b) => b.number)
    .join(", ")
  const hasMore = count > 3

  return (
    <div className="rounded-xl bg-orange-50 border border-orange-200 px-4 py-3 flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-orange-800">{label}</p>
        <p className="text-xs text-orange-600 mt-0.5 truncate">
          {preview}{hasMore ? ` +${count - 3} autre${count - 3 > 1 ? "s" : ""}` : ""}
        </p>
      </div>
      <Link
        href="/daily"
        className="shrink-0 rounded-lg bg-orange-600 text-white text-sm font-medium px-3 py-1.5 hover:bg-orange-700 transition-colors"
      >
        Saisir
      </Link>
    </div>
  )
}
