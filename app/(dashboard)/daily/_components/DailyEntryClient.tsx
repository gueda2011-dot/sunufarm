"use client"

/**
 * SunuFarm — Orchestrateur saisie journalière (Client Component)
 *
 * Responsabilités :
 *   - État sélection lot + date
 *   - Détection doublon client-side (best-effort sur 14 records chargés)
 *     Source de vérité = contrainte unique @@batchId_date côté serveur
 *   - État mode édition (record existant)
 *   - Locked state UX aligné sur la logique backend — pas autoritaire
 *     Rôle standard : formulaire désactivé
 *     MANAGER+ : édition autorisée si le backend l'accepte
 *   - Calcul âge du lot côté client à partir des données SSR (pas de fetch additionnel)
 */

import { useState, useCallback } from "react"
import { useQuery, useQueryClient }          from "@tanstack/react-query"
import { getDailyRecords }                   from "@/src/actions/daily-records"
import type { BatchSummary }                 from "@/src/actions/batches"
import type { DailyRecordDetail }            from "@/src/actions/daily-records"
import { DailyForm }                         from "./DailyForm"
import { RecentRecords }                     from "./RecentRecords"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Date locale YYYY-MM-DD (valeur par défaut du champ date HTML) */
function todayStr(): string {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = String(now.getMonth() + 1).padStart(2, "0")
  const d   = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * Calcule l'âge du lot (en jours) à une date donnée.
 * Utilise entryDate + entryAgeDay issus du SSR — pas de fetch.
 */
function computeAgeDay(batch: BatchSummary, dateStr: string): number {
  const entryMs    = new Date(batch.entryDate).getTime()
  const selectedMs = new Date(`${dateStr}T00:00:00Z`).getTime()
  const diffDays   = Math.max(0, Math.floor((selectedMs - entryMs) / 86_400_000))
  return batch.entryAgeDay + diffDays
}

/**
 * Compare une date Prisma (UTC minuit) avec une chaîne YYYY-MM-DD du HTML input.
 * Couverture partielle (best-effort) : seuls les 14 records chargés sont testés.
 * La contrainte unique @@batchId_date côté serveur est la vraie source de vérité.
 */
function recordMatchesDate(record: DailyRecordDetail, dateStr: string): boolean {
  return new Date(record.date).toISOString().substring(0, 10) === dateStr
}

const MANAGER_OR_ABOVE = ["SUPER_ADMIN", "OWNER", "MANAGER"] as const

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DailyEntryClientProps {
  organizationId: string
  /** Valeur UserRole transmise comme string — évite d'importer le client Prisma ici */
  userRole:       string
  initialBatches: BatchSummary[]
  /** Pré-sélection lot depuis ?batchId= (bouton "Saisir" de la liste des lots) */
  defaultBatchId?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DailyEntryClient({
  organizationId,
  userRole,
  initialBatches,
  defaultBatchId,
}: DailyEntryClientProps) {
  const queryClient   = useQueryClient()
  const canEditLocked = MANAGER_OR_ABOVE.includes(
    userRole as (typeof MANAGER_OR_ABOVE)[number],
  )

  // ── Sélection lot ──────────────────────────────────────────────────────────
  // Priorité : ?batchId= (bouton "Saisir") → lot unique → aucune pré-sélection
  const [selectedBatchId, setSelectedBatchId] = useState<string>(() => {
    if (defaultBatchId && initialBatches.some((b) => b.id === defaultBatchId)) {
      return defaultBatchId
    }
    return initialBatches.length === 1 ? initialBatches[0].id : ""
  })

  // ── Sélection date — défaut : aujourd'hui (date locale) ───────────────────
  const [selectedDate, setSelectedDate] = useState<string>(todayStr())

  // ── Mode édition ──────────────────────────────────────────────────────────
  const [isEditMode,    setIsEditMode]    = useState(false)
  const [editingRecord, setEditingRecord] = useState<DailyRecordDetail | null>(null)

  const selectedBatch = initialBatches.find((b) => b.id === selectedBatchId)

  // ── Records récents (14 = ~2 semaines, suffisant pour la détection doublon) ─
  const { data: recentRecords = [], isLoading: loadingRecords } = useQuery({
    queryKey:  ["dailyRecords", organizationId, selectedBatchId],
    queryFn:   async () => {
      if (!selectedBatchId) return []
      const result = await getDailyRecords({
        organizationId,
        batchId: selectedBatchId,
        limit:   14,
      })
      return result.success ? result.data : []
    },
    enabled:   !!selectedBatchId,
    staleTime: 60_000, // 1 minute
  })

  // ── Doublon dans la fenêtre chargée (best-effort, ajustement 1) ───────────
  const existingRecord = recentRecords.find((r) =>
    recordMatchesDate(r, selectedDate),
  )

  // ── Locked state UX — aligné sur backend, pas autoritaire (ajustement 6) ──
  // Rôle standard : bloqué. MANAGER+ : édition autorisée (backend statue en final).
  const isLocked = !!(existingRecord?.isLocked && !canEditLocked)

  // ── Callback post-soumission réussie ──────────────────────────────────────
  const handleSuccess = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["dailyRecords", organizationId, selectedBatchId],
    })
    setIsEditMode(false)
    setEditingRecord(null)
  }, [queryClient, organizationId, selectedBatchId])

  // ── Passer en mode édition sur le record existant ─────────────────────────
  const handleEditExisting = () => {
    if (!existingRecord) return
    setIsEditMode(true)
    setEditingRecord(existingRecord)
  }

  // ── Âge du lot à la date sélectionnée (calculé côté client, ajustement 5) ─
  const ageDay = selectedBatch ? computeAgeDay(selectedBatch, selectedDate) : null

  // ── Valeurs par défaut du formulaire ──────────────────────────────────────
  // En mode édition : pré-remplissage depuis le record existant
  const formDefaults = {
    mortality:    editingRecord?.mortality    ?? 0,
    feedKg:       editingRecord?.feedKg       ?? 0,
    waterLiters:  editingRecord?.waterLiters  ?? undefined,
    avgWeightG:   editingRecord?.avgWeightG   ?? undefined,
    observations: editingRecord?.observations ?? "",
  }

  // ── État vide — aucun lot actif ───────────────────────────────────────────
  if (initialBatches.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-5xl mb-4" aria-hidden>🐓</p>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Aucun lot actif
        </h2>
        <p className="text-sm text-gray-500">
          Créez un lot d&apos;élevage pour commencer la saisie journalière.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">

      {/* ── Titre ──────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Saisie journalière</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          3 champs sufisent. Détails optionnels disponibles en bas.
        </p>
      </div>

      {/* ── Sélecteur lot ──────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <label htmlFor="batch-select" className="block text-sm font-medium text-gray-700">
          Lot actif
        </label>
        <select
          id="batch-select"
          value={selectedBatchId}
          onChange={(e) => {
            setSelectedBatchId(e.target.value)
            setIsEditMode(false)
            setEditingRecord(null)
          }}
          className="w-full h-[52px] rounded-xl border border-gray-300 bg-white px-4 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent"
        >
          {initialBatches.length > 1 && (
            <option value="">— Sélectionner un lot —</option>
          )}
          {initialBatches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.number} · {batch.building.farm.name} / {batch.building.name}
            </option>
          ))}
        </select>
      </div>

      {/* ── Sélecteur date ─────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <label htmlFor="date-input" className="block text-sm font-medium text-gray-700">
          Date
        </label>
        <input
          id="date-input"
          type="date"
          value={selectedDate}
          onChange={(e) => {
            setSelectedDate(e.target.value)
            setIsEditMode(false)
            setEditingRecord(null)
          }}
          max={todayStr()}
          className="w-full h-[52px] rounded-xl border border-gray-300 bg-white px-4 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent"
        />
      </div>

      {/* ── Info lot sélectionné (ajustement 5 : données SSR, pas de fetch) ── */}
      {selectedBatch && (
        <div className="rounded-xl bg-green-50 border border-green-100 px-4 py-3 flex items-center justify-between text-sm">
          <div className="min-w-0">
            <span className="font-semibold text-green-800 truncate">
              {selectedBatch.number}
            </span>
            <span className="text-green-600 ml-2 text-xs truncate">
              {selectedBatch.building.farm.name} / {selectedBatch.building.name}
            </span>
          </div>
          <div className="shrink-0 ml-3 text-right text-green-700 text-xs font-medium tabular-nums">
            <div>{ageDay !== null ? `Jour ${ageDay}` : ""}</div>
            <div className="text-green-500">{selectedBatch.entryCount} sujets</div>
          </div>
        </div>
      )}

      {/* ── Alerte doublon (ajustement 1) ───────────────────────────────────── */}
      {existingRecord && !isEditMode && selectedBatch && (
        <div
          className={`rounded-xl border px-4 py-3 flex items-start justify-between gap-3 text-sm ${
            isLocked
              ? "bg-gray-50 border-gray-200 text-gray-600"
              : "bg-orange-50 border-orange-200 text-orange-800"
          }`}
        >
          <p className="flex-1">
            {isLocked ? (
              <>
                <span className="font-semibold">Saisie verrouillée.</span>
                {" "}Contactez un gestionnaire pour la corriger.
              </>
            ) : (
              <>
                <span className="font-semibold">Saisie existante pour cette date.</span>
                {" "}Vous pouvez la corriger.
              </>
            )}
          </p>
          {!isLocked && (
            <button
              type="button"
              onClick={handleEditExisting}
              className="shrink-0 rounded-lg bg-orange-600 text-white text-sm font-medium px-3 py-1.5 hover:bg-orange-700 transition-colors"
            >
              Modifier
            </button>
          )}
        </div>
      )}

      {/* ── Formulaire — masqué si doublon non édité ou verrouillé ─────────── */}
      {selectedBatch && (!existingRecord || isEditMode) && !isLocked && (
        <DailyForm
          key={`${selectedBatchId}-${selectedDate}-${isEditMode ? "edit" : "create"}`}
          organizationId={organizationId}
          batchId={selectedBatchId}
          selectedDate={selectedDate}
          entryCount={selectedBatch.entryCount}
          isEditMode={isEditMode}
          editingRecordId={editingRecord?.id}
          defaultValues={formDefaults}
          onSuccess={handleSuccess}
        />
      )}

      {/* ── Historique récent ──────────────────────────────────────────────── */}
      {selectedBatch && (
        <RecentRecords
          records={recentRecords}
          isLoading={loadingRecords}
          selectedDate={selectedDate}
        />
      )}
    </div>
  )
}
