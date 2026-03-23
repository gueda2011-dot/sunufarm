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

import { useState, useTransition } from "react"
import { formatDate }              from "@/src/lib/formatters"
import {
  createVaccination,
  createTreatment,
  updateVaccination,
} from "@/src/actions/health"
import type {
  VaccinationSummary,
  TreatmentSummary,
}                                  from "@/src/actions/health"
import { stripVaccinationStockImpactFromNotes } from "@/src/lib/health-stock-impact"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HealthSectionProps {
  vaccinations:   VaccinationSummary[]
  treatments:     TreatmentSummary[]
  batchId:        string
  organizationId: string
  userRole:       string
  entryDate:      Date
  entryCount:     number
  medicineStocks: Array<{
    id: string
    name: string
    unit: string
    quantityOnHand: number
  }>
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Panel = "vaccination" | "treatment" | null

export function HealthSection({
  vaccinations:   initialVaccinations,
  treatments:     initialTreatments,
  batchId,
  organizationId,
  userRole,
  entryDate,
  entryCount,
  medicineStocks,
}: HealthSectionProps) {
  const canCreate = ["SUPER_ADMIN", "OWNER", "MANAGER", "VET"].includes(userRole)

  const [vaccinations, setVaccinations] = useState(initialVaccinations)
  const [treatments,   setTreatments]   = useState(initialTreatments)
  const [panel,        setPanel]        = useState<Panel>(null)
  const [editingVaccinationId, setEditingVaccinationId] = useState<string | null>(null)
  const [error,        setError]        = useState<string | null>(null)
  const [isPending,    startTransition]  = useTransition()

  const today = new Date().toISOString().slice(0, 10)
  const editingVaccination =
    vaccinations.find((vaccination) => vaccination.id === editingVaccinationId) ?? null

  function resetVaccinationPanel() {
    setPanel(null)
    setEditingVaccinationId(null)
  }

  // ---------------------------------------------------------------------------
  // Création vaccination
  // ---------------------------------------------------------------------------

  function handleCreateVaccination(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    const impactStock = fd.get("impactStock") === "on"
    const medicineStockId = (fd.get("medicineStockId") as string) || undefined
    const consumedQuantityRaw = fd.get("consumedQuantity") as string
    const consumedUnit = (fd.get("consumedUnit") as string) || undefined

    startTransition(async () => {
      const result = await createVaccination({
        organizationId,
        batchId,
        date:            new Date(fd.get("date") as string),
        vaccineName:     fd.get("vaccineName") as string,
        route:           (fd.get("route") as string) || undefined,
        dose:            (fd.get("dose") as string) || undefined,
        countVaccinated: parseInt(fd.get("countVaccinated") as string, 10),
        medicineStockId,
        notes:           (fd.get("notes") as string) || undefined,
        stockImpact: {
          enabled: impactStock,
          consumedQuantity: impactStock && consumedQuantityRaw
            ? parseFloat(consumedQuantityRaw)
            : undefined,
          consumedUnit: impactStock ? consumedUnit : undefined,
        },
      })

      if (!result.success) { setError(result.error); return }

      setVaccinations((prev) => [result.data, ...prev])
      resetVaccinationPanel()
      ;(e.target as HTMLFormElement).reset()
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
      const result = await createTreatment({
        organizationId,
        batchId,
        startDate:    new Date(fd.get("startDate") as string),
        medicineName: fd.get("medicineName") as string,
        dose:         (fd.get("dose") as string) || undefined,
        durationDays: durationRaw ? parseInt(durationRaw, 10) : undefined,
        countTreated: countRaw    ? parseInt(countRaw, 10)    : undefined,
        indication:   (fd.get("indication") as string) || undefined,
        notes:        (fd.get("notes") as string) || undefined,
      })

      if (!result.success) { setError(result.error); return }

      const newTreatment: TreatmentSummary = {
        id:              result.data.id,
        organizationId,
        batchId,
        startDate:       new Date(fd.get("startDate") as string),
        endDate:         null,
        medicineName:    fd.get("medicineName") as string,
        dose:            (fd.get("dose") as string) || null,
        durationDays:    durationRaw ? parseInt(durationRaw, 10) : null,
        countTreated:    countRaw    ? parseInt(countRaw, 10)    : null,
        medicineStockId: null,
        indication:      (fd.get("indication") as string) || null,
        notes:           (fd.get("notes") as string) || null,
        recordedById:    null,
        createdAt:       new Date(),
        updatedAt:       new Date(),
      }
      setTreatments((prev) => [newTreatment, ...prev])
      setPanel(null)
      ;(e.target as HTMLFormElement).reset()
    })
  }

  function handleUpdateVaccination(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editingVaccination) return

    setError(null)
    const fd = new FormData(e.currentTarget)
    const impactStock = fd.get("impactStock") === "on"
    const medicineStockIdRaw = fd.get("medicineStockId") as string
    const consumedQuantityRaw = fd.get("consumedQuantity") as string
    const consumedUnit = (fd.get("consumedUnit") as string) || undefined

    startTransition(async () => {
      const result = await updateVaccination({
        organizationId,
        vaccinationId: editingVaccination.id,
        vaccineName: (fd.get("vaccineName") as string) || undefined,
        route: (fd.get("route") as string) || undefined,
        dose: (fd.get("dose") as string) || undefined,
        countVaccinated: parseInt(fd.get("countVaccinated") as string, 10),
        medicineStockId: medicineStockIdRaw ? medicineStockIdRaw : null,
        notes: (fd.get("notes") as string) || undefined,
        stockImpact: {
          enabled: impactStock,
          consumedQuantity: impactStock && consumedQuantityRaw
            ? parseFloat(consumedQuantityRaw)
            : undefined,
          consumedUnit: impactStock ? consumedUnit : undefined,
        },
      })

      if (!result.success) {
        setError(result.error)
        return
      }

      setVaccinations((prev) =>
        prev.map((vaccination) =>
          vaccination.id === result.data.id ? result.data : vaccination,
        ),
      )
      resetVaccinationPanel()
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
              onClick={() => {
                setEditingVaccinationId(null)
                setPanel(panel === "vaccination" ? null : "vaccination")
                setError(null)
              }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {panel === "vaccination" && !editingVaccinationId ? "Annuler" : "+ Vaccination"}
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

      {/* ── Formulaire vaccination ───────────────────────────────────────── */}
      {panel === "vaccination" && (
        <form
          onSubmit={editingVaccination ? handleUpdateVaccination : handleCreateVaccination}
          className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3"
        >
          <p className="text-sm font-semibold text-green-800">
            {editingVaccination ? "Modifier la vaccination" : "Nouvelle vaccination"}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                name="date"
                type="date"
                required
                defaultValue={
                  editingVaccination
                    ? new Date(editingVaccination.date).toISOString().slice(0, 10)
                    : today
                }
                min={entryDate.toISOString().slice(0, 10)}
                max={today}
                disabled={Boolean(editingVaccination)}
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
                defaultValue={editingVaccination?.vaccineName ?? ""}
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
                defaultValue={editingVaccination?.countVaccinated ?? entryCount}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Voie</label>
              <select
                name="route"
                defaultValue={editingVaccination?.route ?? ""}
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
                defaultValue={editingVaccination?.dose ?? ""}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div className="rounded-lg border border-white/80 bg-white/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Impacte le stock</p>
                <p className="text-xs text-gray-500">
                  Cree une sortie stock source SANTE seulement si la consommation
                  est explicite.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  name="impactStock"
                  type="checkbox"
                  defaultChecked={editingVaccination?.stockImpact.enabled ?? false}
                />
                Oui
              </label>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Stock medicament
                </label>
                <select
                  name="medicineStockId"
                  defaultValue={editingVaccination?.medicineStockId ?? ""}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Selectionner un stock</option>
                  {medicineStocks.map((stock) => (
                    <option key={stock.id} value={stock.id}>
                      {stock.name} ({stock.quantityOnHand} {stock.unit} dispo)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Quantite consommee
                </label>
                <input
                  name="consumedQuantity"
                  type="number"
                  min="0.01"
                  step="0.01"
                  defaultValue={editingVaccination?.stockImpact.consumedQuantity ?? ""}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Unite stock</label>
                <input
                  name="consumedUnit"
                  defaultValue={editingVaccination?.stockImpact.consumedUnit ?? ""}
                  placeholder="dose, flacon, litre..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Le stock choisi doit appartenir a la meme ferme que ce lot. La
              quantite consommee doit etre explicite et dans l unite du stock.
            </p>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <input
              name="notes"
              placeholder="Observations..."
              defaultValue={
                editingVaccination
                  ? stripVaccinationStockImpactFromNotes(editingVaccination.notes) ?? ""
                  : ""
              }
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {isPending
              ? "Enregistrement..."
              : editingVaccination
                ? "Enregistrer les modifications"
                : "Enregistrer la vaccination"}
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
                        <div className="flex flex-wrap items-center gap-2">
                          {v.route && <div className="text-xs text-gray-400">{v.route}</div>}
                          <span className={`rounded-full px-2 py-0.5 text-xs ${
                            v.stockImpact.enabled
                              ? "bg-amber-100 text-amber-800"
                              : "bg-gray-100 text-gray-500"
                          }`}>
                            {v.stockImpact.enabled
                              ? `Stock: ${v.stockImpact.consumedQuantity} ${v.stockImpact.consumedUnit}`
                              : "Sans impact stock"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums whitespace-nowrap">J. {v.batchAgeDay}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums whitespace-nowrap">
                        <div>{v.countVaccinated.toLocaleString("fr-SN")}</div>
                        {canCreate ? (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => {
                              setEditingVaccinationId(v.id)
                              setPanel("vaccination")
                              setError(null)
                            }}
                            className="mt-1 text-xs text-blue-600 hover:underline disabled:opacity-40"
                          >
                            Modifier
                          </button>
                        ) : null}
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
