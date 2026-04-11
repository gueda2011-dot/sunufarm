import { redirect }       from "next/navigation"
import type { Metadata }  from "next"
import { auth }           from "@/src/auth"
import prisma             from "@/src/lib/prisma"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
import { FeatureGateCard } from "@/src/components/subscription/FeatureGateCard"
import { getFarms }       from "@/src/actions/farms"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { resolveEntitlementGate } from "@/src/lib/gate-resolver"
import { track } from "@/src/lib/analytics"
import { CreateBatchForm } from "./_components/CreateBatchForm"

export const metadata: Metadata = { title: "Nouveau lot" }

export default async function NewBatchPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")
  ensureModuleAccess(activeMembership, "BATCHES")

  const { organizationId, role } = activeMembership
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

  const batchGate = resolveEntitlementGate(subscription, "ACTIVE_BATCH_LIMIT", {
    usage: activeBatchCount,
  })

  if (batchGate.access !== "full") {
    void track({
      userId: session.user.id,
      organizationId,
      event: "paywall_viewed",
      plan: subscription.commercialPlan,
      properties: { entitlement: "ACTIVE_BATCH_LIMIT", surface: "batch_limit", access: batchGate.access },
    })

    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Nouveau lot</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Votre organisation a atteint la limite actuelle de lots actifs.
          </p>
        </div>

        <FeatureGateCard
          title="Augmentez votre capacite de production"
          message={batchGate.reason}
          targetPlanLabel={batchGate.requiredPlanLabel}
          currentPlanLabel={subscription.currentPlanLabel}
          access={batchGate.access}
          ctaLabel={batchGate.cta}
          trackingSurface="batch_limit"
        />
      </div>
    )
  }

  // Charger les fermes + espèces + fournisseurs en parallèle
  const [farmsResult, species, breeds, suppliers] = await Promise.all([
    getFarms({ organizationId }),
    prisma.species.findMany({ orderBy: { name: "asc" } }),
    prisma.breed.findMany({
      orderBy: [{ species: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        code: true,
        speciesId: true,
        species: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    }),
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
      breeds={breeds}
      suppliers={suppliers}
    />
  )
}
