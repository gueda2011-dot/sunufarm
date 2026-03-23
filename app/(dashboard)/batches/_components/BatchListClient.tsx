"use client"

/**
 * SunuFarm — Orchestrateur liste des lots (Client Component)
 *
 * Gère les filtres statut / type / ferme côté client depuis les données SSR.
 * Pas de re-fetch sur changement de filtre — réponse immédiate.
 *
 * Filtres par défaut (ajustement 1) :
 *   statusFilter = "ACTIVE"
 *   typeFilter   = "ALL"
 *   farmFilter   = "ALL"
 *
 * Un filtre type ou ferme n'est affiché que s'il présente au moins 2 valeurs
 * distinctes dans les lots chargés — sinon inutile et encombrant.
 */

import { useState, useMemo } from "react"
import { cn }                from "@/src/lib/utils"
import type { BatchSummary } from "@/src/actions/batches"
import { BatchCard }         from "./BatchCard"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  CHAIR:        "Poulet de chair",
  PONDEUSE:     "Pondeuse",
  REPRODUCTEUR: "Reproducteur",
}

type StatusFilter = "ACTIVE" | "CLOSED" | "ALL"

// ---------------------------------------------------------------------------
// FilterPill
// ---------------------------------------------------------------------------

function FilterPill({
  active,
  onClick,
  children,
}: {
  active:   boolean
  onClick:  () => void
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
          : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50",
      )}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BatchListClientProps {
  organizationId: string
  initialBatches: BatchSummary[]
  loadError?: string | null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BatchListClient({
  initialBatches,
  loadError = null,
}: BatchListClientProps) {
  // ── Filtres — valeurs par défaut (ajustement 1) ──────────────────────────
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ACTIVE")
  const [typeFilter,   setTypeFilter]   = useState<string>("ALL")
  const [farmFilter,   setFarmFilter]   = useState<string>("ALL")

  // ── Valeurs distinctes pour les sélecteurs optionnels ────────────────────
  const distinctTypes = useMemo(() => {
    return [...new Set(initialBatches.map((b) => b.type))]
  }, [initialBatches])

  const distinctFarms = useMemo(() => {
    const seen = new Map<string, string>()
    for (const b of initialBatches) {
      if (!seen.has(b.building.farm.id)) {
        seen.set(b.building.farm.id, b.building.farm.name)
      }
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [initialBatches])

  // ── Filtrage client-side ─────────────────────────────────────────────────
  const filteredBatches = useMemo(() => {
    return initialBatches.filter((batch) => {
      // Statut : "CLOSED" regroupe CLOSED + SOLD + SLAUGHTERED
      if (statusFilter === "ACTIVE" && batch.status !== "ACTIVE") return false
      if (statusFilter === "CLOSED" && batch.status === "ACTIVE") return false
      // Type
      if (typeFilter !== "ALL" && batch.type !== typeFilter) return false
      // Ferme
      if (farmFilter !== "ALL" && batch.building.farm.id !== farmFilter) return false
      return true
    })
  }, [initialBatches, statusFilter, typeFilter, farmFilter])

  // ── Reset filtres vers les valeurs par défaut ─────────────────────────────
  const resetFilters = () => {
    setStatusFilter("ACTIVE")
    setTypeFilter("ALL")
    setFarmFilter("ALL")
  }

  const hasNonDefaultFilters = statusFilter !== "ACTIVE" || typeFilter !== "ALL" || farmFilter !== "ALL"

  // ── État vide total (aucun lot dans l'org) ────────────────────────────────
  if (initialBatches.length === 0) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        {loadError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-700">
            {loadError}
          </div>
        )}
        <p className="text-5xl mb-4" aria-hidden>🐓</p>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Aucun lot créé
        </h2>
        <p className="text-sm text-gray-500">
          Créez votre premier lot pour démarrer le suivi de production.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {/* ── Titre + compteur ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Lots d&apos;élevage</h1>
        <span className="text-sm text-gray-400 tabular-nums">
          {filteredBatches.length}{" "}
          {filteredBatches.length === 1 ? "lot" : "lots"}
        </span>
      </div>

      {/* ── Filtres ──────────────────────────────────────────────────────── */}
      <div className="space-y-2">

        {/* Filtre statut — toujours visible */}
        <div className="flex flex-wrap gap-2">
          <FilterPill
            active={statusFilter === "ACTIVE"}
            onClick={() => setStatusFilter("ACTIVE")}
          >
            Actifs
          </FilterPill>
          <FilterPill
            active={statusFilter === "CLOSED"}
            onClick={() => setStatusFilter("CLOSED")}
          >
            Terminés
          </FilterPill>
          <FilterPill
            active={statusFilter === "ALL"}
            onClick={() => setStatusFilter("ALL")}
          >
            Tous
          </FilterPill>
        </div>

        {/* Filtre type — uniquement si plusieurs types distincts */}
        {distinctTypes.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <FilterPill
              active={typeFilter === "ALL"}
              onClick={() => setTypeFilter("ALL")}
            >
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

        {/* Filtre ferme — uniquement si plusieurs fermes distinctes */}
        {distinctFarms.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <FilterPill
              active={farmFilter === "ALL"}
              onClick={() => setFarmFilter("ALL")}
            >
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

      {/* ── État vide filtré ─────────────────────────────────────────────── */}
      {filteredBatches.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-gray-500 mb-3 text-sm">
            {statusFilter === "ACTIVE"
              ? "Aucun lot actif"
              : statusFilter === "CLOSED"
              ? "Aucun lot terminé"
              : "Aucun lot correspondant"}
          </p>
          {hasNonDefaultFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-sm text-green-600 hover:text-green-700 hover:underline"
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>
      )}

      {/* ── Liste des lots ───────────────────────────────────────────────── */}
      {filteredBatches.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredBatches.map((batch) => (
            <BatchCard key={batch.id} batch={batch} />
          ))}
        </div>
      )}
    </div>
  )
}
