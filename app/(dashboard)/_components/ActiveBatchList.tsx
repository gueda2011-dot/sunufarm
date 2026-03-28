/**
 * SunuFarm - Liste des lots actifs (dashboard)
 */

import Link from "next/link"
import { cn } from "@/src/lib/utils"
import { formatNumber } from "@/src/lib/formatters"
import type { DashboardBatchCardView } from "@/src/lib/dashboard-view"

interface ActiveBatchListProps {
  batches: DashboardBatchCardView[]
  totalActiveBatches: number
}

const MAX_DISPLAYED = 10

export function ActiveBatchList({
  batches,
  totalActiveBatches,
}: ActiveBatchListProps) {
  if (batches.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white py-16 text-center">
        <p className="mb-3 text-4xl" aria-hidden>SF</p>
        <h2 className="mb-1 text-base font-semibold text-gray-900">
          Aucun lot actif
        </h2>
        <p className="mb-4 text-sm text-gray-400">
          Creez un lot pour demarrer le suivi de production.
        </p>
        <Link
          href="/batches"
          className="inline-block rounded-xl bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
        >
          Gerer les lots
        </Link>
      </div>
    )
  }

  const displayed = batches.slice(0, MAX_DISPLAYED)
  const hasMore = totalActiveBatches > MAX_DISPLAYED

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Lots actifs
        </h2>
        <Link
          href="/batches"
          className="text-xs text-green-600 hover:text-green-700 hover:underline"
        >
          Voir tous →
        </Link>
      </div>

      <div className="space-y-2">
        {displayed.map((batch) => (
          <div
            key={batch.id}
            className="rounded-xl border border-gray-200 bg-white transition-all duration-150 hover:border-green-200 hover:shadow-sm"
          >
            <Link href={`/batches/${batch.id}`} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">
                    {batch.number}
                  </span>
                  {batch.needsSaisie && (
                    <span className="whitespace-nowrap rounded-full border border-orange-100 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
                      Saisie manquante
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs text-gray-400">
                  {batch.farmName} · {batch.buildingName}
                </div>
              </div>
              <div className="shrink-0 text-right text-xs tabular-nums text-gray-500">
                <div className="font-medium text-gray-700">Jour {batch.ageDay}</div>
                <div>{formatNumber(batch.entryCount)} sujets</div>
              </div>
            </Link>

            <div className="flex items-center justify-between border-t border-gray-50 px-4 py-2">
              <span className="text-xs text-gray-400">
                {batch.dailyRecordsCount} saisie{batch.dailyRecordsCount !== 1 ? "s" : ""}
              </span>
              <Link
                href={`/daily?batchId=${batch.id}`}
                className={cn(
                  "whitespace-nowrap rounded-lg px-3 py-1 text-xs font-medium transition-colors",
                  batch.needsSaisie
                    ? "bg-orange-600 text-white hover:bg-orange-700"
                    : "border border-green-200 text-green-700 hover:bg-green-50",
                )}
              >
                Saisir
              </Link>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <Link
          href="/batches"
          className="block py-2 text-center text-sm text-green-600 hover:text-green-700 hover:underline"
        >
          Voir les {totalActiveBatches - MAX_DISPLAYED} autres lots actifs →
        </Link>
      )}
    </div>
  )
}
