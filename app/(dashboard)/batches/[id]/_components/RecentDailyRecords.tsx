/**
 * SunuFarm — 7 dernières saisies journalières du lot
 *
 * Composant de présentation pur — reçoit les 7 records déjà tranchés par la page.
 * Affiche : Date | Mortalité | Aliment | Eau | Poids moyen
 * La mortalité > 0 est mise en rouge pour attirer l'attention.
 */

import Link                      from "next/link"
import { Lock, Zap }             from "lucide-react"
import { formatDate, formatWeight } from "@/src/lib/formatters"
import type { DailyRecordDetail } from "@/src/actions/daily-records"
import { COMMERCIAL_PLAN_CATALOG } from "@/src/lib/offer-catalog"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RecentDailyRecordsProps {
  records: DailyRecordDetail[]
  batchId: string
  /** Vrai si l'utilisateur est sur le plan FREE (historique limité aux 7 dernières saisies) */
  historyLocked?: boolean
  /** Nombre total de saisies disponibles (avant la tranche) */
  totalRecordsCount?: number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecentDailyRecords({
  records,
  batchId,
  historyLocked = false,
  totalRecordsCount = 0,
}: RecentDailyRecordsProps) {
  const hiddenCount = historyLocked ? Math.max(0, totalRecordsCount - records.length) : 0

  return (
    <div id="saisies" className="space-y-3">

      {/* ── Titre + lien historique complet ──────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Saisies récentes
        </h2>
        {!historyLocked && (
          <Link
            href={`/daily?batchId=${batchId}`}
            className="text-xs text-green-600 hover:text-green-700 hover:underline"
          >
            Saisir / Voir tout
          </Link>
        )}
        {historyLocked && (
          <Link
            href={`/daily?batchId=${batchId}`}
            className="text-xs text-green-600 hover:text-green-700 hover:underline"
          >
            Saisir
          </Link>
        )}
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
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-400">Source</th>
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
                    <td className="px-4 py-2.5 text-center whitespace-nowrap">
                      {record.dataSource === "ESTIMATED_FROM_BAG" ? (
                        <span
                          className="inline-flex items-center justify-center rounded-full bg-amber-100 p-1 text-amber-700"
                          title={`Estimation reconstruite depuis un sac${record.estimationConfidence ? ` · confiance ${record.estimationConfidence}` : ""}`}
                        >
                          <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                      ) : (
                        <span
                          className="inline-flex rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-500"
                          title="Saisie manuelle en kg"
                        >
                          Manuel
                        </span>
                      )}
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

      {/* ── Bannière historique limité (plan FREE) ─────────────────────── */}
      {historyLocked && records.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-amber-900">
              Historique limité aux {records.length} dernières saisies
              {hiddenCount > 0 && (
                <span className="ml-1 font-normal text-amber-700">
                  ({hiddenCount} saisie{hiddenCount > 1 ? "s" : ""} plus ancienne{hiddenCount > 1 ? "s" : ""} non visibles)
                </span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-amber-700">
              L&apos;historique complet est disponible à partir du plan{" "}
              <span className="font-semibold">Starter</span> —{" "}
              {COMMERCIAL_PLAN_CATALOG.STARTER.monthlyPriceFcfa.toLocaleString("fr-SN")} FCFA / mois.
            </p>
          </div>
          <Link
            href="/pricing?from=full_history"
            className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            Voir les plans
          </Link>
        </div>
      )}
    </div>
  )
}
