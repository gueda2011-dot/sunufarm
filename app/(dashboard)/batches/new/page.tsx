import { redirect }       from "next/navigation"
import type { Metadata }  from "next"
import { auth }           from "@/src/auth"
import prisma             from "@/src/lib/prisma"
import { PlanGuardCard }  from "@/src/components/subscription/PlanGuardCard"
import { getFarms }       from "@/src/actions/farms"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
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
  const [subscription, activeBatchCount] = await Promise.all([
    getOrganizationSubscription(organizationId),
    prisma.batch.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
      },
    }),
  ])

  // Seuls les rôles qui peuvent créer un lot accèdent à cette page
  const canCreate = ["SUPER_ADMIN", "OWNER", "MANAGER"].includes(role)
  if (!canCreate) redirect("/batches")

  if (activeBatchCount >= subscription.maxActiveBatches) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Nouveau lot</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Votre organisation a atteint la limite actuelle de lots actifs.
          </p>
        </div>

        <PlanGuardCard
          title="Augmentez votre capacite de production"
          message={`Le plan ${subscription.label} autorise jusqu'a ${subscription.maxActiveBatches} lot(s) actif(s).`}
          requiredPlan={subscription.plan === "BASIC" ? "Pro" : "Business"}
          currentPlan={subscription.plan}
        />
      </div>
    )
  }

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
