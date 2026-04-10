"use client"

import { formatDate } from "@/src/lib/formatters"
import { cn } from "@/src/lib/utils"

export interface RecentRecordRow {
  id: string
  date: Date | string
  mortality: number
  feedKg: number
  waterLiters?: number | null
  audioRecordUrl?: string | null
  isLocked?: boolean
  isOptimistic?: boolean
  syncStatus?: "pending" | "failed" | "synced"
  syncError?: string
}

interface RecentRecordsProps {
  records: RecentRecordRow[]
  isLoading: boolean
  selectedDate: string
}

function isSameDay(recordDate: Date | string, dateStr: string): boolean {
  return new Date(recordDate).toISOString().substring(0, 10) === dateStr
}

function formatFeed(kg: number): string {
  return `${kg % 1 === 0 ? kg : kg.toFixed(1)} kg`
}

export function RecentRecords({ records, isLoading, selectedDate }: RecentRecordsProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-700">Historique recent</h2>
        <p className="mt-0.5 text-xs text-gray-400">
          14 dernieres saisies et entrees locales en attente
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2 p-3">
          {[...Array(4)].map((_, index) => (
            <div
              key={index}
              className="h-10 animate-pulse rounded-lg bg-gray-100"
              style={{ opacity: 1 - index * 0.2 }}
            />
          ))}
        </div>
      ) : null}

      {!isLoading && records.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-gray-400">
          Aucune saisie pour ce lot
        </div>
      ) : null}

      {!isLoading && records.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5 text-right">Mort.</th>
                <th className="px-4 py-2.5 text-right">Aliment</th>
                <th className="px-4 py-2.5 text-right">Eau</th>
                <th className="px-4 py-2.5 text-center">Audio</th>
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
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-800">
                      {isSelected ? (
                        <span
                          className="mb-0.5 mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-green-500 align-middle"
                          aria-hidden
                        />
                      ) : null}
                      {formatDate(record.date)}
                      {record.isLocked ? (
                        <span className="ml-1.5 text-xs text-gray-400" title="Verrouillee">
                          Locked
                        </span>
                      ) : null}
                      {record.isOptimistic ? (
                        <span
                          className={cn(
                            "ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            record.syncStatus === "failed"
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700",
                          )}
                        >
                          {record.syncStatus === "failed" ? "Erreur sync" : "En attente de sync"}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {record.mortality > 0 ? (
                        <span className="font-semibold text-red-600">{record.mortality}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-700">
                      {formatFeed(record.feedKg)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-500">
                      {record.waterLiters != null ? `${record.waterLiters} L` : "-"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {record.audioRecordUrl ? (
                        <audio controls src={record.audioRecordUrl} className="mx-auto h-8 w-32 sm:w-48" />
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
