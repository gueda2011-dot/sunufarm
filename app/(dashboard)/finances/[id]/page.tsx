import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import { auth } from "@/src/auth"
import prisma from "@/src/lib/prisma"
import { getExpense } from "@/src/actions/expenses"
import { formatDate, formatMoneyFCFA, formatDateTime } from "@/src/lib/formatters"

export const metadata: Metadata = { title: "Detail depense" }

export default async function ExpenseDetailPage({
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

  const expenseResult = await getExpense({
    organizationId: membership.organizationId,
    expenseId: id,
  })

  if (!expenseResult.success) notFound()

  const expense = expenseResult.data

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href="/finances"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Detail de la depense</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Reference interne : {expense.id}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">Description</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{expense.description}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Montant</p>
            <p className="mt-1 text-lg font-bold text-gray-900">{formatMoneyFCFA(expense.amountFcfa)}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <InfoItem label="Date" value={formatDate(expense.date)} />
          <InfoItem label="Categorie" value={expense.category?.name ?? "Non classee"} />
          <InfoItem label="Reference" value={expense.reference ?? "Aucune"} />
          <InfoItem label="Fournisseur" value={expense.supplierId ?? "Aucun"} />
          <InfoItem label="Lot lie" value={expense.batchId ?? "Aucun"} />
          <InfoItem label="Ferme liee" value={expense.farmId ?? "Aucune"} />
          <InfoItem label="Cree le" value={formatDateTime(expense.createdAt)} />
          <InfoItem label="Mis a jour le" value={formatDateTime(expense.updatedAt)} />
        </div>

        <div>
          <p className="text-sm font-medium text-gray-900">Notes</p>
          <p className="mt-1 rounded-lg bg-gray-50 px-3 py-3 text-sm text-gray-600">
            {expense.notes ?? "Aucune note renseignee."}
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
