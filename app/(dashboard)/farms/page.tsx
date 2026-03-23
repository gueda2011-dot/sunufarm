import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { getSession } from "@/src/lib/auth"
import prisma from "@/src/lib/prisma"
import { getFarms } from "@/src/actions/farms"
import { FarmsClient } from "./_components/FarmsClient"

export const metadata: Metadata = { title: "Fermes & Batiments" }

export default async function FarmsPage() {
  const session = await getSession()
  if (!session?.user?.id) redirect("/login")

  const membership = await prisma.userOrganization.findFirst({
    where: {
      userId: session.effectiveUserId,
      ...(session.isImpersonating && session.impersonatedOrganizationId
        ? { organizationId: session.impersonatedOrganizationId }
        : {}),
    },
    select: { organizationId: true, role: true },
    orderBy: { organization: { name: "asc" } },
  })

  if (!membership) redirect("/login?error=no-org")

  const { organizationId, role } = membership
  const farmsResult = await getFarms({ organizationId })
  const farms = farmsResult.success ? farmsResult.data : []

  return (
    <FarmsClient
      organizationId={organizationId}
      userRole={role as string}
      initialFarms={farms}
    />
  )
}
