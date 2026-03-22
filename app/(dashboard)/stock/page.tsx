"use client"

import { useMemo, useState } from "react"
import Link from "next/link"

import type {
  FeedMovementSummary,
  FeedStockSummary,
  MedicineStockSummary,
} from "@/src/actions/stock"
import {
  formatDate,
  formatMoneyFCFA,
  formatNumber,
} from "@/src/lib/formatters"

type Props = {
  organizationId: string
  initialFeedStocks: FeedStockSummary[]
  initialFeedMovements: FeedMovementSummary[]
  initialMedicineStocks: MedicineStockSummary[]
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
  initialFeedStocks,
  initialFeedMovements,
  initialMedicineStocks,
}: Props) {
  const [tab, setTab] = useState<StockTab>("ALIMENT")
  const [search, setSearch] = useState("")
  const [feedFilter, setFeedFilter] = useState<"ALL" | "ALERT">("ALL")
  const [medicineFilter, setMedicineFilter] = useState<"ALL" | "ALERT">("ALL")

  const normalizedSearch = search.trim().toLowerCase()

  const filteredFeedStocks = useMemo(() => {
    return initialFeedStocks.filter((stock) => {
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
  }, [initialFeedStocks, normalizedSearch, feedFilter])

  const filteredMedicineStocks = useMemo(() => {
    return initialMedicineStocks.filter((stock) => {
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
  }, [initialMedicineStocks, normalizedSearch, medicineFilter])

  const totalFeedKg = initialFeedStocks.reduce((sum, s) => sum + s.quantityKg, 0)
  const totalFeedValue = initialFeedStocks.reduce(
    (sum, s) => sum + Math.round(s.quantityKg * s.unitPriceFcfa),
    0
  )
  const feedAlertCount = initialFeedStocks.filter((s) => s.isBelowAlert).length

  const totalMedicineItems = initialMedicineStocks.length
  const medicineAlertCount = initialMedicineStocks.filter(
    (s) => s.isBelowAlert || s.isExpiringSoon
  ).length
  const expiringSoonCount = initialMedicineStocks.filter(
    (s) => s.isExpiringSoon
  ).length

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
                      </div>

                      <div className="shrink-0">
                        <Link
                          href={`/finances`}
                          className="inline-flex rounded-xl bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
                        >
                          Voir finances
                        </Link>
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
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}