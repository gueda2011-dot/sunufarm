"use client"

import { useMemo, useState } from "react"
import { cn } from "@/src/lib/utils"
import type { BatchSummary } from "@/src/actions/batches"
import { BatchCard } from "./BatchCard"

const TYPE_LABELS: Record<string, string> = {
  CHAIR: "Poulet de chair",
  PONDEUSE: "Pondeuse",
  REPRODUCTEUR: "Reproducteur",
}

type StatusFilter = "ACTIVE" | "CLOSED" | "ALL"

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-green-600 text-white"
          : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50",
      )}
    >
      {children}
    </button>
  )
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: string | number
  tone?: "default" | "success"
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p
        className={cn(
          "mt-2 text-2xl font-bold",
          tone === "success" ? "text-green-700" : "text-gray-900",
        )}
      >
        {value}
      </p>
    </div>
  )
}

interface BatchListClientProps {
  organizationId: string
  initialBatches: BatchSummary[]
}

export function BatchListClient({ initialBatches }: BatchListClientProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL")
  const [typeFilter, setTypeFilter] = useState<string>("ALL")
  const [farmFilter, setFarmFilter] = useState<string>("ALL")
  const [query, setQuery] = useState("")

  const distinctTypes = useMemo(() => {
    return [...new Set(initialBatches.map((b) => b.type))]
  }, [initialBatches])

  const distinctFarms = useMemo(() => {
    const seen = new Map<string, string>()
    for (const batch of initialBatches) {
      if (!seen.has(batch.building.farm.id)) {
        seen.set(batch.building.farm.id, batch.building.farm.name)
      }
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [initialBatches])

  const summary = useMemo(() => {
    const active = initialBatches.filter((batch) => batch.status === "ACTIVE").length
    const closed = initialBatches.length - active
    return {
      total: initialBatches.length,
      active,
      closed,
      farms: distinctFarms.length,
    }
  }, [distinctFarms.length, initialBatches])

  const normalizedQuery = query.trim().toLowerCase()

  const filteredBatches = useMemo(() => {
    return initialBatches.filter((batch) => {
      if (statusFilter === "ACTIVE" && batch.status !== "ACTIVE") return false
      if (statusFilter === "CLOSED" && batch.status === "ACTIVE") return false
      if (typeFilter !== "ALL" && batch.type !== typeFilter) return false
      if (farmFilter !== "ALL" && batch.building.farm.id !== farmFilter) return false

      if (normalizedQuery) {
        const haystack = [
          batch.number,
          batch.building.name,
          batch.building.farm.name,
          batch.breed?.name ?? "",
          TYPE_LABELS[batch.type] ?? batch.type,
        ]
          .join(" ")
          .toLowerCase()

        if (!haystack.includes(normalizedQuery)) return false
      }

      return true
    })
  }, [initialBatches, farmFilter, normalizedQuery, statusFilter, typeFilter])

  const resetFilters = () => {
    setStatusFilter("ALL")
    setTypeFilter("ALL")
    setFarmFilter("ALL")
    setQuery("")
  }

  const hasNonDefaultFilters =
    statusFilter !== "ALL" ||
    typeFilter !== "ALL" ||
    farmFilter !== "ALL" ||
    query.trim().length > 0

  if (initialBatches.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
        <h2 className="text-lg font-semibold text-gray-900">Aucun lot cree</h2>
        <p className="mt-2 text-sm text-gray-500">
          Creez votre premier lot pour demarrer le suivi de production.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Lots crees" value={summary.total} />
        <SummaryCard label="Lots actifs" value={summary.active} tone="success" />
        <SummaryCard label="Lots termines" value={summary.closed} />
        <SummaryCard label="Fermes concernees" value={summary.farms} />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Tous les lots</h2>
              <p className="text-sm text-gray-500">
                {filteredBatches.length} {filteredBatches.length > 1 ? "lots affiches" : "lot affiche"}
              </p>
            </div>

            <div className="w-full lg:max-w-sm">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher un lot, une ferme ou un batiment"
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <FilterPill active={statusFilter === "ALL"} onClick={() => setStatusFilter("ALL")}>
                Tous
              </FilterPill>
              <FilterPill active={statusFilter === "ACTIVE"} onClick={() => setStatusFilter("ACTIVE")}>
                Actifs
              </FilterPill>
              <FilterPill active={statusFilter === "CLOSED"} onClick={() => setStatusFilter("CLOSED")}>
                Termines
              </FilterPill>
            </div>

            {distinctTypes.length > 1 && (
              <div className="flex flex-wrap gap-2">
                <FilterPill active={typeFilter === "ALL"} onClick={() => setTypeFilter("ALL")}>
                  Tous types
                </FilterPill>
                {distinctTypes.map((type) => (
                  <FilterPill
                    key={type}
                    active={typeFilter === type}
                    onClick={() => setTypeFilter(type)}
                  >
                    {TYPE_LABELS[type] ?? type}
                  </FilterPill>
                ))}
              </div>
            )}

            {distinctFarms.length > 1 && (
              <div className="flex flex-wrap gap-2">
                <FilterPill active={farmFilter === "ALL"} onClick={() => setFarmFilter("ALL")}>
                  Toutes fermes
                </FilterPill>
                {distinctFarms.map((farm) => (
                  <FilterPill
                    key={farm.id}
                    active={farmFilter === farm.id}
                    onClick={() => setFarmFilter(farm.id)}
                  >
                    {farm.name}
                  </FilterPill>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {filteredBatches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <p className="text-sm text-gray-500">
            Aucun lot ne correspond a votre recherche ou a vos filtres.
          </p>
          {hasNonDefaultFilters ? (
            <button
              type="button"
              onClick={resetFilters}
              className="mt-3 text-sm font-medium text-green-600 hover:text-green-700 hover:underline"
            >
              Reinitialiser les filtres
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredBatches.map((batch) => (
            <BatchCard key={batch.id} batch={batch} />
          ))}
        </div>
      )}
    </div>
  )
}
