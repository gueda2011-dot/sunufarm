"use client"

import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import type {
  FeedMovementSummary,
  FeedStockSummary,
  MedicineMovementSummary,
  MedicineStockSummary,
} from "@/src/actions/stock"
import {
  createFeedStock,
  createMedicineStock,
  deleteFeedStock,
  deleteMedicineStock,
} from "@/src/actions/stock"
import {
  formatDate,
  formatMoneyFCFA,
  formatNumber,
} from "@/src/lib/formatters"
import { StockMovementPanel } from "./StockMovementPanel"

type Props = {
  organizationId: string
  canCreateStock: boolean
  canCreateMovement: boolean
  farms: Array<{ id: string; name: string }>
  batches: Array<{ id: string; number: string }>
  feedTypes: Array<{ id: string; name: string; code: string }>
  initialFeedStocks: FeedStockSummary[]
  initialFeedMovements: FeedMovementSummary[]
  initialMedicineStocks: MedicineStockSummary[]
  initialMedicineMovements: MedicineMovementSummary[]
}

type StockTab = "ALIMENT" | "MEDICAMENT"

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ")
}

function getFeedMovementLabel(type: string) {
  switch (type) {
    case "ENTREE":
      return "Entrée"
    case "SORTIE":
      return "Sortie"
    case "INVENTAIRE":
      return "Inventaire"
    case "AJUSTEMENT":
      return "Ajustement"
    default:
      return type
  }
}

function getFeedMovementBadgeClass(type: string) {
  switch (type) {
    case "ENTREE":
      return "bg-green-100 text-green-700"
    case "SORTIE":
      return "bg-red-100 text-red-700"
    case "INVENTAIRE":
      return "bg-blue-100 text-blue-700"
    case "AJUSTEMENT":
      return "bg-orange-100 text-orange-700"
    default:
      return "bg-gray-100 text-gray-700"
  }
}

function getMedicineAlertLabel(stock: MedicineStockSummary) {
  if (stock.isBelowAlert && stock.isExpiringSoon) return "Stock bas + péremption proche"
  if (stock.isBelowAlert) return "Stock bas"
  if (stock.isExpiringSoon) return "Péremption proche"
  return "OK"
}

function getMedicineAlertClass(stock: MedicineStockSummary) {
  if (stock.isBelowAlert && stock.isExpiringSoon) return "bg-red-100 text-red-700"
  if (stock.isBelowAlert) return "bg-orange-100 text-orange-700"
  if (stock.isExpiringSoon) return "bg-yellow-100 text-yellow-700"
  return "bg-green-100 text-green-700"
}

export function StockPageClient({
  organizationId,
  canCreateStock,
  canCreateMovement,
  farms,
  batches,
  feedTypes,
  initialFeedStocks,
  initialFeedMovements,
  initialMedicineStocks,
  initialMedicineMovements,
}: Props) {
  const [tab, setTab] = useState<StockTab>("ALIMENT")
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState("")
  const [feedFilter, setFeedFilter] = useState<"ALL" | "ALERT">("ALL")
  const [medicineFilter, setMedicineFilter] = useState<"ALL" | "ALERT">("ALL")
  const [feedStocks, setFeedStocks] = useState(initialFeedStocks)
  const [medicineStocks, setMedicineStocks] = useState(initialMedicineStocks)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [feedFarmId, setFeedFarmId] = useState("")
  const [feedTypeId, setFeedTypeId] = useState("")
  const [feedName, setFeedName] = useState("")
  const [feedSupplierName, setFeedSupplierName] = useState("")
  const [feedUnitPriceFcfa, setFeedUnitPriceFcfa] = useState("")
  const [feedAlertThresholdKg, setFeedAlertThresholdKg] = useState("")

  const [medicineFarmId, setMedicineFarmId] = useState("")
  const [medicineName, setMedicineName] = useState("")
  const [medicineCategory, setMedicineCategory] = useState("")
  const [medicineUnit, setMedicineUnit] = useState("boite")
  const [medicineUnitPriceFcfa, setMedicineUnitPriceFcfa] = useState("")
  const [medicineAlertThreshold, setMedicineAlertThreshold] = useState("")
  const [medicineExpiryDate, setMedicineExpiryDate] = useState("")
  const [medicineNotes, setMedicineNotes] = useState("")

  const normalizedSearch = search.trim().toLowerCase()

  const filteredFeedStocks = useMemo(() => {
    return feedStocks.filter((stock) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        stock.name.toLowerCase().includes(normalizedSearch) ||
        stock.feedType.name.toLowerCase().includes(normalizedSearch) ||
        stock.feedType.code.toLowerCase().includes(normalizedSearch) ||
        (stock.supplierName ?? "").toLowerCase().includes(normalizedSearch)

      const matchesFilter =
        feedFilter === "ALL" ? true : stock.isBelowAlert

      return matchesSearch && matchesFilter
    })
  }, [feedStocks, normalizedSearch, feedFilter])

  const filteredMedicineStocks = useMemo(() => {
    return medicineStocks.filter((stock) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        stock.name.toLowerCase().includes(normalizedSearch) ||
        (stock.category ?? "").toLowerCase().includes(normalizedSearch) ||
        stock.unit.toLowerCase().includes(normalizedSearch)

      const matchesFilter =
        medicineFilter === "ALL"
          ? true
          : stock.isBelowAlert || stock.isExpiringSoon

      return matchesSearch && matchesFilter
    })
  }, [medicineStocks, normalizedSearch, medicineFilter])

  const totalFeedKg = feedStocks.reduce((sum, s) => sum + s.quantityKg, 0)
  const totalFeedValue = feedStocks.reduce(
    (sum, s) => sum + Math.round(s.quantityKg * s.unitPriceFcfa),
    0
  )
  const feedAlertCount = feedStocks.filter((s) => s.isBelowAlert).length

  const totalMedicineItems = medicineStocks.length
  const medicineAlertCount = medicineStocks.filter(
    (s) => s.isBelowAlert || s.isExpiringSoon
  ).length
  const expiringSoonCount = medicineStocks.filter(
    (s) => s.isExpiringSoon
  ).length

  function resetCreateForm() {
    setFormError(null)
    setFeedFarmId("")
    setFeedTypeId("")
    setFeedName("")
    setFeedSupplierName("")
    setFeedUnitPriceFcfa("")
    setFeedAlertThresholdKg("")
    setMedicineFarmId("")
    setMedicineName("")
    setMedicineCategory("")
    setMedicineUnit("boite")
    setMedicineUnitPriceFcfa("")
    setMedicineAlertThreshold("")
    setMedicineExpiryDate("")
    setMedicineNotes("")
  }

  function toggleCreateForm() {
    if (showCreateForm) {
      resetCreateForm()
      setShowCreateForm(false)
      return
    }

    setFormError(null)
    setShowCreateForm(true)
  }

  function handleCreateFeedStock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    startTransition(async () => {
      const result = await createFeedStock({
        organizationId,
        farmId: feedFarmId,
        feedTypeId,
        name: feedName,
        supplierName: feedSupplierName || undefined,
        unitPriceFcfa: feedUnitPriceFcfa ? Number.parseInt(feedUnitPriceFcfa, 10) : undefined,
        alertThresholdKg: feedAlertThresholdKg ? Number.parseFloat(feedAlertThresholdKg) : undefined,
      })

      if (!result.success) {
        setFormError(result.error)
        return
      }

      setFeedStocks((current) => [...current, result.data].sort((a, b) => a.name.localeCompare(b.name)))
      resetCreateForm()
      setShowCreateForm(false)
    })
  }

  function handleCreateMedicineStock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    startTransition(async () => {
      const result = await createMedicineStock({
        organizationId,
        farmId: medicineFarmId,
        name: medicineName,
        category: medicineCategory || undefined,
        unit: medicineUnit,
        unitPriceFcfa: medicineUnitPriceFcfa ? Number.parseInt(medicineUnitPriceFcfa, 10) : undefined,
        alertThreshold: medicineAlertThreshold ? Number.parseFloat(medicineAlertThreshold) : undefined,
        expiryDate: medicineExpiryDate ? new Date(medicineExpiryDate) : undefined,
        notes: medicineNotes || undefined,
      })

      if (!result.success) {
        setFormError(result.error)
        return
      }

      setMedicineStocks((current) => [...current, result.data].sort((a, b) => a.name.localeCompare(b.name)))
      resetCreateForm()
      setShowCreateForm(false)
    })
  }

  function handleDeleteFeedStock(stockId: string) {
    if (typeof window !== "undefined" && !window.confirm("Supprimer ce stock vide ?")) {
      return
    }

    startTransition(async () => {
      const result = await deleteFeedStock({ organizationId, feedStockId: stockId })
      if (!result.success) {
        toast.error(result.error)
        return
      }

      setFeedStocks((current) => current.filter((stock) => stock.id !== stockId))
      toast.success("Stock aliment supprimé")
    })
  }

  function handleDeleteMedicineStock(stockId: string) {
    if (typeof window !== "undefined" && !window.confirm("Supprimer ce stock vide ?")) {
      return
    }

    startTransition(async () => {
      const result = await deleteMedicineStock({ organizationId, medicineStockId: stockId })
      if (!result.success) {
        toast.error(result.error)
        return
      }

      setMedicineStocks((current) => current.filter((stock) => stock.id !== stockId))
      toast.success("Stock médicament supprimé")
    })
  }

  return (
    <div className="space-y-5">
      {canCreateStock ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={toggleCreateForm}
            className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700"
          >
            {showCreateForm
              ? "Fermer le formulaire"
              : tab === "ALIMENT"
                ? "Nouvel article aliment"
                : "Nouvel article medicament"}
          </button>
        </div>
      ) : null}

      {showCreateForm ? (
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          {tab === "ALIMENT" ? (
            <form onSubmit={handleCreateFeedStock} className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Creer un article de stock aliment</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Cree d&apos;abord le stock cible, puis tu pourras y envoyer les achats fournisseur.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Ferme</label>
                  <select
                    required
                    value={feedFarmId}
                    onChange={(e) => setFeedFarmId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  >
                    <option value="">Selectionner</option>
                    {farms.map((farm) => (
                      <option key={farm.id} value={farm.id}>{farm.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Type d&apos;aliment</label>
                  <select
                    required
                    value={feedTypeId}
                    onChange={(e) => setFeedTypeId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  >
                    <option value="">Selectionner</option>
                    {feedTypes.map((feedType) => (
                      <option key={feedType.id} value={feedType.id}>{feedType.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Nom de l&apos;article</label>
                  <input
                    required
                    value={feedName}
                    onChange={(e) => setFeedName(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Fournisseur</label>
                  <input
                    value={feedSupplierName}
                    onChange={(e) => setFeedSupplierName(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Prix unitaire</label>
                  <input
                    type="number"
                    min="0"
                    value={feedUnitPriceFcfa}
                    onChange={(e) => setFeedUnitPriceFcfa(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Seuil d&apos;alerte (kg)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={feedAlertThresholdKg}
                    onChange={(e) => setFeedAlertThresholdKg(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  />
                </div>
              </div>

              {formError ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div> : null}

              <button
                type="submit"
                disabled={isPending}
                className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
              >
                {isPending ? "Creation..." : "Creer l'article"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleCreateMedicineStock} className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Creer un article de stock medicament</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Cet article servira de destination pour les achats et les futurs mouvements.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Ferme</label>
                  <select
                    required
                    value={medicineFarmId}
                    onChange={(e) => setMedicineFarmId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  >
                    <option value="">Selectionner</option>
                    {farms.map((farm) => (
                      <option key={farm.id} value={farm.id}>{farm.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Nom</label>
                  <input
                    required
                    value={medicineName}
                    onChange={(e) => setMedicineName(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Categorie</label>
                  <input
                    value={medicineCategory}
                    onChange={(e) => setMedicineCategory(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Unite</label>
                  <input
                    required
                    value={medicineUnit}
                    onChange={(e) => setMedicineUnit(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Prix unitaire</label>
                  <input
                    type="number"
                    min="0"
                    value={medicineUnitPriceFcfa}
                    onChange={(e) => setMedicineUnitPriceFcfa(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Seuil d&apos;alerte</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={medicineAlertThreshold}
                    onChange={(e) => setMedicineAlertThreshold(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Date de peremption</label>
                  <input
                    type="date"
                    value={medicineExpiryDate}
                    onChange={(e) => setMedicineExpiryDate(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Notes</label>
                <textarea
                  rows={3}
                  value={medicineNotes}
                  onChange={(e) => setMedicineNotes(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-green-500"
                />
              </div>

              {formError ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div> : null}

              <button
                type="submit"
                disabled={isPending}
                className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
              >
                {isPending ? "Creation..." : "Creer l'article"}
              </button>
            </form>
          )}
        </div>
      ) : null}

      <StockMovementPanel
        organizationId={organizationId}
        tab={tab}
        canCreateMovement={canCreateMovement}
        feedStocks={feedStocks}
        medicineStocks={medicineStocks}
        batches={batches}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTab("ALIMENT")}
          className={cn(
            "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
            tab === "ALIMENT"
              ? "bg-green-600 text-white"
              : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
          )}
        >
          Aliments
        </button>

        <button
          type="button"
          onClick={() => setTab("MEDICAMENT")}
          className={cn(
            "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
            tab === "MEDICAMENT"
              ? "bg-green-600 text-white"
              : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
          )}
        >
          Médicaments
        </button>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="w-full md:max-w-md">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                tab === "ALIMENT"
                  ? "Rechercher un aliment, type ou fournisseur..."
                  : "Rechercher un médicament, catégorie ou unité..."
              }
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-green-500"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {tab === "ALIMENT" ? (
              <>
                <button
                  type="button"
                  onClick={() => setFeedFilter("ALL")}
                  className={cn(
                    "rounded-xl px-3 py-2 text-sm font-medium",
                    feedFilter === "ALL"
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  )}
                >
                  Tous
                </button>
                <button
                  type="button"
                  onClick={() => setFeedFilter("ALERT")}
                  className={cn(
                    "rounded-xl px-3 py-2 text-sm font-medium",
                    feedFilter === "ALERT"
                      ? "bg-orange-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  )}
                >
                  Stock bas
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setMedicineFilter("ALL")}
                  className={cn(
                    "rounded-xl px-3 py-2 text-sm font-medium",
                    medicineFilter === "ALL"
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  )}
                >
                  Tous
                </button>
                <button
                  type="button"
                  onClick={() => setMedicineFilter("ALERT")}
                  className={cn(
                    "rounded-xl px-3 py-2 text-sm font-medium",
                    medicineFilter === "ALERT"
                      ? "bg-orange-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  )}
                >
                  Alertes
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {tab === "ALIMENT" ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <p className="text-sm text-gray-500">Stock total aliment</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {formatNumber(Math.round(totalFeedKg))} kg
              </p>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <p className="text-sm text-gray-500">Valeur estimée</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {formatMoneyFCFA(totalFeedValue)}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <p className="text-sm text-gray-500">Articles en alerte</p>
              <p className="mt-1 text-2xl font-bold text-orange-600">
                {formatNumber(feedAlertCount)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
            <div className="border-b border-gray-100 px-4 py-4">
              <h2 className="text-base font-semibold text-gray-900">
                Stocks d’aliment
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Quantité disponible, seuil d’alerte et valorisation estimée.
              </p>
            </div>

            {filteredFeedStocks.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-gray-500">Aucun stock trouvé.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredFeedStocks.map((stock) => {
                  const estimatedValue = Math.round(
                    stock.quantityKg * stock.unitPriceFcfa
                  )

                  return (
                    <div
                      key={stock.id}
                      className="flex flex-col gap-4 px-4 py-4 md:flex-row md:items-start md:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-gray-900">
                            {stock.name}
                          </h3>
                          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                            {stock.feedType.name}
                          </span>
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-medium",
                              stock.isBelowAlert
                                ? "bg-orange-100 text-orange-700"
                                : "bg-green-100 text-green-700"
                            )}
                          >
                            {stock.isBelowAlert ? "Stock bas" : "OK"}
                          </span>
                        </div>

                        <p className="mt-1 text-sm text-gray-500">
                          Fournisseur : {stock.supplierName || "—"}
                        </p>

                        <div className="mt-3 grid gap-2 text-sm text-gray-600 sm:grid-cols-2 lg:grid-cols-4">
                          <div>
                            <span className="text-gray-400">Quantité :</span>{" "}
                            <span className="font-medium text-gray-900">
                              {formatNumber(stock.quantityKg)} kg
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400">Seuil :</span>{" "}
                            <span className="font-medium text-gray-900">
                              {formatNumber(stock.alertThresholdKg)} kg
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400">PU :</span>{" "}
                            <span className="font-medium text-gray-900">
                              {formatMoneyFCFA(stock.unitPriceFcfa)}
                            </span>
                          </div>
                        <div>
                          <span className="text-gray-400">Valeur :</span>{" "}
                          <span className="font-medium text-gray-900">
                            {formatMoneyFCFA(estimatedValue)}
                          </span>
                        </div>
                      </div>

                      {canCreateStock && stock.quantityKg === 0 ? (
                        <div className="mt-4">
                          <button
                            type="button"
                            onClick={() => handleDeleteFeedStock(stock.id)}
                            className="rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
                          >
                            Supprimer ce stock vide
                          </button>
                        </div>
                      ) : null}
                      </div>

                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
            <div className="border-b border-gray-100 px-4 py-4">
              <h2 className="text-base font-semibold text-gray-900">
                Derniers mouvements d’aliment
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Historique récent des entrées, sorties, inventaires et ajustements.
              </p>
            </div>

            {initialFeedMovements.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-gray-500">Aucun mouvement enregistré.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Article</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Quantité</th>
                      <th className="px-4 py-3 font-medium">Montant</th>
                      <th className="px-4 py-3 font-medium">Référence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {initialFeedMovements.map((movement) => (
                      <tr key={movement.id} className="text-gray-700">
                        <td className="px-4 py-3">{formatDate(movement.date)}</td>
                        <td className="px-4 py-3 font-medium">
                          {movement.feedStock.name}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-medium",
                              getFeedMovementBadgeClass(movement.type)
                            )}
                          >
                            {getFeedMovementLabel(movement.type)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {formatNumber(movement.quantityKg)} kg
                        </td>
                        <td className="px-4 py-3">
                          {formatMoneyFCFA(movement.totalFcfa)}
                        </td>
                        <td className="px-4 py-3">{movement.reference || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <p className="text-sm text-gray-500">Articles médicament</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {formatNumber(totalMedicineItems)}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <p className="text-sm text-gray-500">Articles en alerte</p>
              <p className="mt-1 text-2xl font-bold text-orange-600">
                {formatNumber(medicineAlertCount)}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <p className="text-sm text-gray-500">Péremption proche</p>
              <p className="mt-1 text-2xl font-bold text-yellow-600">
                {formatNumber(expiringSoonCount)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
            <div className="border-b border-gray-100 px-4 py-4">
              <h2 className="text-base font-semibold text-gray-900">
                Stocks de médicaments
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Suivi des quantités disponibles, alertes et dates de péremption.
              </p>
            </div>

            {filteredMedicineStocks.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-gray-500">Aucun article trouvé.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredMedicineStocks.map((stock) => (
                  <div
                    key={stock.id}
                    className="flex flex-col gap-4 px-4 py-4 md:flex-row md:items-start md:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-gray-900">
                          {stock.name}
                        </h3>

                        {stock.category ? (
                          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                            {stock.category}
                          </span>
                        ) : null}

                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-medium",
                            getMedicineAlertClass(stock)
                          )}
                        >
                          {getMedicineAlertLabel(stock)}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2 text-sm text-gray-600 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <span className="text-gray-400">Quantité :</span>{" "}
                          <span className="font-medium text-gray-900">
                            {formatNumber(stock.quantityOnHand)} {stock.unit}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">Seuil :</span>{" "}
                          <span className="font-medium text-gray-900">
                            {formatNumber(stock.alertThreshold)} {stock.unit}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">PU :</span>{" "}
                          <span className="font-medium text-gray-900">
                            {formatMoneyFCFA(stock.unitPriceFcfa)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">Péremption :</span>{" "}
                          <span className="font-medium text-gray-900">
                            {formatDate(stock.expiryDate)}
                          </span>
                        </div>
                      </div>

                      {stock.notes ? (
                        <p className="mt-3 text-sm text-gray-500">{stock.notes}</p>
                      ) : null}

                      {canCreateStock && stock.quantityOnHand === 0 ? (
                        <div className="mt-4">
                          <button
                            type="button"
                            onClick={() => handleDeleteMedicineStock(stock.id)}
                            className="rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
                          >
                            Supprimer ce stock vide
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
            <div className="border-b border-gray-100 px-4 py-4">
              <h2 className="text-base font-semibold text-gray-900">
                Derniers mouvements de medicaments
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Historique recent des entrees, sorties, peremptions et inventaires.
              </p>
            </div>

            {initialMedicineMovements.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-gray-500">Aucun mouvement enregistre.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Article</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Quantite</th>
                      <th className="px-4 py-3 font-medium">Montant</th>
                      <th className="px-4 py-3 font-medium">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {initialMedicineMovements.map((movement) => (
                      <tr key={movement.id} className="text-gray-700">
                        <td className="px-4 py-3">{formatDate(movement.date)}</td>
                        <td className="px-4 py-3 font-medium">
                          {movement.medicineStock.name}
                        </td>
                        <td className="px-4 py-3">{movement.type}</td>
                        <td className="px-4 py-3">{formatNumber(movement.quantity)}</td>
                        <td className="px-4 py-3">{formatMoneyFCFA(movement.totalFcfa)}</td>
                        <td className="px-4 py-3">{movement.reference || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
