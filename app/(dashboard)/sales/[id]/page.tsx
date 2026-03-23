import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"
import Link from "next/link"

import { getSession } from "@/src/lib/auth"
import prisma from "@/src/lib/prisma"
import { getSale } from "@/src/actions/sales"
import { getFeedStocks } from "@/src/actions/stock"
import {
  formatDate,
  formatMoneyFCFA,
  formatNumber,
} from "@/src/lib/formatters"
import { stripSaleStockImpactFromNotes } from "@/src/lib/sale-stock-impact"
import { CreateSaleForm } from "../new/_components/CreateSaleForm"

export const metadata: Metadata = { title: "Detail vente" }

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  POULET_VIF: "Poulet vif",
  OEUF: "Oeuf",
  FIENTE: "Fiente",
}

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await getSession()
  if (!session?.user?.id) redirect("/login")

  const membership = await prisma.userOrganization.findFirst({
    where: {
      userId: session.effectiveUserId,
      ...(session.isImpersonating && session.impersonatedOrganizationId
        ? { organizationId: session.impersonatedOrganizationId }
        : {}),
    },
    select: { organizationId: true },
    orderBy: { organization: { name: "asc" } },
  })
  if (!membership) redirect("/login?error=no-org")

  const [saleResult, feedStocksResult] = await Promise.all([
    getSale({
      organizationId: membership.organizationId,
      saleId: id,
    }),
    getFeedStocks({
      organizationId: membership.organizationId,
    }),
  ])

  if (!saleResult.success) notFound()

  const sale = saleResult.data
  const feedStocks = feedStocksResult.success ? feedStocksResult.data : []
  const remainingFcfa = sale.totalFcfa - sale.paidFcfa

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <Link
            href="/sales"
            className="text-sm text-green-600 transition hover:text-green-700 hover:underline"
          >
            Retour aux ventes
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">
            Vente du {formatDate(sale.saleDate)}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {PRODUCT_TYPE_LABELS[sale.productType] ?? sale.productType}
            {" · "}
            {sale.customer?.name ?? "Client divers"}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-sm text-gray-500">Total</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {formatMoneyFCFA(sale.totalFcfa)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-sm text-gray-500">Encaisse</p>
          <p className="mt-1 text-2xl font-bold text-green-600">
            {formatMoneyFCFA(sale.paidFcfa)}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-sm text-gray-500">Reste</p>
          <p className="mt-1 text-2xl font-bold text-orange-600">
            {formatMoneyFCFA(remainingFcfa)}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-sm text-gray-500">Lignes</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {formatNumber(sale.items.length)}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-sm text-gray-500">Impact stock</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {sale.stockImpact.enabled ? "Actif - transitoire" : "Aucun"}
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <h2 className="text-base font-semibold text-gray-900">Informations</h2>
        <div className="mt-4 grid gap-3 text-sm text-gray-600 md:grid-cols-2">
          <div>
            <span className="text-gray-400">Client :</span>{" "}
            <span className="font-medium text-gray-900">
              {sale.customer?.name ?? "Client divers"}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Telephone :</span>{" "}
            <span className="font-medium text-gray-900">
              {sale.customer?.phone ?? "-"}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Type :</span>{" "}
            <span className="font-medium text-gray-900">
              {PRODUCT_TYPE_LABELS[sale.productType] ?? sale.productType}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Stock :</span>{" "}
            <span className="font-medium text-gray-900">
              {sale.stockImpact.enabled
                ? "Sortie stock FIENTE via FeedStock (temporaire)"
                : "Sans impact stock"}
            </span>
          </div>
        </div>

        {stripSaleStockImpactFromNotes(sale.notes) ? (
          <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
            {stripSaleStockImpactFromNotes(sale.notes)}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
        <div className="border-b border-gray-100 px-4 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            Modifier la vente
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            La liaison stock est limitee a FIENTE et reste transitoire tant quun
            vrai stock fiente nexiste pas en base.
          </p>
        </div>
        <div className="p-4">
          <CreateSaleForm
            organizationId={membership.organizationId}
            feedStocks={feedStocks}
            initialSale={sale}
          />
        </div>
      </div>
    </div>
  )
}
