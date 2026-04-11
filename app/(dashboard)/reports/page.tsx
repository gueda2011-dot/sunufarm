/**
 * SunuFarm - Page Rapports (Server Component)
 */

import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { auth } from "@/src/auth"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
import { getMonthlyReportData } from "@/src/lib/monthly-reports"
import { FeatureGateCard } from "@/src/components/subscription/FeatureGateCard"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { hasMonthlyReportsPreviewData } from "@/src/lib/reports-preview"
import { gateHasFullAccess, resolveEntitlementGate } from "@/src/lib/gate-resolver"
import { getPremiumSurfaceCopy } from "@/src/lib/premium-surface-copy"
import { track } from "@/src/lib/analytics"
import { ReportsPreviewCard } from "./_components/ReportsPreviewCard"
import { ReportsPageClient } from "./_components/ReportsPageClient"

export const metadata: Metadata = { title: "Rapports" }

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")
  ensureModuleAccess(activeMembership, "REPORTS")

  const { organizationId } = activeMembership
  const subscription = await getOrganizationSubscription(organizationId)

  const sp = await searchParams
  const now = new Date()
  const year = parseInt(sp.year ?? String(now.getFullYear()), 10)
  const month = parseInt(sp.month ?? String(now.getMonth() + 1), 10)

  const report = await getMonthlyReportData({
    organizationId,
    year,
    month,
  })
  const reportsPreviewEnabled = hasMonthlyReportsPreviewData(report)
  const reportsGate = resolveEntitlementGate(subscription, "ADVANCED_REPORTS", {
    hasMinimumData: reportsPreviewEnabled,
    previewEnabled: reportsPreviewEnabled,
  })
  const reportsCopy = getPremiumSurfaceCopy("reports", reportsGate.access)

  if (!gateHasFullAccess(reportsGate)) {
    if (reportsGate.access !== "blocked") {
      void track({
        userId: session.user.id,
        organizationId,
        event: "paywall_viewed",
        plan: subscription.commercialPlan,
        properties: { entitlement: "ADVANCED_REPORTS", surface: "reports", access: reportsGate.access },
      })
    }

    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Rapports</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            La vue mensuelle montre la tendance du mois avant de debloquer le rapport complet.
          </p>
        </div>

        {reportsGate.access === "preview" && (
          <ReportsPreviewCard
            report={report}
            commercialPlan={subscription.commercialPlan}
          />
        )}

        <FeatureGateCard
          title={reportsCopy.title}
          message={reportsGate.reason}
          targetPlanLabel={reportsGate.requiredPlanLabel}
          currentPlanLabel={reportsGate.currentPlanLabel}
          access={reportsGate.access}
          ctaLabel={reportsCopy.ctaLabel}
          highlights={reportsCopy.highlights}
          footerHint={
            reportsGate.access === "preview"
              ? "Starter peut exporter un PDF watermarked. Pro et Business debloquent le rapport complet et les exports avances."
              : reportsCopy.footerHint
          }
          trackingSurface="reports"
        />
      </div>
    )
  }

  return (
    <ReportsPageClient report={report} />
  )
}
