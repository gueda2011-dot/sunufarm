/**
 * SunuFarm — Page Clients (Server Component)
 *
 * Charge la liste des clients avec leurs agrégations de ventes
 * et calcule les KPI globaux avant de passer en props au client.
 */

import { redirect }    from "next/navigation"
import type { Metadata } from "next"
import { auth }        from "@/src/auth"
import { getCustomers } from "@/src/actions/customers"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { CustomersPageClient } from "./_components/CustomersPageClient"

export const metadata: Metadata = { title: "Clients" }

export default async function CustomersPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")

  const { organizationId, role } = activeMembership

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
