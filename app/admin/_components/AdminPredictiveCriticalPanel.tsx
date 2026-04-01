/**
 * AdminPredictiveCriticalPanel
 *
 * Affiche un résumé des prédictions de rupture stock critiques par organisation.
 * Données lues directement depuis PredictiveSnapshot (snapshot du jour ou dernier snapshot).
 * Vue lecture seule — pas d'actions.
 */

import Link from "next/link"

type CriticalOrgSummary = {
  organizationId: string
  organizationName: string
  criticalCount: number
  warningCount: number
  mostUrgentName: string
  mostUrgentRuptureDate: Date | null
  mostUrgentDays: number | null
}

export function AdminPredictiveCriticalPanel({
  orgs,
}: {
  orgs: CriticalOrgSummary[]
}) {
  if (orgs.length === 0) {
    return (
      <section className="rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-5">
          <h2 className="text-lg font-semibold text-gray-900">Ruptures stock prédictives</h2>
          <p className="text-sm text-gray-500">
            Stocks en risque critique sur 14 jours de consommation, par organisation.
          </p>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-gray-400">Aucun stock en rupture critique détecté.</p>
          <p className="mt-1 text-xs text-gray-400">
            Les snapshots sont générés à chaque déclenchement du cron de notifications.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-3xl border border-red-200 bg-white shadow-sm">
      <div className="border-b border-red-100 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50 text-red-700">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Ruptures stock prédictives — {orgs.length} organisation{orgs.length > 1 ? "s" : ""} touchée{orgs.length > 1 ? "s" : ""}
            </h2>
            <p className="text-sm text-gray-500">
              Stocks en risque critique sur 14 jours de consommation. Snapshot du dernier cron.
            </p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {orgs.map((org) => {
          const ruptureDateStr = org.mostUrgentRuptureDate
            ? new Date(org.mostUrgentRuptureDate).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : null

          return (
            <div key={org.organizationId} className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/organizations/${org.organizationId}`}
                    className="font-medium text-gray-900 hover:text-green-700"
                  >
                    {org.organizationName}
                  </Link>
                  {org.criticalCount > 0 ? (
                    <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                      {org.criticalCount} critique{org.criticalCount > 1 ? "s" : ""}
                    </span>
                  ) : null}
                  {org.warningCount > 0 ? (
                    <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700">
                      {org.warningCount} alerte{org.warningCount > 1 ? "s" : ""}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-sm text-gray-500 truncate">
                  Stock le plus urgent : <span className="font-medium text-gray-700">{org.mostUrgentName}</span>
                  {org.mostUrgentDays !== null
                    ? ` · ${org.mostUrgentDays <= 0 ? "Rupture" : `${Math.round(org.mostUrgentDays)} j`}`
                    : ""}
                </p>
              </div>
              {ruptureDateStr ? (
                <div className="shrink-0 text-right">
                  <span className="text-xs font-semibold text-red-700">→ {ruptureDateStr}</span>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
