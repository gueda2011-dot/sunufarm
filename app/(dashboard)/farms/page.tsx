import { redirect }        from "next/navigation"
import type { Metadata }   from "next"
import { auth }            from "@/src/auth"
import prisma              from "@/src/lib/prisma"
import { getFarms }        from "@/src/actions/farms"
import { getOrganizationSubscription } from "@/src/lib/subscriptions"
import { FarmsClient }     from "./_components/FarmsClient"

export const metadata: Metadata = { title: "Fermes & Bâtiments" }

export default async function FarmsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const membership = await prisma.userOrganization.findFirst({
    where:   { userId: session.user.id },
    select:  { organizationId: true, role: true },
    orderBy: { organization: { name: "asc" } },
  })
  if (!membership) redirect("/login?error=no-org")

  const { organizationId, role } = membership
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
