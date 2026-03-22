import { redirect } from "next/navigation"
import type { Metadata } from "next"

import { auth } from "@/src/auth"
import prisma from "@/src/lib/prisma"
import { getSales } from "@/src/actions/sales"
import { SalesPageClient } from "./_components/SalesPageClient"

export const metadata: Metadata = { title: "Ventes" }

export default async function SalesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const membership = await prisma.userOrganization.findFirst({
    where: { userId: session.user.id },
    select: { organizationId: true },
    orderBy: { organization: { name: "asc" } },
  })

  if (!membership) redirect("/login?error=no-org")

  const { organizationId } = membership

  const salesResult = await getSales({
    organizationId,
    limit: 100,
  })

  const sales = salesResult.success ? salesResult.data : []

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Ventes</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Suivi du chiffre d’affaires, des encaissements et des ventes par produit.
        </p>
      </div>

      <SalesPageClient initialSales={sales} />
    </div>
  )
}