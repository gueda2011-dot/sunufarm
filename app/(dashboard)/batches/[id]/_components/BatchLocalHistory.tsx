"use client"

/**
 * SunuFarm — Historique local hors ligne pour le détail d'un lot
 *
 * Ce composant client charge les saisies journalières depuis IndexedDB
 * et les affiche avec des KPIs calculés localement.
 *
 * Comportement :
 *   - En ligne  : se cache (les données serveur dans le composant parent font foi)
 *   - Hors ligne : affiche les données locales + indicateur "hors ligne"
 *   - Toujours visible si l'IndexedDB contient des saisies optimistes (pending/failed)
 */

import { useEffect, useState } from "react"
import { loadDailyRecordsFromLocal } from "@/src/lib/offline/repositories/dailyRepository"
import type { DailyRecordDetail } from "@/src/actions/daily-records"
import { formatDate, formatWeight } from "@/src/lib/formatters"

interface BatchLocalHistoryProps {
  batchId: string
  organizationId: string
  entryCount: number
}

interface LocalKpis {
  totalMortality: number
  liveCount: number
  lastRecordDate: Date | null
  recordsCount: number
  totalFeedKg: number
}

function computeKpis(records: DailyRecordDetail[], entryCount: number): LocalKpis {
  const totalMortality = records.reduce((sum, r) => sum + r.mortality, 0)
  return {
    totalMortality,
    liveCount: Math.max(0, entryCount - totalMortality),
    lastRecordDate: records[0]?.date ?? null,
    recordsCount: records.length,
    totalFeedKg: records.reduce((sum, r) => sum + r.feedKg, 0),
  }
}

export function BatchLocalHistory({
  batchId,
  organizationId,
  entryCount,
}: BatchLocalHistoryProps) {
  const [isOffline, setIsOffline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? false : !navigator.onLine,
  )
  const [records, setRecords] = useState<DailyRecordDetail[] | null>(null)

  useEffect(() => {
    const handleOnline  = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener("online",  handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online",  handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  useEffect(() => {
    // Charger depuis IndexedDB uniquement si hors ligne ou si on n'a pas encore de données
    if (!isOffline) return

    void loadDailyRecordsFromLocal(organizationId, batchId).then((rows) => {
      setRecords(rows ?? [])
    })
  }, [isOffline, organizationId, batchId])

  // En ligne et pas de données locales → ne rien afficher
  if (!isOffline) return null
  if (records === null) return null   // Chargement en cours
  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-4 text-sm text-orange-900">
        <p className="font-semibold">Mode hors ligne</p>
        <p className="mt-1 text-xs text-orange-700">
          Aucune saisie locale disponible pour ce lot. Connectez-vous pour voir l&apos;historique.
        </p>
      </div>
    )
  }

  const kpis = computeKpis(records, entryCount)
  const recent = records.slice(0, 7)

  return (
    <div className="space-y-4 rounded-2xl border border-orange-200 bg-orange-50 p-4">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-orange-900">Données locales (hors ligne)</p>
        <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-semibold text-orange-700">
          {kpis.recordsCount} saisie{kpis.recordsCount > 1 ? "s" : ""}
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white px-3 py-3 text-center">
          <p className="text-xs text-gray-400">Vivants est.</p>
          <p className="mt-1 text-lg font-bold text-gray-900 tabular-nums">
            {kpis.liveCount.toLocaleString("fr-SN")}
          </p>
        </div>
        <div className="rounded-xl bg-white px-3 py-3 text-center">
          <p className="text-xs text-gray-400">Mortalité tot.</p>
          <p className={`mt-1 text-lg font-bold tabular-nums ${kpis.totalMortality > 0 ? "text-red-600" : "text-gray-900"}`}>
            {kpis.totalMortality > 0 ? `+${kpis.totalMortality}` : "0"}
          </p>
        </div>
        <div className="rounded-xl bg-white px-3 py-3 text-center">
          <p className="text-xs text-gray-400">Dernière saisie</p>
          <p className="mt-1 text-sm font-bold text-gray-900">
            {kpis.lastRecordDate ? formatDate(kpis.lastRecordDate) : "—"}
          </p>
        </div>
      </div>

      {/* Mini-historique */}
      <div className="rounded-xl border border-orange-100 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-3 py-2 text-gray-400 font-medium">Date</th>
                <th className="text-right px-3 py-2 text-gray-400 font-medium">Mort.</th>
                <th className="text-right px-3 py-2 text-gray-400 font-medium">Aliment</th>
                <th className="text-right px-3 py-2 text-gray-400 font-medium">Poids</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((record, i) => (
                <tr key={record.id} className={i < recent.length - 1 ? "border-b border-gray-50" : ""}>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    {formatDate(record.date)}
                  </td>
                  <td className={`px-3 py-2 text-right font-medium tabular-nums whitespace-nowrap ${
                    record.mortality > 0 ? "text-red-600" : "text-gray-500"
                  }`}>
                    {record.mortality > 0 ? `+${record.mortality}` : "0"}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600 tabular-nums whitespace-nowrap">
                    {record.feedKg} kg
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500 tabular-nums whitespace-nowrap">
                    {formatWeight(record.avgWeightG)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-orange-600">
        Ces données viennent de votre stockage local. Reconnectez-vous pour synchroniser et voir les données à jour.
      </p>
    </div>
  )
}
