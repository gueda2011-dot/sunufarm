import { redirect } from "next/navigation"
import type { Metadata } from "next"

import { auth } from "@/src/auth"
import { getSales } from "@/src/actions/sales"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { SalesPageClient } from "./_components/SalesPageClient"

export const metadata: Metadata = { title: "Ventes" }

export default async function SalesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")
  ensureModuleAccess(activeMembership, "SALES")

  const { organizationId } = activeMembership

  const subscription = await getOrganizationSubscription(organizationId)
  if (subscription.commercialPlan === "FREE") {
    redirect("/pricing?from=sales")
  }

  const salesResult = await getSales({
    organizationId,
    limit: 100,
  })

  const sales = salesResult.success ? salesResult.data : []

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <SalesPageClient organizationId={organizationId} sales={sales} />
    </div>
  )
}
