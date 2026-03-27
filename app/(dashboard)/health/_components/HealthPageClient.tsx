"use client"

import { useState } from "react"
import Link from "next/link"
import type { SubscriptionPlan } from "@/src/generated/prisma/client"
import { formatDate } from "@/src/lib/formatters"
import type {
  TreatmentSummary,
  VaccinationPlanSummary,
  VaccinationSummary,
} from "@/src/actions/health"
import { PlanGuardCard } from "@/src/components/subscription/PlanGuardCard"

interface BatchInfo {
  number: string
  status: string
}

interface Props {
  currentPlan: SubscriptionPlan
  canViewAdvancedHealth: boolean
  vaccinations: VaccinationSummary[]
  treatments: TreatmentSummary[]
  vaccinationPlans: VaccinationPlanSummary[]
  batchAlerts: Array<{
    batchId: string
    batchNumber: string
    ageDay: number
    overdueCount: number
    dueCount: number
    items: Array<{
      vaccineName: string
      status: "due" | "overdue"
      windowLabel: string
    }>
  }>
  batchMap: Record<string, BatchInfo>
  recentVaxCount: number
  activeTreatmentsCount: number
  totalVaxCount: number
  totalTreatmentsCount: number
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: "green" | "orange" | "blue"
}) {
  const cls =
    accent === "green"
      ? "text-green-700"
      : accent === "orange"
        ? "text-orange-600"
        : accent === "blue"
          ? "text-blue-600"
          : "text-gray-900"

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-1 text-xs text-gray-400">{label}</div>
      <div className={`text-lg font-bold leading-tight ${cls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-400">{sub}</div>}
    </div>
  )
}

type Tab = "vaccinations" | "traitements"

export function HealthPageClient({
  currentPlan,
  canViewAdvancedHealth,
  vaccinations,
  treatments,
  vaccinationPlans,
  batchAlerts,
  batchMap,
  recentVaxCount,
  activeTreatmentsCount,
  totalVaxCount,
  totalTreatmentsCount,
}: Props) {
  const [tab, setTab] = useState<Tab>("vaccinations")

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Sante animale</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Pilotage des vaccinations, traitements et lots a surveiller.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Vaccinations (7j)"
          value={String(recentVaxCount)}
          sub="7 derniers jours"
          accent="green"
        />
        <KpiCard
          label="Traitements actifs"
          value={String(activeTreatmentsCount)}
          sub="en cours"
          accent={activeTreatmentsCount > 0 ? "orange" : undefined}
        />
        <KpiCard
          label="Total vaccinations"
          value={String(totalVaxCount)}
          sub="historique"
          accent="blue"
        />
        <KpiCard
          label="Total traitements"
          value={String(totalTreatmentsCount)}
          sub="historique"
        />
        {canViewAdvancedHealth ? (
          <>
            <KpiCard
              label="Lots a surveiller"
              value={String(batchAlerts.length)}
              sub="vaccinations dues"
              accent={batchAlerts.length > 0 ? "orange" : undefined}
            />
            <KpiCard
              label="Plans vaccinaux"
              value={String(vaccinationPlans.length)}
              sub="templates actifs"
              accent="blue"
            />
          </>
        ) : null}
      </div>

      {canViewAdvancedHealth ? (
        <>
          {batchAlerts.length > 0 && (
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
              <h2 className="text-sm font-semibold text-amber-900">Lots a surveiller</h2>
              <p className="mt-1 text-xs text-amber-800">
                Ces lots ont des vaccinations a faire maintenant ou deja en retard.
              </p>

              <div className="mt-3 space-y-3">
                {batchAlerts.map((alert) => (
                  <div key={alert.batchId} className="rounded-lg bg-white px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <Link
                          href={`/batches/${alert.batchId}`}
                          className="text-sm font-semibold text-gray-900 hover:text-blue-600"
                        >
                          {alert.batchNumber}
                        </Link>
                        <p className="mt-1 text-xs text-gray-500">Jour {alert.ageDay}</p>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs font-semibold">
                        {alert.overdueCount > 0 && (
                          <span className="rounded-full bg-red-100 px-2 py-1 text-red-700">
                            {alert.overdueCount} en retard
                          </span>
                        )}
                        {alert.dueCount > 0 && (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">
                            {alert.dueCount} a faire
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 space-y-1">
                      {alert.items.map((item) => (
                        <p key={`${alert.batchId}-${item.vaccineName}`} className="text-xs text-gray-600">
                          {item.vaccineName} - {item.windowLabel} - {item.status === "overdue" ? "en retard" : "a faire"}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-green-100 bg-green-50 p-4">
            <h2 className="text-sm font-semibold text-green-900">Plans vaccinaux actifs</h2>
            <p className="mt-1 text-xs text-green-800">
              Modeles organisationnels pour standardiser les protocoles par type de lot.
            </p>

            {vaccinationPlans.length === 0 ? (
              <p className="mt-3 rounded-lg bg-white px-4 py-3 text-sm text-gray-500">
                Aucun plan vaccinal actif pour le moment.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {vaccinationPlans.map((plan) => (
                  <div key={plan.id} className="rounded-lg bg-white px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{plan.name}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {plan.batchType === "PONDEUSE"
                            ? "Pondeuse"
                            : plan.batchType === "CHAIR"
                              ? "Chair"
                              : "Reproducteur"}{" "}
                          - {plan.items.length} etape(s)
                        </p>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {plan.items.map((item) => (
                        <span
                          key={item.id}
                          className="rounded-full bg-green-100 px-2.5 py-1 text-xs text-green-800"
                        >
                          J{item.dayOfAge} - {item.vaccineName}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <PlanGuardCard
          title="Surveillance sanitaire avancee"
          message="Le suivi detaille des lots a surveiller et les plans vaccinaux organisationnels sont disponibles a partir du plan Pro."
          requiredPlan="Pro"
          currentPlan={currentPlan}
        />
      )}

      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        Pour enregistrer une vaccination ou un traitement, rendez-vous sur le{" "}
        <Link href="/batches" className="font-medium underline">
          detail du lot
        </Link>{" "}
        concerne.
      </div>

      <div className="flex gap-1 rounded-xl border border-gray-100 bg-gray-50 p-1">
        {(["vaccinations", "traitements"] as Tab[]).map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              tab === item
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {item === "vaccinations"
              ? `Vaccinations (${totalVaxCount})`
              : `Traitements (${totalTreatmentsCount})`}
          </button>
        ))}
      </div>

      {tab === "vaccinations" && (
        <VaccinationsTable vaccinations={vaccinations} batchMap={batchMap} />
      )}
      {tab === "traitements" && (
        <TreatmentsTable treatments={treatments} batchMap={batchMap} />
      )}
    </div>
  )
}

function VaccinationsTable({
  vaccinations,
  batchMap,
}: {
  vaccinations: VaccinationSummary[]
  batchMap: Record<string, BatchInfo>
}) {
  if (vaccinations.length === 0) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
        Aucune vaccination enregistree.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white divide-y divide-gray-50">
      {vaccinations.map((vaccination) => {
        const batch = batchMap[vaccination.batchId]

        return (
          <div key={vaccination.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-gray-900">{vaccination.vaccineName}</span>
                {vaccination.route && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                    {vaccination.route}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-gray-400">
                {batch ? (
                  <Link href={`/batches/${vaccination.batchId}`} className="text-blue-500 hover:underline">
                    {batch.number}
                  </Link>
                ) : (
                  vaccination.batchId
                )}{" "}
                - Jour {vaccination.batchAgeDay}
                {vaccination.countVaccinated != null && ` - ${vaccination.countVaccinated} sujets`}
                {vaccination.dose && ` - ${vaccination.dose}`}
              </div>
            </div>
            <div className="shrink-0 text-right text-xs text-gray-400">
              {formatDate(vaccination.date)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TreatmentsTable({
  treatments,
  batchMap,
}: {
  treatments: TreatmentSummary[]
  batchMap: Record<string, BatchInfo>
}) {
  const now = new Date()

  if (treatments.length === 0) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
        Aucun traitement enregistre.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white divide-y divide-gray-50">
      {treatments.map((treatment) => {
        const batch = batchMap[treatment.batchId]
        const isActive = !treatment.endDate || new Date(treatment.endDate) >= now

        return (
          <div key={treatment.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-gray-900">{treatment.medicineName}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    isActive
                      ? "bg-orange-100 text-orange-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {isActive ? "En cours" : "Termine"}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-gray-400">
                {batch ? (
                  <Link href={`/batches/${treatment.batchId}`} className="text-blue-500 hover:underline">
                    {batch.number}
                  </Link>
                ) : (
                  treatment.batchId
                )}
                {treatment.indication && ` - ${treatment.indication}`}
                {treatment.durationDays != null && ` - ${treatment.durationDays}j`}
                {treatment.countTreated != null && ` - ${treatment.countTreated} sujets`}
              </div>
            </div>
            <div className="shrink-0 text-right text-xs text-gray-400">
              {formatDate(treatment.startDate)}
              {treatment.endDate && <div>-&gt; {formatDate(treatment.endDate)}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
