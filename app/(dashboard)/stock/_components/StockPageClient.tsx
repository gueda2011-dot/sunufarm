"use client"

import { useMemo, useState } from "react"
import {
  getFeedMovements,
  getFeedStocks,
  getMedicineMovements,
  getMedicineStocks,
  type FeedMovementSummary,
  type FeedStockSummary,
  type MedicineMovementSummary,
  type MedicineStockSummary,
} from "@/src/actions/stock"
import {
  formatDate,
  formatMoneyFCFA,
  formatNumber,
} from "@/src/lib/formatters"
import {
  extractMovementSourceFromNotes,
  getStockMovementSourceLabel,
  stripMovementSourceFromNotes,
} from "@/src/lib/stock-movement-conventions"
import { StockMovementForm } from "./StockMovementForm"

type Props = {
  organizationId: string
  initialFeedStocks: FeedStockSummary[]
  initialFeedMovements: FeedMovementSummary[]
  initialMedicineStocks: MedicineStockSummary[]
  initialMedicineMovements: MedicineMovementSummary[]
}

type StockTab = "ALIMENT" | "MEDICAMENT"

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ")
}

function getMovementLabel(type: string) {
  switch (type) {
    case "ENTREE":
      return "Entree"
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

function getMovementBadgeClass(type: string) {
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
  if (stock.isBelowAlert && stock.isExpiringSoon) return "Stock bas + peremption proche"
  if (stock.isBelowAlert) return "Stock bas"
  if (stock.isExpiringSoon) return "Peremption proche"
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
  initialFeedStocks,
  initialFeedMovements,
  initialMedicineStocks,
  initialMedicineMovements,
}: Props) {
  const [feedStocks, setFeedStocks] = useState(initialFeedStocks)
  const [feedMovements, setFeedMovements] = useState(initialFeedMovements)
  const [medicineStocks, setMedicineStocks] = useState(initialMedicineStocks)
  const [medicineMovements, setMedicineMovements] = useState(
    initialMedicineMovements,
  )
  const [tab, setTab] = useState<StockTab>("ALIMENT")
  const [search, setSearch] = useState("")
  const [feedFilter, setFeedFilter] = useState<"ALL" | "ALERT">("ALL")
  const [medicineFilter, setMedicineFilter] = useState<"ALL" | "ALERT">("ALL")

  const normalizedSearch = search.trim().toLowerCase()

  const filteredFeedStocks = useMemo(() => {
    return feedStocks.filter((stock) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        stock.name.toLowerCase().includes(normalizedSearch) ||
        stock.feedType.name.toLowerCase().includes(normalizedSearch) ||
        stock.feedType.code.toLowerCase().includes(normalizedSearch) ||
        (stock.supplierName ?? "").toLowerCase().includes(normalizedSearch)

      const matchesFilter = feedFilter === "ALL" ? true : stock.isBelowAlert

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

  const totalFeedKg = feedStocks.reduce((sum, stock) => sum + stock.quantityKg, 0)
  const totalFeedValue = feedStocks.reduce(
    (sum, stock) => sum + Math.round(stock.quantityKg * stock.unitPriceFcfa),
    0,
  )
  const feedAlertCount = feedStocks.filter((stock) => stock.isBelowAlert).length

  const totalMedicineItems = medicineStocks.length
  const medicineAlertCount = medicineStocks.filter(
    (stock) => stock.isBelowAlert || stock.isExpiringSoon,
  ).length
  const expiringSoonCount = medicineStocks.filter(
    (stock) => stock.isExpiringSoon,
  ).length

  const feedStockOptions = useMemo(
    () =>
      feedStocks.map((stock) => ({
        id: stock.id,
        label: `${stock.name} - ${stock.feedType.name}`,
        availableQuantity: stock.quantityKg,
        unit: "kg",
      })),
    [feedStocks],
  )

  const medicineStockOptions = useMemo(
    () =>
      medicineStocks.map((stock) => ({
        id: stock.id,
        label: stock.category ? `${stock.name} - ${stock.category}` : stock.name,
        availableQuantity: stock.quantityOnHand,
        unit: stock.unit,
      })),
    [medicineStocks],
  )

  const medicineUnitsById = useMemo(
    () =>
      Object.fromEntries(medicineStocks.map((stock) => [stock.id, stock.unit])),
    [medicineStocks],
  )

  async function refreshStockData() {
    const [
      nextFeedStocks,
      nextFeedMovements,
      nextMedicineStocks,
      nextMedicineMovements,
    ] = await Promise.all([
      getFeedStocks({ organizationId }),
      getFeedMovements({ organizationId, limit: 20 }),
      getMedicineStocks({ organizationId }),
      getMedicineMovements({ organizationId, limit: 20 }),
    ])

    if (nextFeedStocks.success) setFeedStocks(nextFeedStocks.data)
    if (nextFeedMovements.success) setFeedMovements(nextFeedMovements.data)
    if (nextMedicineStocks.success) setMedicineStocks(nextMedicineStocks.data)
    if (nextMedicineMovements.success) {
      setMedicineMovements(nextMedicineMovements.data)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTab("ALIMENT")}
          className={cn(
            "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
            tab === "ALIMENT"
              ? "bg-green-600 text-white"
              : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50",
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
              : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50",
          )}
        >
          Medicaments
        </button>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="w-full md:max-w-md">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                tab === "ALIMENT"
                  ? "Rechercher un aliment, type ou fournisseur..."
                  : "Rechercher un medicament, categorie ou unite..."
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
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200",
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
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200",
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
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200",
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
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200",
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
          <StockMovementForm
            domain="ALIMENT"
            organizationId={organizationId}
            stockOptions={feedStockOptions}
            onCreated={refreshStockData}
          />

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <p className="text-sm text-gray-500">Stock total aliment</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {formatNumber(Math.round(totalFeedKg))} kg
              </p>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <p className="text-sm text-gray-500">Valeur estimee</p>
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
                Stocks aliment
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Quantite disponible, seuil dalerte et valorisation estimee.
              </p>
            </div>

            {filteredFeedStocks.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-gray-500">Aucun stock trouve.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredFeedStocks.map((stock) => {
                  const estimatedValue = Math.round(
                    stock.quantityKg * stock.unitPriceFcfa,
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
                                : "bg-green-100 text-green-700",
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
                            <span className="text-gray-400">Quantite :</span>{" "}
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
                Derniers mouvements aliment
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Historique recent des entrees, sorties, inventaires et ajustements.
              </p>
            </div>

            {feedMovements.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-gray-500">
                  Aucun mouvement enregistre. Creez une entree, une sortie, un ajustement ou un inventaire pour demarrer.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Article</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Source</th>
                      <th className="px-4 py-3 font-medium">Quantite</th>
                      <th className="px-4 py-3 font-medium">Montant</th>
                      <th className="px-4 py-3 font-medium">Notes</th>
                      <th className="px-4 py-3 font-medium">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {feedMovements.map((movement) => (
                      <tr key={movement.id} className="text-gray-700">
                        <td className="px-4 py-3">{formatDate(movement.date)}</td>
                        <td className="px-4 py-3 font-medium">
                          {movement.feedStock.name}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-medium",
                              getMovementBadgeClass(movement.type),
                            )}
                          >
                            {getMovementLabel(movement.type)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {getStockMovementSourceLabel(
                            extractMovementSourceFromNotes(movement.notes) ?? "MANUEL",
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {formatNumber(movement.quantityKg)} kg
                        </td>
                        <td className="px-4 py-3">
                          {formatMoneyFCFA(movement.totalFcfa)}
                        </td>
                        <td className="px-4 py-3">
                          {stripMovementSourceFromNotes(movement.notes) || "—"}
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
          <StockMovementForm
            domain="MEDICAMENT"
            organizationId={organizationId}
            stockOptions={medicineStockOptions}
            onCreated={refreshStockData}
          />

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <p className="text-sm text-gray-500">Articles medicament</p>
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
              <p className="text-sm text-gray-500">Peremption proche</p>
              <p className="mt-1 text-2xl font-bold text-yellow-600">
                {formatNumber(expiringSoonCount)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
            <div className="border-b border-gray-100 px-4 py-4">
              <h2 className="text-base font-semibold text-gray-900">
                Stocks de medicaments
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Suivi des quantites disponibles, alertes et dates de peremption.
              </p>
            </div>

            {filteredMedicineStocks.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-gray-500">Aucun article trouve.</p>
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
                            getMedicineAlertClass(stock),
                          )}
                        >
                          {getMedicineAlertLabel(stock)}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2 text-sm text-gray-600 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <span className="text-gray-400">Quantite :</span>{" "}
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
                          <span className="text-gray-400">Peremption :</span>{" "}
                          <span className="font-medium text-gray-900">
                            {formatDate(stock.expiryDate)}
                          </span>
                        </div>
                      </div>

                      {stock.notes ? (
                        <p className="mt-3 text-sm text-gray-500">{stock.notes}</p>
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
                Derniers mouvements de medicament
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Historique recent des entrees, sorties et inventaires.
              </p>
            </div>

            {medicineMovements.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-gray-500">
                  Aucun mouvement enregistre. Creez un mouvement pour alimenter lhistorique.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Article</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Source</th>
                      <th className="px-4 py-3 font-medium">Quantite</th>
                      <th className="px-4 py-3 font-medium">Montant</th>
                      <th className="px-4 py-3 font-medium">Notes</th>
                      <th className="px-4 py-3 font-medium">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {medicineMovements.map((movement) => (
                      <tr key={movement.id} className="text-gray-700">
                        <td className="px-4 py-3">{formatDate(movement.date)}</td>
                        <td className="px-4 py-3 font-medium">
                          {movement.medicineStock.name}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-medium",
                              getMovementBadgeClass(movement.type),
                            )}
                          >
                            {getMovementLabel(movement.type)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {getStockMovementSourceLabel(
                            extractMovementSourceFromNotes(movement.notes) ?? "MANUEL",
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {formatNumber(movement.quantity)}{" "}
                          {medicineUnitsById[movement.medicineStockId] ?? ""}
                        </td>
                        <td className="px-4 py-3">
                          {formatMoneyFCFA(movement.totalFcfa)}
                        </td>
                        <td className="px-4 py-3">
                          {stripMovementSourceFromNotes(movement.notes) || "—"}
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
      )}
    </div>
  )
}
