import Link from "next/link"
import { formatMoneyFCFACompact, formatPercent } from "@/src/lib/formatters"
import type { BusinessBatchComparisonRow } from "@/src/lib/business-dashboard"

function badgeClasses(status: BusinessBatchComparisonRow["status"]) {
  if (status === "critical") return "bg-red-50 text-red-700 border-red-200"
  if (status === "warning") return "bg-orange-50 text-orange-700 border-orange-200"
  return "bg-green-50 text-green-700 border-green-200"
}

function rowClasses(status: BusinessBatchComparisonRow["status"]) {
  if (status === "critical") return "bg-red-50/40"
  if (status === "warning") return "bg-orange-50/30"
  return "bg-white"
}

export function BusinessBatchComparisonTable({
  rows,
}: {
  rows: BusinessBatchComparisonRow[]
}) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Lots a arbitrer en priorite</h2>
          <p className="mt-1 text-sm text-gray-500">
            Un classement simple pour voir quels lots protegent la marge et lesquels demandent un arbitrage rapide.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-sm text-gray-500">
          Aucun lot actif a comparer.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-3 py-3">Lot</th>
                <th className="px-3 py-3">Ferme</th>
                <th className="px-3 py-3">Marge projetee</th>
                <th className="px-3 py-3">Risque mortalite</th>
                <th className="px-3 py-3">Statut global</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id} className={`align-top ${rowClasses(row.status)}`}>
                  <td className="px-3 py-4">
                    <Link href={`/batches/${row.id}`} className="font-semibold text-gray-900 hover:text-green-700">
                      {row.number}
                    </Link>
                    <p className="mt-1 text-xs text-gray-500">{row.buildingName}</p>
                  </td>
                  <td className="px-3 py-4 text-gray-700">{row.farmName}</td>
                  <td className="px-3 py-4">
                    <p className={`font-semibold ${row.projectedMarginFcfa < 0 ? "text-red-700" : "text-gray-900"}`}>
                      {formatMoneyFCFACompact(row.projectedMarginFcfa)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {row.projectedMarginRate == null
                        ? row.marginLabel
                        : `${formatPercent(row.projectedMarginRate)} · ${row.marginLabel}`}
                    </p>
                  </td>
                  <td className="px-3 py-4">
                    <p className={`font-semibold ${row.mortalityRiskScore >= 60 ? "text-red-700" : row.mortalityRiskScore >= 30 ? "text-orange-700" : "text-gray-900"}`}>
                      {row.mortalityRiskScore}/100
                    </p>
                    <p className="mt-1 text-xs text-gray-500">{row.mortalityLabel}</p>
                  </td>
                  <td className="px-3 py-4">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClasses(row.status)}`}>
                      {row.statusLabel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
