import { redirect }       from "next/navigation"
import type { Metadata }  from "next"
import { auth }           from "@/src/auth"
import prisma             from "@/src/lib/prisma"
import { getFarms }       from "@/src/actions/farms"
import { CreateBatchForm } from "./_components/CreateBatchForm"

export const metadata: Metadata = { title: "Nouveau lot" }

export default async function NewBatchPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const membership = await prisma.userOrganization.findFirst({
    where:   { userId: session.user.id },
    select:  { organizationId: true, role: true },
    orderBy: { organization: { name: "asc" } },
  })
  if (!membership) redirect("/login?error=no-org")

  const { organizationId, role } = membership

  // Seuls les rôles qui peuvent créer un lot accèdent à cette page
  const canCreate = ["SUPER_ADMIN", "OWNER", "MANAGER"].includes(role)
  if (!canCreate) redirect("/batches")

  // Charger les fermes + espèces + fournisseurs en parallèle
  const [farmsResult, species, suppliers] = await Promise.all([
    getFarms({ organizationId }),
    prisma.species.findMany({ orderBy: { name: "asc" } }),
    prisma.supplier.findMany({
      where:   { organizationId },
      orderBy: { name: "asc" },
      select:  { id: true, name: true },
    }),
  ])

  const farms = farmsResult.success ? farmsResult.data : []

  return (
    <CreateBatchForm
      organizationId={organizationId}
      initialFarms={farms}
      species={species}
      suppliers={suppliers}
    />
  )
}
