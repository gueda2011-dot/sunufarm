"use client"

/**
 * SunuFarm — Page Santé animale (Client Component)
 *
 * Vue synthétique des vaccinations et traitements récents (organisation entière).
 * La création d'événements santé se fait depuis le détail du lot concerné.
 */

import { useState }    from "react"
import Link            from "next/link"
import { formatDate }  from "@/src/lib/formatters"
import type { VaccinationSummary, TreatmentSummary } from "@/src/actions/health"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BatchInfo {
  number: string
  status: string
}

interface Props {
  vaccinations:         VaccinationSummary[]
  treatments:           TreatmentSummary[]
  batchMap:             Record<string, BatchInfo>
  recentVaxCount:       number
  activeTreatmentsCount: number
  totalVaxCount:        number
  totalTreatmentsCount: number
}

// ---------------------------------------------------------------------------
// KpiCard
// ---------------------------------------------------------------------------

function KpiCard({
  label, value, sub, accent,
}: {
  label: string; value: string; sub?: string; accent?: "green" | "orange" | "blue"
}) {
  const cls =
    accent === "green"  ? "text-green-700"  :
    accent === "orange" ? "text-orange-600" :
    accent === "blue"   ? "text-blue-600"   :
    "text-gray-900"
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-lg font-bold leading-tight ${cls}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Tab = "vaccinations" | "traitements"

export function HealthPageClient({
  vaccinations,
  treatments,
  batchMap,
  recentVaxCount,
  activeTreatmentsCount,
  totalVaxCount,
  totalTreatmentsCount,
}: Props) {
  const [tab, setTab] = useState<Tab>("vaccinations")

  return (
    <div className="mx-auto max-w-3xl space-y-6">

      {/* ── En-tête ────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Santé animale</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Vaccinations et traitements récents — tous lots
        </p>
      </div>

      {/* ── KPI ────────────────────────────────────────────────────────────── */}
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

      {/* ── Note création ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        Pour enregistrer une vaccination ou un traitement, rendez-vous sur le{" "}
        <Link href="/batches" className="font-medium underline">
          détail du lot
        </Link>{" "}
        concerné.
      </div>

      {/* ── Onglets ────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-xl border border-gray-100 bg-gray-50 p-1">
        {(["vaccinations", "traitements"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors capitalize ${
              tab === t
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "vaccinations"
              ? `Vaccinations (${totalVaxCount})`
              : `Traitements (${totalTreatmentsCount})`}
          </button>
        ))}
      </div>

      {/* ── Contenu ────────────────────────────────────────────────────────── */}
      {tab === "vaccinations" && (
        <VaccinationsTable vaccinations={vaccinations} batchMap={batchMap} />
      )}
      {tab === "traitements" && (
        <TreatmentsTable treatments={treatments} batchMap={batchMap} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Table vaccinations
// ---------------------------------------------------------------------------

function VaccinationsTable({
  vaccinations,
  batchMap,
}: {
  vaccinations: VaccinationSummary[]
  batchMap:     Record<string, BatchInfo>
}) {
  if (vaccinations.length === 0) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
        Aucune vaccination enregistrée.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white divide-y divide-gray-50">
      {vaccinations.map((v) => {
        const batch = batchMap[v.batchId]
        return (
          <div key={v.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm text-gray-900">{v.vaccineName}</span>
                {v.route && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                    {v.route}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {batch ? (
                  <Link href={`/batches/${v.batchId}`} className="text-blue-500 hover:underline">
                    {batch.number}
                  </Link>
                ) : v.batchId} · Jour {v.batchAgeDay}
                {v.countVaccinated != null && ` · ${v.countVaccinated} sujets`}
                {v.dose && ` · ${v.dose}`}
              </div>
            </div>
            <div className="text-xs text-gray-400 shrink-0 text-right">
              {formatDate(v.date)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Table traitements
// ---------------------------------------------------------------------------

function TreatmentsTable({
  treatments,
  batchMap,
}: {
  treatments: TreatmentSummary[]
  batchMap:   Record<string, BatchInfo>
}) {
  const now = new Date()

  if (treatments.length === 0) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
        Aucun traitement enregistré.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white divide-y divide-gray-50">
      {treatments.map((t) => {
        const batch    = batchMap[t.batchId]
        const isActive = !t.endDate || new Date(t.endDate) >= now

        return (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm text-gray-900">{t.medicineName}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  isActive
                    ? "bg-orange-100 text-orange-700"
                    : "bg-gray-100 text-gray-500"
                }`}>
                  {isActive ? "En cours" : "Terminé"}
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {batch ? (
                  <Link href={`/batches/${t.batchId}`} className="text-blue-500 hover:underline">
                    {batch.number}
                  </Link>
                ) : t.batchId}
                {t.indication && ` · ${t.indication}`}
                {t.durationDays != null && ` · ${t.durationDays}j`}
                {t.countTreated != null && ` · ${t.countTreated} sujets`}
              </div>
            </div>
            <div className="text-xs text-gray-400 shrink-0 text-right">
              {formatDate(t.startDate)}
              {t.endDate && (
                <div className="text-gray-300">→ {formatDate(t.endDate)}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
