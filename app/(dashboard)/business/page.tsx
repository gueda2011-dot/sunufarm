import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { Crown, LineChart, ShieldAlert } from "lucide-react"
import { auth } from "@/src/auth"
import { getBusinessDashboardOverview } from "@/src/actions/business"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
import { PlanGuardCard } from "@/src/components/subscription/PlanGuardCard"
import { getFeatureUpgradeMessage, hasPlanFeature } from "@/src/lib/subscriptions"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { BusinessBatchComparisonTable } from "./_components/BusinessBatchComparisonTable"
import { BusinessKpiGrid } from "./_components/BusinessKpiGrid"
import { BusinessPriorityPanel } from "./_components/BusinessPriorityPanel"
import { BusinessRecommendationsPanel } from "./_components/BusinessRecommendationsPanel"

export const metadata: Metadata = { title: "Business" }

export default async function BusinessPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")
  ensureModuleAccess(activeMembership, "DASHBOARD")

  const subscription = await getOrganizationSubscription(activeMembership.organizationId)
  const canSeeBusinessDashboard = hasPlanFeature(subscription.plan, "GLOBAL_ANALYTICS")

  if (!canSeeBusinessDashboard) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-green-800 px-6 py-8 text-white shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-green-200">
            Pilotage Business
          </p>
          <h1 className="mt-2 text-3xl font-bold">
            Une vue transverse pour diriger l&apos;exploitation
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-100 sm:text-base">
            Cette page regroupe les risques, la marge projetee et les priorites critiques
            dans une seule vue dirigeant. Elle est reservee au plan Business.
          </p>
        </section>

        <PlanGuardCard
          title="Debloquez le pilotage global Business"
          message={getFeatureUpgradeMessage("GLOBAL_ANALYTICS")}
          requiredPlan="Business"
          currentPlan={subscription.plan}
        />
      </div>
    )
  }

  const overviewResult = await getBusinessDashboardOverview(activeMembership.organizationId)

  if (!overviewResult.success) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-green-800 px-6 py-8 text-white shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-green-200">
            Pilotage Business
          </p>
          <h1 className="mt-2 text-3xl font-bold">
            Vue transverse de l&apos;exploitation
          </h1>
        </section>

        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {overviewResult.error}
        </div>
      </div>
    )
  }

  const overview = overviewResult.data

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-green-800 px-6 py-8 text-white shadow-lg">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-green-200">
              Pilotage Business
            </p>
            <h1 className="mt-2 text-3xl font-bold">
              Une lecture dirigeant de l&apos;exploitation
            </h1>
            <p className="mt-3 text-sm text-slate-100 sm:text-base">
              Ici, l&apos;objectif n&apos;est plus de regarder un lot isole mais de prioriser
              les vrais sujets qui peuvent faire bouger la performance globale.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white/10 px-4 py-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-green-100">
                <Crown className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wide">Vue globale</span>
              </div>
              <p className="mt-2 text-sm text-white">
                Consolidation exploitation a partir des lots actifs et des signaux predictifs.
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-green-100">
                <ShieldAlert className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wide">Priorites</span>
              </div>
              <p className="mt-2 text-sm text-white">
                Lots en risque, marges negatives et ruptures critiques au meme endroit.
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-green-100">
                <LineChart className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wide">Decision</span>
              </div>
              <p className="mt-2 text-sm text-white">
                Recommandations deterministes pour arbitrer vite et agir sans bruit.
              </p>
            </div>
          </div>
        </div>
      </section>

      <BusinessKpiGrid
        totalRevenueFcfa={overview.kpis.totalRevenueFcfa}
        totalCostsFcfa={overview.kpis.totalCostsFcfa}
        totalMarginFcfa={overview.kpis.totalMarginFcfa}
        globalMortalityRate={overview.kpis.globalMortalityRate}
        activeBatchCount={overview.kpis.activeBatchCount}
        atRiskBatchCount={overview.kpis.atRiskBatchCount}
        criticalStockCount={overview.kpis.criticalStockCount}
      />

      <BusinessPriorityPanel
        negativeMarginLots={overview.priority.negativeMarginLots}
        mortalityRiskLots={overview.priority.mortalityRiskLots}
        criticalStockItems={overview.priority.criticalStockItems}
      />

      <BusinessBatchComparisonTable rows={overview.batchComparison} />

      <BusinessRecommendationsPanel recommendations={overview.recommendations} />
    </div>
  )
}
