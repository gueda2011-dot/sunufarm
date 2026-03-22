/**
 * SunuFarm — 7 dernières saisies journalières du lot
 *
 * Composant de présentation pur — reçoit les 7 records déjà tranchés par la page.
 * Affiche : Date | Mortalité | Aliment | Eau | Poids moyen
 * La mortalité > 0 est mise en rouge pour attirer l'attention.
 */

import Link                      from "next/link"
import { formatDate, formatWeight } from "@/src/lib/formatters"
import type { DailyRecordDetail } from "@/src/actions/daily-records"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RecentDailyRecordsProps {
  records: DailyRecordDetail[]
  batchId: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecentDailyRecords({ records, batchId }: RecentDailyRecordsProps) {
  return (
    <div className="space-y-3">

      {/* ── Titre + lien historique complet ──────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Saisies récentes
        </h2>
        <Link
          href={`/daily?batchId=${batchId}`}
          className="text-xs text-green-600 hover:text-green-700 hover:underline"
        >
          Saisir / Voir tout
        </Link>
      </div>

      {/* ── État vide ─────────────────────────────────────────────────── */}
      {records.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-400">
          Aucune saisie pour ce lot.
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────── */}
      {records.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Date</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400">Mort.</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400">Aliment</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400">Eau</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400">Poids moy.</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record, i) => (
                  <tr
                    key={record.id}
                    className={i < records.length - 1 ? "border-b border-gray-50" : ""}
                  >
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                      {formatDate(record.date)}
                      {record.isLocked && (
                        <span className="ml-1.5 text-gray-300 text-xs" title="Verrouillé">
                          🔒
                        </span>
                      )}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-medium tabular-nums whitespace-nowrap ${
                      record.mortality > 0 ? "text-red-600" : "text-gray-700"
                    }`}>
                      {record.mortality > 0 ? `+${record.mortality}` : "0"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums whitespace-nowrap">
                      {record.feedKg} kg
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums whitespace-nowrap">
                      {record.waterLiters != null ? `${record.waterLiters} L` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums whitespace-nowrap">
                      {formatWeight(record.avgWeightG)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
