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

  if (!membership) redirect("/start")

  const { organizationId } = membership

  const salesResult = await getSales({
    organizationId,
    limit: 100,
  })

  const sales = salesResult.success ? salesResult.data : []

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <SalesPageClient sales={sales} />
    </div>
  )
}
