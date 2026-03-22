"use client"

import { useMemo, useState } from "react"
import Link from "next/link"

import type { SaleSummary } from "@/src/actions/sales"
import {
  formatDate,
  formatMoneyFCFA,
  formatNumber,
} from "@/src/lib/formatters"

type Props = {
  initialSales: SaleSummary[]
}

type ProductFilter = "ALL" | "POULET_VIF" | "OEUF" | "FIENTE"
type PaymentFilter = "ALL" | "PAID" | "PARTIAL" | "UNPAID"

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ")
}

function getProductLabel(productType: string) {
  switch (productType) {
    case "POULET_VIF":
      return "Poulet vif"
    case "OEUF":
      return "Œuf"
    case "FIENTE":
      return "Fiente"
    default:
      return productType
  }
}

function getProductBadgeClass(productType: string) {
  switch (productType) {
    case "POULET_VIF":
      return "bg-orange-100 text-orange-700"
    case "OEUF":
      return "bg-yellow-100 text-yellow-700"
    case "FIENTE":
      return "bg-emerald-100 text-emerald-700"
    default:
      return "bg-gray-100 text-gray-700"
  }
}

function getPaymentStatusLabel(totalFcfa: number, paidFcfa: number) {
  if (paidFcfa <= 0) return "Non payé"
  if (paidFcfa >= totalFcfa) return "Payé"
  return "Partiel"
}

function getPaymentStatusClass(totalFcfa: number, paidFcfa: number) {
  if (paidFcfa <= 0) return "bg-red-100 text-red-700"
  if (paidFcfa >= totalFcfa) return "bg-green-100 text-green-700"
  return "bg-orange-100 text-orange-700"
}

export function SalesPageClient({ initialSales }: Props) {
  const [search, setSearch] = useState("")
  const [productFilter, setProductFilter] = useState<ProductFilter>("ALL")
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("ALL")

  const normalizedSearch = search.trim().toLowerCase()

  const filteredSales = useMemo(() => {
    return initialSales.filter((sale) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        sale.customer?.name.toLowerCase().includes(normalizedSearch) ||
        sale.items.some((item) =>
          item.description.toLowerCase().includes(normalizedSearch)
        ) ||
        getProductLabel(sale.productType).toLowerCase().includes(normalizedSearch)

      const matchesProduct =
        productFilter === "ALL" ? true : sale.productType === productFilter

      const matchesPayment =
        paymentFilter === "ALL"
          ? true
          : paymentFilter === "PAID"
          ? sale.paidFcfa >= sale.totalFcfa && sale.totalFcfa > 0
          : paymentFilter === "PARTIAL"
          ? sale.paidFcfa > 0 && sale.paidFcfa < sale.totalFcfa
          : sale.paidFcfa <= 0

      return matchesSearch && matchesProduct && matchesPayment
    })
  }, [initialSales, normalizedSearch, productFilter, paymentFilter])

  const totalRevenue = filteredSales.reduce((sum, sale) => sum + sale.totalFcfa, 0)
  const totalPaid = filteredSales.reduce((sum, sale) => sum + sale.paidFcfa, 0)
  const totalDue = filteredSales.reduce(
    (sum, sale) => sum + Math.max(sale.totalFcfa - sale.paidFcfa, 0),
    0
  )

  const paidCount = filteredSales.filter(
    (sale) => sale.totalFcfa > 0 && sale.paidFcfa >= sale.totalFcfa
  ).length

  const partialCount = filteredSales.filter(
    (sale) => sale.paidFcfa > 0 && sale.paidFcfa < sale.totalFcfa
  ).length

  const unpaidCount = filteredSales.filter((sale) => sale.paidFcfa <= 0).length

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 md:flex-row md:items-center md:justify-between">
        <div className="w-full md:max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un client, un produit ou une ligne..."
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-green-500"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/finances"
            className="inline-flex rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
          >
            Voir finances
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-sm text-gray-500">Chiffre d’affaires</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {formatMoneyFCFA(totalRevenue)}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-sm text-gray-500">Montant encaissé</p>
          <p className="mt-1 text-2xl font-bold text-green-700">
            {formatMoneyFCFA(totalPaid)}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-sm text-gray-500">Restant dû</p>
          <p className="mt-1 text-2xl font-bold text-orange-600">
            {formatMoneyFCFA(totalDue)}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-sm text-gray-500">Nombre de ventes</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {formatNumber(filteredSales.length)}
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {(["ALL", "POULET_VIF", "OEUF", "FIENTE"] as ProductFilter[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setProductFilter(value)}
                className={cn(
                  "rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  productFilter === value
                    ? "bg-green-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                )}
              >
                {value === "ALL" ? "Tous produits" : getProductLabel(value)}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                ["ALL", "Tous paiements"],
                ["PAID", "Payés"],
                ["PARTIAL", "Partiels"],
                ["UNPAID", "Non payés"],
              ] as Array<[PaymentFilter, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPaymentFilter(value)}
                className={cn(
                  "rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  paymentFilter === value
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-green-50 p-3">
            <p className="text-sm text-green-700">Ventes payées</p>
            <p className="mt-1 text-lg font-semibold text-green-800">
              {formatNumber(paidCount)}
            </p>
          </div>

          <div className="rounded-xl bg-orange-50 p-3">
            <p className="text-sm text-orange-700">Ventes partielles</p>
            <p className="mt-1 text-lg font-semibold text-orange-800">
              {formatNumber(partialCount)}
            </p>
          </div>

          <div className="rounded-xl bg-red-50 p-3">
            <p className="text-sm text-red-700">Ventes non payées</p>
            <p className="mt-1 text-lg font-semibold text-red-800">
              {formatNumber(unpaidCount)}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
        <div className="border-b border-gray-100 px-4 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            Liste des ventes
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Détail des ventes, lignes, montants encaissés et restant dû.
          </p>
        </div>

        {filteredSales.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-gray-500">Aucune vente trouvée.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredSales.map((sale) => {
              const remaining = Math.max(sale.totalFcfa - sale.paidFcfa, 0)

              return (
                <div
                  key={sale.id}
                  className="flex flex-col gap-4 px-4 py-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">
                          {formatDate(sale.saleDate)}
                        </span>

                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-medium",
                            getProductBadgeClass(sale.productType)
                          )}
                        >
                          {getProductLabel(sale.productType)}
                        </span>

                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-medium",
                            getPaymentStatusClass(sale.totalFcfa, sale.paidFcfa)
                          )}
                        >
                          {getPaymentStatusLabel(sale.totalFcfa, sale.paidFcfa)}
                        </span>
                      </div>

                      <p className="mt-2 text-sm text-gray-600">
                        Client :{" "}
                        <span className="font-medium text-gray-900">
                          {sale.customer?.name || "Client non renseigné"}
                        </span>
                        {sale.customer?.phone ? ` · ${sale.customer.phone}` : ""}
                      </p>

                      <div className="mt-3 grid gap-2 text-sm text-gray-600 md:grid-cols-4">
                        <div>
                          <span className="text-gray-400">Total :</span>{" "}
                          <span className="font-medium text-gray-900">
                            {formatMoneyFCFA(sale.totalFcfa)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">Encaissé :</span>{" "}
                          <span className="font-medium text-green-700">
                            {formatMoneyFCFA(sale.paidFcfa)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">Reste :</span>{" "}
                          <span className="font-medium text-orange-600">
                            {formatMoneyFCFA(remaining)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">Lignes :</span>{" "}
                          <span className="font-medium text-gray-900">
                            {formatNumber(sale.items.length)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-left text-gray-500">
                        <tr>
                          <th className="px-4 py-3 font-medium">Description</th>
                          <th className="px-4 py-3 font-medium">Quantité</th>
                          <th className="px-4 py-3 font-medium">PU</th>
                          <th className="px-4 py-3 font-medium">Total</th>
                          <th className="px-4 py-3 font-medium">Lot</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {sale.items.map((item) => (
                          <tr key={item.id} className="text-gray-700">
                            <td className="px-4 py-3 font-medium">
                              {item.description}
                            </td>
                            <td className="px-4 py-3">
                              {formatNumber(item.quantity)} {item.unit}
                            </td>
                            <td className="px-4 py-3">
                              {formatMoneyFCFA(item.unitPriceFcfa)}
                            </td>
                            <td className="px-4 py-3">
                              {formatMoneyFCFA(item.totalFcfa)}
                            </td>
                            <td className="px-4 py-3">
                              {item.batchId || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}