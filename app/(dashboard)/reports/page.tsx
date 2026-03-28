/**
 * SunuFarm - Page Rapports (Server Component)
 */

import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { auth } from "@/src/auth"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
import { getMonthlyReportData } from "@/src/lib/monthly-reports"
import { PlanGuardCard } from "@/src/components/subscription/PlanGuardCard"
import {
  getFeatureUpgradeMessage,
  hasPlanFeature,
} from "@/src/lib/subscriptions"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
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

  if (!hasPlanFeature(subscription.plan, "REPORTS")) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Rapports</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            La vue mensuelle est reservee aux organisations qui veulent piloter leur rentabilite.
          </p>
        </div>

        <PlanGuardCard
          title="Debloquez les rapports mensuels"
          message={getFeatureUpgradeMessage("REPORTS")}
          requiredPlan="Pro"
          currentPlan={subscription.plan}
        />
      </div>
    )
  }

  const sp = await searchParams
  const now = new Date()
  const year = parseInt(sp.year ?? String(now.getFullYear()), 10)
  const month = parseInt(sp.month ?? String(now.getMonth() + 1), 10)

  const report = await getMonthlyReportData({
    organizationId,
    year,
    month,
  })

  return (
    <ReportsPageClient report={report} />
  )
}
