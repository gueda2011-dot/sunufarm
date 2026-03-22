"use client"

/**
 * SunuFarm — Historique des 14 dernières saisies du lot
 *
 * Couverture doublon partielle (best-effort) :
 *   La mention en sous-titre rappelle que seuls les records chargés sont testés.
 *   La contrainte serveur @@batchId_date reste la vraie source de vérité.
 *
 * La ligne correspondant à la date sélectionnée est mise en évidence (fond vert).
 * Les saisies verrouillées affichent une icône cadenas.
 * La mortalité > 0 est affichée en rouge pour une lecture terrain rapide.
 */

import { formatDate }        from "@/src/lib/formatters"
import type { DailyRecordDetail } from "@/src/actions/daily-records"
import { cn }                from "@/src/lib/utils"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RecentRecordsProps {
  records:      DailyRecordDetail[]
  isLoading:    boolean
  selectedDate: string   // YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compare date Prisma (UTC minuit) avec chaîne YYYY-MM-DD du HTML input */
function isSameDay(recordDate: Date, dateStr: string): boolean {
  return new Date(recordDate).toISOString().substring(0, 10) === dateStr
}

function formatFeed(kg: number): string {
  return `${kg % 1 === 0 ? kg : kg.toFixed(1)} kg`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecentRecords({ records, isLoading, selectedDate }: RecentRecordsProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">

      {/* En-tête */}
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">
          Historique récent
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">
          14 dernières saisies · détection doublon client partielle
        </p>
      </div>

      {/* Loading shimmer */}
      {isLoading && (
        <div className="p-3 space-y-2">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-10 rounded-lg bg-gray-100 animate-pulse"
              style={{ opacity: 1 - i * 0.2 }}
            />
          ))}
        </div>
      )}

      {/* État vide */}
      {!isLoading && records.length === 0 && (
        <div className="px-4 py-10 text-center text-sm text-gray-400">
          Aucune saisie pour ce lot
        </div>
      )}

      {/* Table */}
      {!isLoading && records.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <th className="px-4 py-2.5 text-left">Date</th>
                <th className="px-4 py-2.5 text-right">Mort.</th>
                <th className="px-4 py-2.5 text-right">Aliment</th>
                <th className="px-4 py-2.5 text-right">Eau</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const isSelected = isSameDay(record.date, selectedDate)

                return (
                  <tr
                    key={record.id}
                    className={cn(
                      "border-b border-gray-50 last:border-0",
                      isSelected ? "bg-green-50" : "hover:bg-gray-50",
                    )}
                  >
                    {/* Date */}
                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                      {isSelected && (
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 mb-0.5 align-middle"
                          aria-hidden
                        />
                      )}
                      {formatDate(record.date)}
                      {record.isLocked && (
                        <span className="ml-1.5 text-xs text-gray-400" title="Verrouillée">
                          🔒
                        </span>
                      )}
                    </td>

                    {/* Mortalité */}
                    <td className="px-4 py-3 text-right tabular-nums">
                      {record.mortality > 0 ? (
                        <span className="text-red-600 font-semibold">
                          {record.mortality}
                        </span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>

                    {/* Aliment */}
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700 whitespace-nowrap">
                      {formatFeed(record.feedKg)}
                    </td>

                    {/* Eau */}
                    <td className="px-4 py-3 text-right tabular-nums text-gray-500 whitespace-nowrap">
                      {record.waterLiters != null ? `${record.waterLiters} L` : "—"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
