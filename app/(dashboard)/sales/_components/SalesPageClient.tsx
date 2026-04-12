"use client"

import { useMemo, useState } from "react"
import Link from "next/link"

import type { SaleSummary } from "@/src/actions/sales"
import {
  formatDate,
  formatMoneyFCFA,
} from "@/src/lib/formatters"
import { useOfflineData } from "@/src/hooks/useOfflineData"
import { OFFLINE_RESOURCE_KEYS } from "@/src/lib/offline-keys"
import { OFFLINE_TTL_MS } from "@/src/lib/offline-ttl"
import { OfflineStateIndicator } from "@/src/components/offline/OfflineStateIndicator"
import { loadSalesFromLocal } from "@/src/lib/offline/repositories/transactionLoaders"

type Props = {
  organizationId: string
  sales: SaleSummary[]
}

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  POULET_VIF: "Poulet vif",
  OEUF:       "Œuf",
  FIENTE:     "Fiente",
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ")
}

export function SalesPageClient({ organizationId, sales: initialSales }: Props) {
  const [search, setSearch] = useState("")

  const { data: sales = initialSales, isOfflineFallback, isStale, readCacheMeta } = useOfflineData({
    key: OFFLINE_RESOURCE_KEYS.salesList,
    organizationId,
    initialData: initialSales,
    ttlMs: OFFLINE_TTL_MS.records,
    localLoader: () => loadSalesFromLocal(organizationId),
  })

  const normalizedSearch = search.trim().toLowerCase()

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        sale.customer?.name?.toLowerCase().includes(normalizedSearch) ||
        sale.items.some((item) =>
          item.description.toLowerCase().includes(normalizedSearch)
        )

      return matchesSearch
    })
  }, [sales, normalizedSearch])

  const totalRevenue = sales.reduce((sum, s) => sum + s.totalFcfa, 0)
  const totalPaid = sales.reduce((sum, s) => sum + s.paidFcfa, 0)
  const totalUnpaid = totalRevenue - totalPaid

  return (
    <div className="space-y-5">

      <OfflineStateIndicator
        isOfflineFallback={isOfflineFallback}
        isStale={isStale}
        isEmpty={isOfflineFallback && sales.length === 0}
        readCacheMeta={readCacheMeta}
      />

      {/* HEADER */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Ventes</h1>
          <p className="text-sm text-gray-500">
            Suivi des ventes et encaissements.
          </p>
        </div>

        <Link
          href="/sales/new"
          className="inline-flex w-fit rounded-xl bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-green-700"
        >
          + Nouvelle vente
        </Link>
      </div>

      {/* SEARCH + ACTIONS */}
      <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 md:flex-row md:items-center md:justify-between">
        <div className="w-full md:max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un client ou produit..."
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-green-500"
          />
        </div>

        <Link
          href="/finances"
          className="inline-flex rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
        >
          Voir finances
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-sm text-gray-500">Chiffre d’affaires</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {formatMoneyFCFA(totalRevenue)}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-sm text-gray-500">Montant encaissé</p>
          <p className="mt-1 text-2xl font-bold text-green-600">
            {formatMoneyFCFA(totalPaid)}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-sm text-gray-500">Reste à encaisser</p>
          <p className="mt-1 text-2xl font-bold text-orange-600">
            {formatMoneyFCFA(totalUnpaid)}
          </p>
        </div>
      </div>

      {/* LIST */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
        <div className="border-b border-gray-100 px-4 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            Liste des ventes
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Historique des ventes enregistrées.
          </p>
        </div>

        {filteredSales.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-gray-500">
              {sales.length === 0 && isOfflineFallback
                ? "Aucune donnée disponible hors ligne. Connectez-vous pour synchroniser."
                : "Aucune vente trouvée."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredSales.map((sale) => {
              const remaining = sale.totalFcfa - sale.paidFcfa

              return (
                <div
                  key={sale.id}
                  className="flex flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-gray-900">
                        {sale.customer?.name || "Client divers"}
                      </h3>

                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                        {PRODUCT_TYPE_LABELS[sale.productType] ?? sale.productType}
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-gray-500">
                      {formatDate(sale.saleDate)}
                    </p>

                    <div className="mt-3 grid gap-2 text-sm text-gray-600 sm:grid-cols-3">
                      <div>
                        <span className="text-gray-400">Total :</span>{" "}
                        <span className="font-medium text-gray-900">
                          {formatMoneyFCFA(sale.totalFcfa)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">Payé :</span>{" "}
                        <span className="font-medium text-green-600">
                          {formatMoneyFCFA(sale.paidFcfa)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">Reste :</span>{" "}
                        <span
                          className={cn(
                            "font-medium",
                            remaining > 0 ? "text-orange-600" : "text-gray-900"
                          )}
                        >
                          {formatMoneyFCFA(remaining)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0">
                    <Link
                      href={`/sales/${sale.id}`}
                      className="inline-flex rounded-xl bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
                    >
                      Voir détail
                    </Link>
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