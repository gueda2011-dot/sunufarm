"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"

import type { VaccinationPlanSummary } from "@/src/actions/health"
import { assignVaccinationPlanToBatch } from "@/src/actions/health"
import { formatDate } from "@/src/lib/formatters"
import type { PlannedVaccinationOccurrence } from "@/src/lib/vaccination-planning"

type Props = {
  organizationId: string
  batchId: string
  batchType: string
  userRole: string
  plans: VaccinationPlanSummary[]
  selectedPlanId: string | null
  occurrences: PlannedVaccinationOccurrence[]
}

function getStatusBadge(status: PlannedVaccinationOccurrence["status"]) {
  switch (status) {
    case "FAIT":
      return "bg-green-100 text-green-700"
    case "EN_RETARD":
      return "bg-red-100 text-red-700"
    default:
      return "bg-amber-100 text-amber-800"
  }
}

function getStatusLabel(occurrence: PlannedVaccinationOccurrence) {
  if (occurrence.status !== "FAIT") return occurrence.status.replace("_", " ")
  if (occurrence.isEarly) return "FAIT en avance"
  if (occurrence.isLate) return "FAIT en retard"
  return "FAIT"
}

export function VaccinationPlanningSection({
  organizationId,
  batchId,
  batchType,
  userRole,
  plans,
  selectedPlanId,
  occurrences,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const canAssignPlan = ["SUPER_ADMIN", "OWNER", "MANAGER"].includes(userRole)

  const todoCount = occurrences.filter((item) => item.status === "A_FAIRE").length
  const overdueCount = occurrences.filter((item) => item.status === "EN_RETARD").length
  const doneCount = occurrences.filter((item) => item.status === "FAIT").length

  function handleChangePlan(nextPlanId: string) {
    startTransition(async () => {
      const result = await assignVaccinationPlanToBatch({
        organizationId,
        batchId,
        planId: nextPlanId || null,
      })

      if (!result.success) {
        window.alert(result.error)
        return
      }

      router.refresh()
    })
  }

  return (
    <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Calendrier vaccinal
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Plan vaccinal associe au lot, occurrences calculees a la volee et
            statuts simples A_FAIRE / EN_RETARD / FAIT.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-amber-50 px-3 py-2 text-amber-800">
            A faire
            <div className="mt-1 text-base font-semibold">{todoCount}</div>
          </div>
          <div className="rounded-xl bg-red-50 px-3 py-2 text-red-700">
            En retard
            <div className="mt-1 text-base font-semibold">{overdueCount}</div>
          </div>
          <div className="rounded-xl bg-green-50 px-3 py-2 text-green-700">
            Fait
            <div className="mt-1 text-base font-semibold">{doneCount}</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div>
            <label className="mb-1 block text-xs text-gray-500">
              Plan vaccinal du lot
            </label>
            <select
              value={selectedPlanId ?? ""}
              onChange={(event) => handleChangePlan(event.target.value)}
              disabled={!canAssignPlan || isPending}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
            >
              <option value="">Aucun plan vaccinal</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </div>

          <div className="text-xs text-gray-500">
            Type du lot : <span className="font-medium text-gray-700">{batchType}</span>
          </div>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          Le rattachement automatique utilise : meme lot, nom de vaccin normalise
          et fenetre de date de -2 a +3 jours autour de la date prevue.
        </p>
      </div>

      {!selectedPlanId ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
          Aucun plan vaccinal n est associe a ce lot pour le moment.
        </div>
      ) : occurrences.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
          Ce plan ne contient encore aucune occurrence exploitable.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Vaccin</th>
                <th className="px-4 py-3 font-medium">Jour cible</th>
                <th className="px-4 py-3 font-medium">Date prevue</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Realisation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {occurrences.map((occurrence) => (
                <tr key={occurrence.planItemId} className="text-gray-700">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {occurrence.vaccineName}
                    </div>
                    {(occurrence.route || occurrence.dose) ? (
                      <div className="mt-1 text-xs text-gray-500">
                        {[occurrence.route, occurrence.dose].filter(Boolean).join(" · ")}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">J{occurrence.targetDayOfAge}</td>
                  <td className="px-4 py-3">{formatDate(occurrence.plannedDate)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadge(occurrence.status)}`}
                    >
                      {getStatusLabel(occurrence)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {occurrence.matchedVaccinationDate
                      ? formatDate(occurrence.matchedVaccinationDate)
                      : "Non realisee"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
