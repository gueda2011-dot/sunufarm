import { redirect }        from "next/navigation"
import type { Metadata }   from "next"
import { auth }            from "@/src/auth"
import prisma              from "@/src/lib/prisma"
import { getFarms }        from "@/src/actions/farms"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
import { resolveEntitlementGate } from "@/src/lib/gate-resolver"
import { track } from "@/src/lib/analytics"
import { FarmsClient }     from "./_components/FarmsClient"

export const metadata: Metadata = { title: "Fermes & Bâtiments" }

export default async function FarmsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")
  ensureModuleAccess(activeMembership, "FARMS")

  const { organizationId, role } = activeMembership
  const [subscription, activeFarmCount] = await Promise.all([
    getOrganizationSubscription(organizationId),
    prisma.farm.count({
      where: { organizationId, deletedAt: null },
    }),
  ])

  const farmsResult = await getFarms({ organizationId })
  const farms = farmsResult.success ? farmsResult.data : []
  const farmGate = resolveEntitlementGate(subscription, "FARM_LIMIT", {
    usage: activeFarmCount,
  })

  if (farmGate.access !== "full") {
    void track({
      userId: session.user.id,
      organizationId,
      event: "paywall_viewed",
      plan: subscription.commercialPlan,
      properties: { entitlement: "FARM_LIMIT", surface: "farm_limit", access: farmGate.access },
    })
  }

  return (
    <FarmsClient
      organizationId={organizationId}
      userRole={role as string}
      currentPlanLabel={subscription.currentPlanLabel}
      maxFarms={farmGate.limit}
      canCreateFarm={farmGate.access === "full"}
      initialFarms={farms}
    />
  )
}
