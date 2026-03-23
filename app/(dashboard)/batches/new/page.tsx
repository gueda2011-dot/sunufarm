import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { auth } from "@/src/auth"
import { getFarms } from "@/src/actions/farms"
import prisma from "@/src/lib/prisma"
import { CreateBatchForm } from "./_components/CreateBatchForm"

export const metadata: Metadata = { title: "Nouveau lot" }

export default async function NewBatchPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const membership = await prisma.userOrganization.findFirst({
    where: { userId: session.user.id },
    select: { organizationId: true, role: true },
    orderBy: { organization: { name: "asc" } },
  })
  if (!membership) redirect("/login?error=no-org")

  const { organizationId, role } = membership
  const canCreate = ["SUPER_ADMIN", "OWNER", "MANAGER"].includes(role)
  if (!canCreate) redirect("/batches")

  const [
    farmsResult,
    species,
    poultryStrains,
    vaccinationPlanTemplates,
    suppliers,
  ] = await Promise.all([
    getFarms({ organizationId }),
    prisma.species.findMany({ orderBy: { name: "asc" } }),
    prisma.poultryStrain.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        productionType: true,
        species: true,
        notes: true,
      },
    }),
    prisma.vaccinationPlanTemplate.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        productionType: true,
      },
    }),
    prisma.supplier.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  const farms = farmsResult.success ? farmsResult.data : []

  return (
    <CreateBatchForm
      organizationId={organizationId}
      initialFarms={farms}
      species={species}
      poultryStrains={poultryStrains}
      vaccinationPlanTemplates={vaccinationPlanTemplates}
      suppliers={suppliers}
    />
  )
}
