import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { auth } from "@/src/auth"
import { getFarms } from "@/src/actions/farms"
import prisma from "@/src/lib/prisma"
import { isSelectablePoultrySpeciesCode } from "@/src/lib/poultry-reference"
import { isMissingTableError } from "@/src/lib/prisma-schema-guard"
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

  const [farmsResult, speciesResult, suppliers] = await Promise.all([
    getFarms({ organizationId }),
    prisma.species.findMany({ orderBy: { name: "asc" } }),
    prisma.supplier.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  const species = speciesResult.filter((item) =>
    isSelectablePoultrySpeciesCode(item.code),
  )

  let poultryStrains: Array<{
    id: string
    name: string
    productionType: "BROILER" | "LAYER" | "LOCAL" | "DUAL"
    species: "CHICKEN" | "GUINEA_FOWL"
    notes: string | null
  }> = []

  let vaccinationPlanTemplates: Array<{
    id: string
    name: string
    productionType: "BROILER" | "LAYER"
  }> = []

  let referenceDataUnavailable = false

  try {
    const [strainResults, templateResults] = await Promise.all([
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
    ])

    poultryStrains = strainResults
    vaccinationPlanTemplates = templateResults
  } catch (error) {
    if (
      isMissingTableError(error, [
        "PoultryStrain",
        "VaccinationPlanTemplate",
      ])
    ) {
      referenceDataUnavailable = true
    } else {
      throw error
    }
  }

  const farms = farmsResult.success ? farmsResult.data : []

  return (
    <CreateBatchForm
      organizationId={organizationId}
      initialFarms={farms}
      species={species}
      poultryStrains={poultryStrains}
      vaccinationPlanTemplates={vaccinationPlanTemplates}
      suppliers={suppliers}
      referenceDataUnavailable={referenceDataUnavailable}
    />
  )
}
