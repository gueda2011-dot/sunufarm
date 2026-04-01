"use client"

/**
 * SunuFarm — Section santé du détail d'un lot (Client Component)
 *
 * Affiche l'historique vaccinations + traitements et permet d'en créer
 * directement depuis la page de détail du lot.
 *
 * Permissions : le bouton de création est affiché selon le userRole.
 *   CREATE_VACCINATION / CREATE_TREATMENT → OWNER, MANAGER, VET, SUPER_ADMIN
 */

import { useCallback, useEffect, useState, useTransition } from "react"
import type { BatchType } from "@/src/generated/prisma/client"
import { formatDate }              from "@/src/lib/formatters"
import { createVaccination, createTreatment } from "@/src/actions/health"
import { getVaccinationSuggestions } from "@/src/lib/health-guidance"
import { OfflineSyncCard } from "@/app/(dashboard)/daily/_components/OfflineSyncCard"
import {
  createClientMutationId,
  deleteOfflineDailyQueueItem,
  enqueueOfflineTreatment,
  enqueueOfflineVaccination,
  flushOfflineDailyQueue,
  listPendingOfflineQueueItemsByScope,
  readOfflineDailySyncMeta,
  retryOfflineDailyQueueItem,
  subscribeToOfflineDailyQueue,
} from "@/src/lib/offline-mutation-outbox"
import type {
  VaccinationSummary,
  TreatmentSummary,
}                                  from "@/src/actions/health"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HealthSectionProps {
  vaccinations:   VaccinationSummary[]
  treatments:     TreatmentSummary[]
  medicineStocks: Array<{
    id: string
    name: string
    unit: string
    quantityOnHand: number
  }>
  batchId:        string
  organizationId: string
  userRole:       string
  entryDate:      Date
  entryCount:     number
  batchType:      BatchType
  ageDay:         number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Panel = "vaccination" | "treatment" | null

export function HealthSection({
  vaccinations:   initialVaccinations,
  treatments:     initialTreatments,
  medicineStocks,
  batchId,
  organizationId,
  userRole,
  entryDate,
  entryCount,
  batchType,
  ageDay,
}: HealthSectionProps) {
  const canCreate = ["SUPER_ADMIN", "OWNER", "MANAGER", "VET"].includes(userRole)

  const [vaccinations, setVaccinations] = useState(initialVaccinations)
  const [treatments,   setTreatments]   = useState(initialTreatments)
  const [panel,        setPanel]        = useState<Panel>(null)
  const [error,        setError]        = useState<string | null>(null)
  const [isPending,    startTransition]  = useTransition()
  const [isOnline, setIsOnline] = useState<boolean>(() => (
    typeof navigator === "undefined" ? true : navigator.onLine
  ))
  const [pendingItems, setPendingItems] = useState<Array<{
    id: string
    label: string
    createdAt: string
    status: "pending" | "failed"
    lastError?: string
  }>>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [lastSyncError, setLastSyncError] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const vaccinationSuggestions = getVaccinationSuggestions({
    batchType,
    ageDay,
    recordedVaccines: vaccinations.map((item) => item.vaccineName),
  })
  const dueSuggestions = vaccinationSuggestions.filter((item) => item.status === "due" || item.status === "overdue")

  const refreshOfflineState = useCallback(async () => {
    const items = await listPendingOfflineQueueItemsByScope("health")
    setPendingItems(items)
    const meta = readOfflineDailySyncMeta()
    setLastSyncedAt(meta.lastSyncedAt)
    setLastSyncError(meta.lastError)
  }, [])

  const syncOfflineQueue = useCallback(async () => {
    if (!isOnline || isSyncing) return
    setIsSyncing(true)
    try {
      await flushOfflineDailyQueue()
      await refreshOfflineState()
    } finally {
      setIsSyncing(false)
    }
  }, [isOnline, isSyncing, refreshOfflineState])

  const retryOfflineItem = useCallback(async (itemId: string) => {
    if (!isOnline || isSyncing) return
    setIsSyncing(true)
    try {
      await retryOfflineDailyQueueItem(itemId)
      await flushOfflineDailyQueue({ itemId })
      await refreshOfflineState()
    } finally {
      setIsSyncing(false)
    }
  }, [isOnline, isSyncing, refreshOfflineState])

  const removeOfflineItem = useCallback(async (itemId: string) => {
    await deleteOfflineDailyQueueItem(itemId)
    await refreshOfflineState()
  }, [refreshOfflineState])

  useEffect(() => {
    void refreshOfflineState()
    const unsubscribe = subscribeToOfflineDailyQueue(() => {
      void refreshOfflineState()
    })
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      unsubscribe()
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [refreshOfflineState])

  useEffect(() => {
    if (!isOnline || pendingItems.length === 0) return
    void syncOfflineQueue()
  }, [isOnline, pendingItems.length, syncOfflineQueue])

  // ---------------------------------------------------------------------------
  // Création vaccination
  // ---------------------------------------------------------------------------

  function handleCreateVaccination(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)

    startTransition(async () => {
      const clientMutationId = createClientMutationId("vaccination")
      const payload = {
        clientMutationId,
        organizationId,
        batchId,
        date: fd.get("date") as string,
        vaccineName: fd.get("vaccineName") as string,
        route: (fd.get("route") as string) || undefined,
        dose: (fd.get("dose") as string) || undefined,
        countVaccinated: parseInt(fd.get("countVaccinated") as string, 10),
        medicineStockId: (fd.get("medicineStockId") as string) || undefined,
        medicineQuantity: (fd.get("medicineQuantity") as string)
          ? Number.parseFloat(fd.get("medicineQuantity") as string)
          : undefined,
        notes: (fd.get("notes") as string) || undefined,
      }

      const queueVaccination = async () => {
        await enqueueOfflineVaccination(payload)
        setPanel(null)
        ;(e.target as HTMLFormElement).reset()
        await refreshOfflineState()
      }

      try {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          await queueVaccination()
          return
        }

        const result = await createVaccination({
          ...payload,
          date: new Date(payload.date),
        })

        if (!result.success) { setError(result.error); return }

        const newVax: VaccinationSummary = {
          id: result.data.id,
          organizationId,
          batchId,
          date: new Date(payload.date),
          batchAgeDay: result.data.batchAgeDay,
          vaccineName: payload.vaccineName,
          route: payload.route || null,
          dose: payload.dose || null,
          countVaccinated: payload.countVaccinated,
          medicineStockId: payload.medicineStockId || null,
          notes: payload.notes || null,
          recordedById: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        setVaccinations((prev) => [newVax, ...prev])
        setPanel(null)
        ;(e.target as HTMLFormElement).reset()
      } catch (submitError) {
        const offlineFailure =
          (typeof navigator !== "undefined" && !navigator.onLine) ||
          (submitError instanceof Error && /fetch|network|offline|failed to fetch/i.test(submitError.message))
        if (!offlineFailure) {
          throw submitError
        }
        await queueVaccination()
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Création traitement
  // ---------------------------------------------------------------------------

  function handleCreateTreatment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)

    const durationRaw = fd.get("durationDays") as string
    const countRaw    = fd.get("countTreated")  as string

    startTransition(async () => {
      const clientMutationId = createClientMutationId("treatment")
      const payload = {
        clientMutationId,
        organizationId,
        batchId,
        startDate: fd.get("startDate") as string,
        medicineName: fd.get("medicineName") as string,
        dose: (fd.get("dose") as string) || undefined,
        durationDays: durationRaw ? parseInt(durationRaw, 10) : undefined,
        countTreated: countRaw ? parseInt(countRaw, 10) : undefined,
        medicineStockId: (fd.get("medicineStockId") as string) || undefined,
        medicineQuantity: (fd.get("medicineQuantity") as string)
          ? Number.parseFloat(fd.get("medicineQuantity") as string)
          : undefined,
        indication: (fd.get("indication") as string) || undefined,
        notes: (fd.get("notes") as string) || undefined,
      }

      const queueTreatment = async () => {
        await enqueueOfflineTreatment(payload)
        setPanel(null)
        ;(e.target as HTMLFormElement).reset()
        await refreshOfflineState()
      }

      try {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          await queueTreatment()
          return
        }

        const result = await createTreatment({
          ...payload,
          startDate: new Date(payload.startDate),
        })

        if (!result.success) { setError(result.error); return }

        const newTreatment: TreatmentSummary = {
          id: result.data.id,
          organizationId,
          batchId,
          startDate: new Date(payload.startDate),
          endDate: null,
          medicineName: payload.medicineName,
          dose: payload.dose || null,
          durationDays: payload.durationDays ?? null,
          countTreated: payload.countTreated ?? null,
          medicineStockId: payload.medicineStockId || null,
          indication: payload.indication || null,
          notes: payload.notes || null,
          recordedById: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        setTreatments((prev) => [newTreatment, ...prev])
        setPanel(null)
        ;(e.target as HTMLFormElement).reset()
      } catch (submitError) {
        const offlineFailure =
          (typeof navigator !== "undefined" && !navigator.onLine) ||
          (submitError instanceof Error && /fetch|network|offline|failed to fetch/i.test(submitError.message))
        if (!offlineFailure) {
          throw submitError
        }
        await queueTreatment()
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">

      {/* ── Titre + boutons ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Santé
        </h2>
        {canCreate && (
          <div className="flex gap-2">
            <button
              onClick={() => { setPanel(panel === "vaccination" ? null : "vaccination"); setError(null) }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {panel === "vaccination" ? "Annuler" : "+ Vaccination"}
            </button>
            <button
              onClick={() => { setPanel(panel === "treatment" ? null : "treatment"); setError(null) }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {panel === "treatment" ? "Annuler" : "+ Traitement"}
            </button>
          </div>
        )}
      </div>

      {/* ── Erreur ───────────────────────────────────────────────────────── */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <OfflineSyncCard
        isOnline={isOnline}
        pendingCount={pendingItems.length}
        failedCount={pendingItems.filter((item) => item.status === "failed").length}
        isSyncing={isSyncing}
        lastSyncedAt={lastSyncedAt}
        lastError={lastSyncError}
        items={pendingItems}
        onSync={() => {
          void syncOfflineQueue()
        }}
        onRetryItem={(itemId) => {
          void retryOfflineItem(itemId)
        }}
        onRemoveItem={(itemId) => {
          void removeOfflineItem(itemId)
        }}
      />

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-blue-900">Suggestions vaccinales</p>
            <p className="mt-1 text-xs text-blue-700">
              Recommandations indicatives selon le type de lot et l&apos;age actuel. A valider avec votre veterinaire et votre couvoir.
            </p>
          </div>
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-blue-700">
            Jour {ageDay}
          </span>
        </div>

        {dueSuggestions.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {dueSuggestions.length} vaccination(s) a surveiller maintenant sur ce lot.
          </div>
        )}

        <div className="space-y-2">
          {vaccinationSuggestions.map((suggestion) => (
            <div
              key={suggestion.key}
              className="rounded-lg bg-white px-3 py-3 text-sm text-gray-700"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-gray-900">{suggestion.vaccineName}</p>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                  suggestion.status === "done"
                    ? "bg-emerald-100 text-emerald-700"
                    : suggestion.status === "due"
                      ? "bg-amber-100 text-amber-700"
                      : suggestion.status === "overdue"
                        ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-600"
                }`}>
                  {suggestion.status === "done"
                    ? "Deja fait"
                    : suggestion.status === "due"
                      ? "A faire"
                      : suggestion.status === "overdue"
                        ? "En retard"
                        : "Plus tard"}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Fenetre conseillee : J{suggestion.windowStartDay} a J{suggestion.windowEndDay} - {suggestion.route}
              </p>
              <p className="mt-1 text-xs text-gray-600">{suggestion.note}</p>
              {suggestion.matchedRecordName && (
                <p className="mt-1 text-xs text-emerald-700">
                  Enregistre comme : {suggestion.matchedRecordName}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Formulaire vaccination ───────────────────────────────────────── */}
      {panel === "vaccination" && (
        <form
          onSubmit={handleCreateVaccination}
          className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3"
        >
          <p className="text-sm font-semibold text-green-800">Nouvelle vaccination</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                name="date"
                type="date"
                required
                defaultValue={today}
                min={entryDate.toISOString().slice(0, 10)}
                max={today}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Vaccin <span className="text-red-500">*</span>
              </label>
              <input
                name="vaccineName"
                required
                placeholder="Newcastle, Gumboro..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Sujets vaccinés <span className="text-red-500">*</span>
              </label>
              <input
                name="countVaccinated"
                type="number"
                required
                min="1"
                max={entryCount}
                defaultValue={entryCount}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Voie</label>
              <select
                name="route"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">—</option>
                <option value="Oculaire">Oculaire</option>
                <option value="Eau de boisson">Eau de boisson</option>
                <option value="Spray">Spray</option>
                <option value="Injection">Injection</option>
                <option value="Nasale">Nasale</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Dose</label>
              <input
                name="dose"
                placeholder="1 dose/sujet"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <input
              name="notes"
              placeholder="Observations..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Stock médicament</label>
              <select
                name="medicineStockId"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                defaultValue=""
              >
                <option value="">—</option>
                {medicineStocks.map((stock) => (
                  <option key={stock.id} value={stock.id}>
                    {stock.name} · {stock.quantityOnHand.toLocaleString("fr-SN")} {stock.unit}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Quantité consommée</label>
              <input
                name="medicineQuantity"
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex: 1"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Enregistrement…" : "Enregistrer la vaccination"}
          </button>
        </form>
      )}

      {/* ── Formulaire traitement ────────────────────────────────────────── */}
      {panel === "treatment" && (
        <form
          onSubmit={handleCreateTreatment}
          className="rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-3"
        >
          <p className="text-sm font-semibold text-orange-800">Nouveau traitement</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Date début <span className="text-red-500">*</span>
              </label>
              <input
                name="startDate"
                type="date"
                required
                defaultValue={today}
                min={entryDate.toISOString().slice(0, 10)}
                max={today}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Médicament <span className="text-red-500">*</span>
              </label>
              <input
                name="medicineName"
                required
                placeholder="Amoxicilline, Tylosine..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Durée (jours)</label>
              <input
                name="durationDays"
                type="number"
                min="1"
                max="30"
                placeholder="5"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Sujets traités</label>
              <input
                name="countTreated"
                type="number"
                min="1"
                max={entryCount}
                placeholder={String(entryCount)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Dose</label>
              <input
                name="dose"
                placeholder="1g/litre"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Indication (motif)</label>
            <input
              name="indication"
              placeholder="Bronchite, coryza, prévention..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <input
              name="notes"
              placeholder="Observations..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Stock médicament</label>
              <select
                name="medicineStockId"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                defaultValue=""
              >
                <option value="">—</option>
                {medicineStocks.map((stock) => (
                  <option key={stock.id} value={stock.id}>
                    {stock.name} · {stock.quantityOnHand.toLocaleString("fr-SN")} {stock.unit}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Quantité consommée</label>
              <input
                name="medicineQuantity"
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex: 1"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Enregistrement…" : "Enregistrer le traitement"}
          </button>
        </form>
      )}

      {/* ── Historique vaccinations ──────────────────────────────────────── */}
      {vaccinations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-gray-500">
            Vaccinations ({vaccinations.length})
          </h3>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Date</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Vaccin</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400">J. âge</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400">Sujets</th>
                  </tr>
                </thead>
                <tbody>
                  {vaccinations.map((v, i) => (
                    <tr key={v.id} className={i < vaccinations.length - 1 ? "border-b border-gray-50" : ""}>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{formatDate(v.date)}</td>
                      <td className="px-4 py-2.5 text-gray-800">
                        <div className="font-medium">{v.vaccineName}</div>
                        {v.route && <div className="text-xs text-gray-400">{v.route}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums whitespace-nowrap">J. {v.batchAgeDay}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums whitespace-nowrap">
                        {v.countVaccinated.toLocaleString("fr-SN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Historique traitements ───────────────────────────────────────── */}
      {treatments.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-gray-500">
            Traitements ({treatments.length})
          </h3>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Début</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Médicament</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400">Durée</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400">Fin</th>
                  </tr>
                </thead>
                <tbody>
                  {treatments.map((t, i) => (
                    <tr key={t.id} className={i < treatments.length - 1 ? "border-b border-gray-50" : ""}>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{formatDate(t.startDate)}</td>
                      <td className="px-4 py-2.5 text-gray-800">
                        <div className="font-medium">{t.medicineName}</div>
                        {t.indication && (
                          <div className="text-xs text-gray-400 truncate max-w-[160px]">{t.indication}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums whitespace-nowrap">
                        {t.durationDays != null ? `${t.durationDays} j.` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500 whitespace-nowrap">
                        {t.endDate ? formatDate(t.endDate) : (
                          <span className="text-orange-500 font-medium">En cours</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── État vide ───────────────────────────────────────────────────── */}
      {vaccinations.length === 0 && treatments.length === 0 && panel === null && (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-400">
          Aucune vaccination ni traitement enregistré.
          {canCreate && " Utilisez les boutons ci-dessus pour commencer."}
        </div>
      )}
    </div>
  )
}
