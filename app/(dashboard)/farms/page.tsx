import { redirect }        from "next/navigation"
import type { Metadata }   from "next"
import { auth }            from "@/src/auth"
import prisma              from "@/src/lib/prisma"
import { getFarms }        from "@/src/actions/farms"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { FarmsClient }     from "./_components/FarmsClient"

export const metadata: Metadata = { title: "Fermes & Bâtiments" }

export default async function FarmsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")

  const { organizationId, role } = activeMembership
  const [subscription, activeFarmCount] = await Promise.all([
    getOrganizationSubscription(organizationId),
    prisma.farm.count({
      where: { organizationId, deletedAt: null },
    }),
  ])

  const farmsResult = await getFarms({ organizationId })
  const farms = farmsResult.success ? farmsResult.data : []

  return (
    <FarmsClient
      organizationId={organizationId}
      userRole={role as string}
      subscriptionPlan={subscription.plan}
      maxFarms={subscription.maxFarms}
      canCreateFarm={activeFarmCount < subscription.maxFarms}
      initialFarms={farms}
    />
  )
}
