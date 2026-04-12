import { redirect } from "next/navigation"
import type { Metadata } from "next"
import Link from "next/link"
import { Crown, Download, LineChart, ShieldAlert } from "lucide-react"
import { auth } from "@/src/auth"
import { getBusinessDashboardOverview } from "@/src/actions/business"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
import { FeatureGateCard } from "@/src/components/subscription/FeatureGateCard"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { gateHasFullAccess, resolveEntitlementGate } from "@/src/lib/gate-resolver"
import { track } from "@/src/lib/analytics"
import { BusinessBatchComparisonTable } from "./_components/BusinessBatchComparisonTable"
import { BusinessKpiGrid } from "./_components/BusinessKpiGrid"
import { BusinessPriorityPanel } from "./_components/BusinessPriorityPanel"
import { BusinessRecommendationsPanel } from "./_components/BusinessRecommendationsPanel"
import { BusinessSituationCard } from "./_components/BusinessSituationCard"

export const metadata: Metadata = { title: "Business" }

export default async function BusinessPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")
  ensureModuleAccess(activeMembership, "DASHBOARD")

  const subscription = await getOrganizationSubscription(activeMembership.organizationId)
  const businessGate = resolveEntitlementGate(subscription, "GLOBAL_DASHBOARD")

  if (!gateHasFullAccess(businessGate)) {
    void track({
      userId: session.user.id,
      organizationId: activeMembership.organizationId,
      event: "paywall_viewed",
      plan: subscription.commercialPlan,
      properties: { entitlement: "GLOBAL_DASHBOARD", surface: "business", access: businessGate.access },
    })

    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-green-800 px-6 py-8 text-white shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-green-200">
            Vue exploitation Business
          </p>
          <h1 className="mt-2 text-3xl font-bold">
            Un resume dirigeant pour piloter l&apos;exploitation
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-100 sm:text-base">
            Cette page rassemble les signaux critiques, les comparaisons de lots et les
            decisions a prendre dans une seule lecture premium. Elle est reservee au plan Business.
          </p>
        </section>

        <FeatureGateCard
          title="Passez a Business pour piloter toute l'exploitation"
          message={businessGate.reason}
          targetPlanLabel={businessGate.requiredPlanLabel}
          currentPlanLabel={businessGate.currentPlanLabel}
          access={businessGate.access}
          trackingSurface="business"
          highlights={[
            "Vue globale des marges, risques sanitaires et stocks critiques",
            "Synthese dirigeant pour savoir quoi traiter en premier",
            "Export Business consolide pour partager une lecture claire de l'exploitation",
          ]}
          ctaLabel={businessGate.cta}
          footerHint="Business est pense pour le pilotage global : plusieurs fermes, plusieurs responsables et une vraie lecture de decision."
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
            Vue exploitation Business
          </p>
          <h1 className="mt-2 text-3xl font-bold">
            Resume dirigeant indisponible
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
              Vue exploitation Business
            </p>
            <h1 className="mt-2 text-3xl font-bold">
              Resume dirigeant de l&apos;exploitation
            </h1>
            <p className="mt-3 text-sm text-slate-100 sm:text-base">
              Ici, on ne regarde plus un lot isole. On priorise les sujets qui peuvent
              deplacer la rentabilite, la sante et la continuite d&apos;approvisionnement.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:max-w-xl">
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-green-100">
                <Crown className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wide">Resume dirigeant</span>
              </div>
              <p className="mt-2 text-sm text-white">
                Une lecture exploitation consolidee pour arbitrer plus vite.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-green-100">
                <ShieldAlert className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wide">Signaux prioritaires</span>
              </div>
              <p className="mt-2 text-sm text-white">
                Les risques critiques et moderes sont regroupes au meme endroit.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-green-100">
                <LineChart className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wide">Decisions a prendre</span>
              </div>
              <p className="mt-2 text-sm text-white">
                Des recommandations simples pour agir sans perdre de temps.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/api/reports/business?format=xlsx"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-green-50"
          >
            <Download className="h-4 w-4" />
            Export Business Excel
          </Link>
          <Link
            href="/api/reports/business?format=csv"
            className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/15"
          >
            <Download className="h-4 w-4" />
            CSV consolide
          </Link>
          <p className="self-center text-xs text-green-100">
            Export V1 : synthese, lots a risque, stocks critiques et recommandations.
          </p>
        </div>
      </section>

      <BusinessSituationCard
        level={overview.globalStatus.level}
        label={overview.globalStatus.label}
        headline={overview.globalStatus.headline}
        summary={overview.globalStatus.summary}
        primaryAction={overview.globalStatus.primaryAction}
        score={overview.globalStatus.score}
      />

      <BusinessKpiGrid
        totalRevenueFcfa={overview.kpis.totalRevenueFcfa}
        totalCostsFcfa={overview.kpis.totalCostsFcfa}
        totalMarginFcfa={overview.kpis.totalMarginFcfa}
        globalMortalityRate={overview.kpis.globalMortalityRate}
        activeBatchCount={overview.kpis.activeBatchCount}
        atRiskBatchCount={overview.kpis.atRiskBatchCount}
        criticalStockCount={overview.kpis.criticalStockCount}
        marginVerdict={overview.kpis.marginVerdict}
        riskVerdict={overview.kpis.riskVerdict}
        stockVerdict={overview.kpis.stockVerdict}
        mortalityVerdict={overview.kpis.mortalityVerdict}
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
