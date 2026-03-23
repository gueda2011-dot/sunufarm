import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { auth } from "@/src/auth"
import prisma from "@/src/lib/prisma"
import { StrainsPageClient } from "./_components/StrainsPageClient"

export const metadata: Metadata = { title: "Souches avicoles" }

export default async function SettingsStrainsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const membership = await prisma.userOrganization.findFirst({
    where: { userId: session.user.id },
    select: { organizationId: true, role: true },
    orderBy: { organization: { name: "asc" } },
  })
  if (!membership) redirect("/login?error=no-org")

  const strains = await prisma.poultryStrain.findMany({
    orderBy: [
      { productionType: "asc" },
      { species: "asc" },
      { name: "asc" },
    ],
    select: {
      id: true,
      name: true,
      productionType: true,
      species: true,
      isActive: true,
      notes: true,
    },
  })

  return (
    <StrainsPageClient
      organizationId={membership.organizationId}
      userRole={membership.role}
      strains={strains}
    />
  )
}
