import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import { auth } from "@/src/auth"
import prisma from "@/src/lib/prisma"
import { getSale } from "@/src/actions/sales"
import { formatDate, formatDateTime, formatMoneyFCFA } from "@/src/lib/formatters"

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

  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const membership = await prisma.userOrganization.findFirst({
    where: { userId: session.user.id },
    select: { organizationId: true },
    orderBy: { organization: { name: "asc" } },
  })

  if (!membership) redirect("/login?error=no-org")

  const saleResult = await getSale({
    organizationId: membership.organizationId,
    saleId: id,
  })

  if (!saleResult.success) notFound()

  const sale = saleResult.data
  const remaining = sale.totalFcfa - sale.paidFcfa

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href="/sales"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Detail de la vente</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Reference interne : {sale.id}
          </p>
        </div>
      </div>

      <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">Client</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">
              {sale.customer?.name ?? "Client divers"}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {PRODUCT_TYPE_LABELS[sale.productType] ?? sale.productType}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Total vente</p>
            <p className="mt-1 text-lg font-bold text-gray-900">
              {formatMoneyFCFA(sale.totalFcfa)}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <InfoItem label="Date vente" value={formatDate(sale.saleDate)} />
          <InfoItem label="Encaisse" value={formatMoneyFCFA(sale.paidFcfa)} />
          <InfoItem label="Reste" value={formatMoneyFCFA(remaining)} />
          <InfoItem label="Nb lignes" value={String(sale.items.length)} />
          <InfoItem label="Telephone client" value={sale.customer?.phone ?? "Non renseigne"} />
          <InfoItem label="Facture" value={sale.invoiceId ?? "Aucune"} />
          <InfoItem label="Cree le" value={formatDateTime(sale.createdAt)} />
          <InfoItem label="Mis a jour le" value={formatDateTime(sale.updatedAt)} />
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900">Articles vendus</h2>
            <span className="text-sm text-gray-500">
              {sale.items.length} ligne{sale.items.length > 1 ? "s" : ""}
            </span>
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Description</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Quantite</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Prix unitaire</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Total</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Lot</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {sale.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-gray-900">{item.description}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {item.quantity} {item.unit.toLowerCase()}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatMoneyFCFA(item.unitPriceFcfa)}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {formatMoneyFCFA(item.totalFcfa)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {item.batchId ? (
                        <Link
                          href={`/batches/${item.batchId}`}
                          className="text-green-700 transition hover:text-green-800 hover:underline"
                        >
                          Voir le lot
                        </Link>
                      ) : (
                        "Aucun"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-900">Notes</p>
          <p className="mt-1 rounded-lg bg-gray-50 px-3 py-3 text-sm text-gray-600">
            {sale.notes ?? "Aucune note renseignee."}
          </p>
        </div>
      </div>
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-800">{value}</p>
    </div>
  )
}
