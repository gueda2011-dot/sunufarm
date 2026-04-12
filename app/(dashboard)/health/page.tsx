/**
 * SunuFarm — Page Santé animale (Server Component)
 *
 * Vue organisation : vaccinations et traitements récents sur tous les lots actifs.
 * La création se fait depuis le détail d'un lot (HealthSection).
 */

import { redirect }      from "next/navigation"
import type { Metadata } from "next"
import { auth }          from "@/src/auth"
import prisma            from "@/src/lib/prisma"
import { getVaccinationPlans, getVaccinations, getTreatments } from "@/src/actions/health"
import { getMedicineStocks } from "@/src/actions/stock"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
import { getVaccinationSuggestions } from "@/src/lib/health-guidance"
import { hasPlanFeature } from "@/src/lib/subscriptions"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { getAIPolicy } from "@/src/lib/ai"
import { HealthPageClient }               from "./_components/HealthPageClient"

export const metadata: Metadata = { title: "Santé animale" }

export default async function HealthPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")
  ensureModuleAccess(activeMembership, "HEALTH")

  const { organizationId } = activeMembership
  const subscription = await getOrganizationSubscription(organizationId)
  const canViewAdvancedHealth = hasPlanFeature(subscription.plan, "ADVANCED_HEALTH")
  const aiPolicy = getAIPolicy(subscription)

  // Fetch parallèle : vaccinations + traitements + map lots actifs
  const [vaccinationsResult, treatmentsResult, vaccinationPlansResult, batches, medicineStocksResult] = await Promise.all([
    getVaccinations({ organizationId, limit: 30 }),
    getTreatments({ organizationId, limit: 30 }),
    canViewAdvancedHealth
      ? getVaccinationPlans({ organizationId })
      : Promise.resolve({ success: true as const, data: [] }),
    prisma.batch.findMany({
      where:  { organizationId, deletedAt: null },
      select: {
        id: true,
        number: true,
        status: true,
        type: true,
        entryDate: true,
        entryAgeDay: true,
        vaccinationRecords: {
          select: {
            vaccineName: true,
          },
          orderBy: { date: "desc" },
        },
      },
    }),
    getMedicineStocks({ organizationId, limit: 100 }),
  ])

  const vaccinations = vaccinationsResult.success ? vaccinationsResult.data : []
  const treatments   = treatmentsResult.success   ? treatmentsResult.data   : []
  const vaccinationPlans = vaccinationPlansResult.success ? vaccinationPlansResult.data : []
  const medicineStocks = medicineStocksResult.success
    ? medicineStocksResult.data.map((stock) => ({
        id: stock.id,
        farmId: stock.farmId,
        name: stock.name,
        unit: stock.unit,
        quantityOnHand: stock.quantityOnHand,
      }))
    : []

  // Map batchId → numéro de lot pour l'affichage
  const batchMap = Object.fromEntries(
    batches.map((b) => [b.id, { number: b.number, status: b.status }])
  )

  // KPIs
  const now       = new Date()
  const weekAgo   = new Date(now.getTime() - 7 * 86_400_000)
  const recentVax = vaccinations.filter((v) => new Date(v.date) >= weekAgo).length
  const activeTreatments = treatments.filter((t) => !t.endDate || new Date(t.endDate) >= now).length
  const batchAlerts = canViewAdvancedHealth
    ? batches
      .filter((batch) => batch.status === "ACTIVE")
      .map((batch) => {
        const ageDay = batch.entryAgeDay + Math.max(
          0,
          Math.floor((now.getTime() - new Date(batch.entryDate).getTime()) / 86_400_000),
        )
        const suggestions = getVaccinationSuggestions({
          batchType: batch.type,
          ageDay,
          recordedVaccines: batch.vaccinationRecords.map((item) => item.vaccineName),
        })
        const overdueItems = suggestions.filter((item) => item.status === "overdue")
        const dueItems = suggestions.filter((item) => item.status === "due")

        return {
          batchId: batch.id,
          batchNumber: batch.number,
          ageDay,
          overdueCount: overdueItems.length,
          dueCount: dueItems.length,
          items: [...overdueItems, ...dueItems].slice(0, 3).map((item) => ({
            vaccineName: item.vaccineName,
            status: item.status as "due" | "overdue",
            windowLabel: `J${item.windowStartDay} a J${item.windowEndDay}`,
          })),
        }
      })
      .filter((item) => item.overdueCount > 0 || item.dueCount > 0)
      .sort((left, right) => (
        right.overdueCount - left.overdueCount ||
        right.dueCount - left.dueCount ||
        right.ageDay - left.ageDay
      ))
    : []

  return (
    <HealthPageClient
      organizationId={organizationId}
      currentPlan={subscription.plan}
      canViewAdvancedHealth={canViewAdvancedHealth}
      canUseHealthAI={aiPolicy.enabled && canViewAdvancedHealth}
      healthAIUpsellMessage="Passe au plan Pro pour obtenir une synthese IA des risques sanitaires et des actions prioritaires."
      healthAIAccessLabel={
        subscription.isTrialActive
          ? "Essai limite"
          : aiPolicy.tier === "business"
            ? "Business AI"
            : aiPolicy.tier === "pro"
              ? "Pro AI"
              : "Upgrade"
      }
      planLabel={subscription.isTrialActive ? "Essai gratuit" : subscription.billingLabel}
      vaccinations={vaccinations}
      treatments={treatments}
      vaccinationPlans={vaccinationPlans}
      batchAlerts={batchAlerts}
      batchMap={batchMap}
      recentVaxCount={recentVax}
      activeTreatmentsCount={activeTreatments}
      totalVaxCount={vaccinations.length}
      totalTreatmentsCount={treatments.length}
      offlineBatches={batches.map((batch) => ({
        id: batch.id,
        number: batch.number,
        status: batch.status,
      }))}
      offlineMedicineStocks={medicineStocks}
    />
  )
}
