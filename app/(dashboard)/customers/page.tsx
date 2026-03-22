/**
 * SunuFarm — Page Clients (Server Component)
 *
 * Charge la liste des clients avec leurs agrégations de ventes
 * et calcule les KPI globaux avant de passer en props au client.
 */

import { redirect }    from "next/navigation"
import type { Metadata } from "next"
import { auth }        from "@/src/auth"
import prisma          from "@/src/lib/prisma"
import { getCustomers } from "@/src/actions/customers"
import { CustomersPageClient } from "./_components/CustomersPageClient"

export const metadata: Metadata = { title: "Clients" }

export default async function CustomersPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const membership = await prisma.userOrganization.findFirst({
    where:   { userId: session.user.id },
    select:  { organizationId: true, role: true },
    orderBy: { organization: { name: "asc" } },
  })
  if (!membership) redirect("/login?error=no-org")

  const { organizationId, role } = membership

  const customersResult = await getCustomers({ organizationId })
  const customers = customersResult.success ? customersResult.data : []

  // KPI globaux calculés côté serveur
  const totalCustomers = customers.length
  const totalRevenueFcfa = customers.reduce((s, c) => s + c.totalFcfa,   0)
  const totalBalanceFcfa = customers.reduce((s, c) => s + c.balanceFcfa, 0)

  return (
    <CustomersPageClient
      organizationId={organizationId}
      userRole={role as string}
      customers={customers}
      totalCustomers={totalCustomers}
      totalRevenueFcfa={totalRevenueFcfa}
      totalBalanceFcfa={totalBalanceFcfa}
    />
  )
}
