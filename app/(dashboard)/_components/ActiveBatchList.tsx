/**
 * SunuFarm — Liste des lots actifs (dashboard)
 *
 * Mini-cards compactes — moins détaillées que BatchCard de la liste /batches.
 * Triées par âge décroissant (lots les plus vieux en premier — les plus critiques).
 *
 * Affiche au maximum 10 lots. Si davantage, lien "Voir tous les lots →".
 * Réutilise les mêmes helpers que BatchCard (computeAgeDay, shouldShowNoRecordsBadge).
 */

import Link                   from "next/link"
import { useState }           from "react"
import { cn, batchAgeDay, diffDays } from "@/src/lib/utils"
import { formatNumber }       from "@/src/lib/formatters"
import type { BatchSummary }  from "@/src/actions/batches"

// ---------------------------------------------------------------------------
// Helpers (même logique que BatchCard — dupliqués ici pour garder les composants découplés)
// ---------------------------------------------------------------------------

function computeAgeDay(batch: BatchSummary, now: Date): number {
  return batchAgeDay(batch.entryDate, batch.entryAgeDay, now)
}

function hasNoSaisie(batch: BatchSummary, now: Date): boolean {
  if (batch._count.dailyRecords > 0) return false
  const daysSinceEntry = diffDays(batch.entryDate, now)
  return daysSinceEntry > 1
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ActiveBatchListProps {
  /** Lots actifs triés par âge décroissant — la page se charge du tri */
  batches:             BatchSummary[]
  /** IDs des lots détectés comme manquant leur saisie récente (48h) */
  batchesNeedingSaisieIds: Set<string>
  totalActiveBatches:  number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MAX_DISPLAYED = 10

export function ActiveBatchList({
  batches,
  batchesNeedingSaisieIds,
  totalActiveBatches,
}: ActiveBatchListProps) {
  const [now] = useState(() => new Date())

  // ── État vide ─────────────────────────────────────────────────────────
  if (batches.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white py-16 text-center">
        <p className="text-4xl mb-3" aria-hidden>🐓</p>
        <h2 className="text-base font-semibold text-gray-900 mb-1">
          Aucun lot actif
        </h2>
        <p className="text-sm text-gray-400 mb-4">
          Créez un lot pour démarrer le suivi de production.
        </p>
        <Link
          href="/batches"
          className="inline-block rounded-xl bg-green-600 text-white text-sm font-medium px-4 py-2.5 hover:bg-green-700 transition-colors"
        >
          Gérer les lots
        </Link>
      </div>
    )
  }

  const displayed  = batches.slice(0, MAX_DISPLAYED)
  const hasMore    = totalActiveBatches > MAX_DISPLAYED

  return (
    <div className="space-y-3">

      {/* ── Titre + lien liste complète ────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Lots actifs
        </h2>
        <Link
          href="/batches"
          className="text-xs text-green-600 hover:text-green-700 hover:underline"
        >
          Voir tous →
        </Link>
      </div>

      {/* ── Cards ─────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {displayed.map((batch) => {
          const ageDay      = computeAgeDay(batch, now)
          const noSaisie    = batchesNeedingSaisieIds.has(batch.id) || hasNoSaisie(batch, now)

          return (
            <div
              key={batch.id}
              className="rounded-xl border border-gray-200 bg-white hover:border-green-200 hover:shadow-sm transition-all duration-150"
            >
              {/* Zone principale → détail lot */}
              <Link href={`/batches/${batch.id}`} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 text-sm">
                      {batch.number}
                    </span>
                    {noSaisie && (
                      <span className="text-xs font-medium text-orange-700 bg-orange-50 border border-orange-100 rounded-full px-2 py-0.5 whitespace-nowrap">
                        Saisie manquante
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5 truncate">
                    {batch.building.farm.name} · {batch.building.name}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs text-gray-500 tabular-nums">
                  <div className="font-medium text-gray-700">Jour {ageDay}</div>
                  <div>{formatNumber(batch.entryCount)} sujets</div>
                </div>
              </Link>

              {/* Footer → bouton Saisir */}
              <div className="border-t border-gray-50 px-4 py-2 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {batch._count.dailyRecords} saisie{batch._count.dailyRecords !== 1 ? "s" : ""}
                </span>
                <Link
                  href={`/daily?batchId=${batch.id}`}
                  className={cn(
                    "text-xs font-medium rounded-lg px-3 py-1 transition-colors whitespace-nowrap",
                    noSaisie
                      ? "bg-orange-600 text-white hover:bg-orange-700"
                      : "border border-green-200 text-green-700 hover:bg-green-50",
                  )}
                >
                  Saisir
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Lien "Voir plus" si > 10 lots ────────────────────────────── */}
      {hasMore && (
        <Link
          href="/batches"
          className="block text-center text-sm text-green-600 hover:text-green-700 hover:underline py-2"
        >
          Voir les {totalActiveBatches - MAX_DISPLAYED} autres lots actifs →
        </Link>
      )}
    </div>
  )
}
