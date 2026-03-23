"use client"

/**
 * SunuFarm - Page Sante animale (Client Component)
 *
 * Vue actionnable des priorites vaccinales a l'echelle de l'organisation,
 * puis historique recent des vaccinations et traitements.
 */

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { formatDate } from "@/src/lib/formatters"
import type { TreatmentSummary, VaccinationSummary } from "@/src/actions/health"

interface BatchInfo {
  number: string
  status: string
  farmName: string
}

interface VaccinationActionItem {
  batchId: string
  batchNumber: string
  batchStatus: string
  farmName: string
  vaccineName: string
  plannedDate: Date
  status: "A_FAIRE" | "EN_RETARD"
}

interface BatchWithoutPlanItem {
  batchId: string
  batchNumber: string
  batchStatus: string
  batchType: string
  farmName: string
  entryDate: Date
}

interface Props {
  vaccinations: VaccinationSummary[]
  treatments: TreatmentSummary[]
  batchMap: Record<string, BatchInfo>
  recentVaxCount: number
  activeTreatmentsCount: number
  totalVaxCount: number
  totalTreatmentsCount: number
  overdueVaccinations: VaccinationActionItem[]
  todayVaccinations: VaccinationActionItem[]
  upcomingVaccinations: VaccinationActionItem[]
  batchesWithoutPlan: BatchWithoutPlanItem[]
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
  accent?: "green" | "orange" | "blue" | "red" | "gray"
}) {
  const cls =
    accent === "green" ? "text-green-700" :
    accent === "orange" ? "text-orange-600" :
    accent === "blue" ? "text-blue-600" :
    accent === "red" ? "text-red-700" :
    accent === "gray" ? "text-gray-700" :
    "text-gray-900"

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-1 text-xs text-gray-400">{label}</div>
      <div className={`text-lg font-bold leading-tight ${cls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-400">{sub}</div>}
    </div>
  )
}

function SectionHeader({
  title,
  description,
  count,
  tone,
}: {
  title: string
  description: string
  count: number
  tone: "red" | "orange" | "blue" | "gray"
}) {
  const badgeClass =
    tone === "red" ? "bg-red-100 text-red-700 border-red-200" :
    tone === "orange" ? "bg-orange-100 text-orange-700 border-orange-200" :
    tone === "blue" ? "bg-blue-100 text-blue-700 border-blue-200" :
    "bg-gray-100 text-gray-700 border-gray-200"

  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
      <span className={`rounded-full border px-3 py-1 text-xs font-medium ${badgeClass}`}>
        {count}
      </span>
    </div>
  )
}

function ActionItemRow({
  item,
  statusLabel,
  statusClass,
}: {
  item: VaccinationActionItem
  statusLabel: string
  statusClass: string
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{item.vaccineName}</span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass}`}>
            {statusLabel}
          </span>
        </div>
        <div className="mt-2 text-sm text-gray-600">
          <span className="font-medium text-gray-800">{item.farmName}</span>
          {" · "}
          Lot{" "}
          <span className="font-medium text-gray-800">{item.batchNumber}</span>
          {" · "}
          Prevu le {formatDate(item.plannedDate)}
        </div>
      </div>
      <Link
        href={`/batches/${item.batchId}`}
        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-blue-200 hover:text-blue-700"
      >
        Ouvrir le lot
      </Link>
    </div>
  )
}

function WithoutPlanRow({ item }: { item: BatchWithoutPlanItem }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{item.farmName}</span>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
            Sans plan vaccinal
          </span>
        </div>
        <div className="mt-2 text-sm text-gray-600">
          Lot <span className="font-medium text-gray-800">{item.batchNumber}</span>
          {" · "}
          {item.batchType}
          {" · "}
          Entre le {formatDate(item.entryDate)}
        </div>
      </div>
      <Link
        href={`/batches/${item.batchId}`}
        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-blue-200 hover:text-blue-700"
      >
        Associer un plan
      </Link>
    </div>
  )
}

function ActionSection({
  title,
  description,
  tone,
  items,
  emptyLabel,
  renderItem,
}: {
  title: string
  description: string
  tone: "red" | "orange" | "blue" | "gray"
  items: unknown[]
  emptyLabel: string
  renderItem: (item: unknown, index: number) => ReactNode
}) {
  const wrapperClass =
    tone === "red" ? "border-red-200 bg-red-50/60" :
    tone === "orange" ? "border-orange-200 bg-orange-50/70" :
    tone === "blue" ? "border-blue-200 bg-blue-50/70" :
    "border-gray-200 bg-gray-50/80"

  return (
    <section className={`rounded-2xl border p-5 ${wrapperClass}`}>
      <SectionHeader
        title={title}
        description={description}
        count={items.length}
        tone={tone}
      />
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white/80 px-4 py-6 text-sm text-gray-500">
            {emptyLabel}
          </div>
        ) : (
          items.map((item, index) => renderItem(item, index))
        )}
      </div>
    </section>
  )
}

type Tab = "vaccinations" | "traitements"

export function HealthPageClient({
  vaccinations,
  treatments,
  batchMap,
  recentVaxCount,
  activeTreatmentsCount,
  totalVaxCount,
  totalTreatmentsCount,
  overdueVaccinations,
  todayVaccinations,
  upcomingVaccinations,
  batchesWithoutPlan,
}: Props) {
  const [tab, setTab] = useState<Tab>("vaccinations")

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Sante animale</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Priorites vaccinales, suivi des lots et historique recent.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Vaccinations en retard"
          value={String(overdueVaccinations.length)}
          sub="A traiter en premier"
          accent={overdueVaccinations.length > 0 ? "red" : "gray"}
        />
        <KpiCard
          label="A faire aujourd'hui"
          value={String(todayVaccinations.length)}
          sub="Actions du jour"
          accent={todayVaccinations.length > 0 ? "orange" : "gray"}
        />
        <KpiCard
          label="A venir bientot"
          value={String(upcomingVaccinations.length)}
          sub="7 prochains jours"
          accent="blue"
        />
        <KpiCard
          label="Lots sans plan"
          value={String(batchesWithoutPlan.length)}
          sub="Plan vaccinal manquant"
          accent={batchesWithoutPlan.length > 0 ? "gray" : "green"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ActionSection
          title="Vaccinations en retard"
          description="Lots dont la fenetre de vaccination est depassee et qui demandent une action immediate."
          tone="red"
          items={overdueVaccinations}
          emptyLabel="Aucune vaccination en retard sur les lots actifs."
          renderItem={(item, index) => (
            <ActionItemRow
              key={(item as VaccinationActionItem).batchId + (item as VaccinationActionItem).vaccineName + index}
              item={item as VaccinationActionItem}
              statusLabel="En retard"
              statusClass="bg-red-100 text-red-700"
            />
          )}
        />

        <ActionSection
          title="A faire aujourd'hui"
          description="Vaccinations prevues aujourd'hui sur les lots actifs."
          tone="orange"
          items={todayVaccinations}
          emptyLabel="Aucune vaccination a realiser aujourd'hui."
          renderItem={(item, index) => (
            <ActionItemRow
              key={(item as VaccinationActionItem).batchId + (item as VaccinationActionItem).vaccineName + index}
              item={item as VaccinationActionItem}
              statusLabel="Aujourd'hui"
              statusClass="bg-orange-100 text-orange-700"
            />
          )}
        />

        <ActionSection
          title="A venir bientot"
          description="Vaccinations a preparer dans les 7 prochains jours pour anticiper les stocks et les interventions."
          tone="blue"
          items={upcomingVaccinations}
          emptyLabel="Aucune vaccination planifiee dans les 7 prochains jours."
          renderItem={(item, index) => (
            <ActionItemRow
              key={(item as VaccinationActionItem).batchId + (item as VaccinationActionItem).vaccineName + index}
              item={item as VaccinationActionItem}
              statusLabel="A venir"
              statusClass="bg-blue-100 text-blue-700"
            />
          )}
        />

        <ActionSection
          title="Lots sans plan vaccinal"
          description="Lots actifs sans plan vaccinal lie ou avec un plan inactif, a regulariser rapidement."
          tone="gray"
          items={batchesWithoutPlan}
          emptyLabel="Tous les lots actifs ont un plan vaccinal actif."
          renderItem={(item, index) => (
            <WithoutPlanRow
              key={(item as BatchWithoutPlanItem).batchId + index}
              item={item as BatchWithoutPlanItem}
            />
          )}
        />
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        Les enregistrements de vaccination et de traitement se font depuis le{" "}
        <Link href="/batches" className="font-medium underline">
          detail du lot
        </Link>
        . Utilisez les acces rapides ci-dessus pour traiter les priorites sanitaires.
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
      </div>

      <div className="flex gap-1 rounded-xl border border-gray-100 bg-gray-50 p-1">
        {(["vaccinations", "traitements"] as Tab[]).map((nextTab) => (
          <button
            key={nextTab}
            onClick={() => setTab(nextTab)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              tab === nextTab
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {nextTab === "vaccinations"
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
                <span className="text-sm font-medium text-gray-900">
                  {vaccination.vaccineName}
                </span>
                {vaccination.route && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                    {vaccination.route}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-gray-400">
                {batch ? (
                  <>
                    <span>{batch.farmName}</span>
                    {" · "}
                    <Link
                      href={`/batches/${vaccination.batchId}`}
                      className="text-blue-500 hover:underline"
                    >
                      {batch.number}
                    </Link>
                  </>
                ) : (
                  vaccination.batchId
                )}
                {" · "}
                Jour {vaccination.batchAgeDay}
                {vaccination.countVaccinated != null && ` · ${vaccination.countVaccinated} sujets`}
                {vaccination.dose && ` · ${vaccination.dose}`}
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
                <span className="text-sm font-medium text-gray-900">
                  {treatment.medicineName}
                </span>
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
                  <>
                    <span>{batch.farmName}</span>
                    {" · "}
                    <Link
                      href={`/batches/${treatment.batchId}`}
                      className="text-blue-500 hover:underline"
                    >
                      {batch.number}
                    </Link>
                  </>
                ) : (
                  treatment.batchId
                )}
                {treatment.indication && ` · ${treatment.indication}`}
                {treatment.durationDays != null && ` · ${treatment.durationDays}j`}
                {treatment.countTreated != null && ` · ${treatment.countTreated} sujets`}
              </div>
            </div>
            <div className="shrink-0 text-right text-xs text-gray-400">
              {formatDate(treatment.startDate)}
              {treatment.endDate && (
                <div className="text-gray-300">→ {formatDate(treatment.endDate)}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
