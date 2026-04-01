/**
 * SunuFarm — Détail d'un lot d'élevage (Server Component)
 *
 * Toutes les données sont chargées en parallèle (Promise.all) et les agrégations
 * calculées côté serveur avant de descendre en props simples vers les composants.
 * Pas de logique de calcul dans les enfants.
 *
 * Limites honnêtes documentées :
 *   - Effectif vivant : approximation entryCount - totalMortality (réformes non gérées au MVP)
 *   - totalMortality : agrégé depuis les 100 derniers records (suffisant pour MVP)
 *   - Rentabilité : getBatchProfitability agrège SaleItem, Expense et DailyRecord en parallèle
 */

import { notFound, redirect }             from "next/navigation"
import type { Metadata }                  from "next"
import { auth }                           from "@/src/auth"
import { getBatch }                       from "@/src/actions/batches"
import type { ActionResult }             from "@/src/lib/auth"
import { actionFailure } from "@/src/lib/action-result"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
import { getDailyRecords }                from "@/src/actions/daily-records"
import { getExpenses }                    from "@/src/actions/expenses"
import { getVaccinations, getTreatments } from "@/src/actions/health"
import { getMedicineStocks } from "@/src/actions/stock"
import { getBatchProfitability, type BatchProfitability } from "@/src/actions/profitability"
import { PlanGuardCard }                  from "@/src/components/subscription/PlanGuardCard"
import { getFeatureUpgradeMessage, hasPlanFeature } from "@/src/lib/subscriptions"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { getAIPolicy, listStoredBatchAnalyses } from "@/src/lib/ai"
import { getBatchMarginInsight, getBatchMortalityInsight } from "@/src/actions/predictive"
import {
  getBatchOperationalSnapshot,
  hasMissingBatchSaisie,
} from "@/src/lib/batch-metrics"
import { BatchHeader }                    from "./_components/BatchHeader"
import { BatchMarginProjectionCard } from "./_components/BatchMarginProjectionCard"
import { BatchMortalityPredictionCard } from "./_components/BatchMortalityPredictionCard"
import { BatchAIAnalysisCard }            from "./_components/BatchAIAnalysisCard"
import { BatchKpis }                      from "./_components/BatchKpis"
import { ProfitabilityCard }              from "./_components/ProfitabilityCard"
import { RecentDailyRecords }             from "./_components/RecentDailyRecords"
import { HealthSection }                  from "./_components/HealthSection"
import { RecentExpenses }                 from "./_components/RecentExpenses"

export const metadata: Metadata = { title: "Détail du lot" }

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")
  ensureModuleAccess(activeMembership, "BATCHES")

  const batchResult = await getBatch({ organizationId: activeMembership.organizationId, batchId: id })
  if (!batchResult.success) notFound()
  const batch = batchResult.data

  const { organizationId, role } = activeMembership
  const subscription = await getOrganizationSubscription(organizationId)
  const canSeeProfitability = hasPlanFeature(subscription.plan, "PROFITABILITY")
  const canSeePredictiveHealth = hasPlanFeature(subscription.plan, "PREDICTIVE_HEALTH_ALERTS")
  const canSeePredictiveMargin = hasPlanFeature(subscription.plan, "PREDICTIVE_MARGIN_ALERTS")
  const canShowMortalityPrediction = batch.status === "ACTIVE"
  const aiPolicy = getAIPolicy(subscription)
  const canUseBatchAI = aiPolicy.enabled

  // ── Fetch parallèle ──────────────────────────────────────────────────────
  // getBatch doit réussir pour afficher la page.
  // Les autres fetches dégradent gracieusement si ils échouent (tableaux vides).
  const [
    recordsResult,
    expensesResult,
    vaccinationsResult,
    treatmentsResult,
    medicineStocksResult,
    profitabilityResult,
    mortalityInsightResult,
    marginInsightResult,
    previousAnalyses,
  ] = await Promise.all([
    getDailyRecords({ organizationId, batchId: id, limit: 100 }),
    getExpenses({ organizationId, batchId: id, limit: 100 }),
    getVaccinations({ organizationId, batchId: id, limit: 10 }),
    getTreatments({ organizationId, batchId: id, limit: 10 }),
    getMedicineStocks({ organizationId, farmId: batch.building.farmId, limit: 100 }),
    canSeeProfitability
      ? getBatchProfitability({ organizationId, batchId: id })
      : Promise.resolve<ActionResult<BatchProfitability>>(
          actionFailure(getFeatureUpgradeMessage("PROFITABILITY"), {
            code: "PLAN_UPGRADE_REQUIRED",
            status: 403,
          }),
        ),
    canSeePredictiveHealth && canShowMortalityPrediction
      ? getBatchMortalityInsight(organizationId, id)
      : Promise.resolve<ActionResult<Awaited<ReturnType<typeof getBatchMortalityInsight>> extends { success: true; data: infer T } ? T : never>>(
          actionFailure(getFeatureUpgradeMessage("PREDICTIVE_HEALTH_ALERTS"), {
            code: "PLAN_UPGRADE_REQUIRED",
            status: 403,
          }),
        ),
    canSeePredictiveMargin && canShowMortalityPrediction
      ? getBatchMarginInsight(organizationId, id)
      : Promise.resolve<ActionResult<Awaited<ReturnType<typeof getBatchMarginInsight>> extends { success: true; data: infer T } ? T : never>>(
          actionFailure(getFeatureUpgradeMessage("PREDICTIVE_MARGIN_ALERTS"), {
            code: "PLAN_UPGRADE_REQUIRED",
            status: 403,
          }),
        ),
    listStoredBatchAnalyses(organizationId, id, 5),
  ])

  const records       = recordsResult.success       ? recordsResult.data       : []
  const expenses      = expensesResult.success      ? expensesResult.data      : []
  const vaccinations  = vaccinationsResult.success  ? vaccinationsResult.data  : []
  const treatments    = treatmentsResult.success    ? treatmentsResult.data    : []
  const medicineStocks = medicineStocksResult.success ? medicineStocksResult.data : []
  const profitability = profitabilityResult.success ? profitabilityResult.data : null
  const mortalityInsight = mortalityInsightResult.success ? mortalityInsightResult.data : null
  const marginInsight = marginInsightResult.success ? marginInsightResult.data : null

  // ── Agrégations opérationnelles (calculées une fois, propagées en props) ─
  const totalMortality = records.reduce((s, r) => s + r.mortality, 0)

  // records est trié date desc par l'action getDailyRecords
  const lastRecordDate = records[0]?.date ?? null

  const snapshot = getBatchOperationalSnapshot({
    entryDate: batch.entryDate,
    entryAgeDay: batch.entryAgeDay,
    entryCount: batch.entryCount,
    status: batch.status,
    closedAt: batch.closedAt,
    totalMortality,
  })
  const missingSaisie = hasMissingBatchSaisie({
    status: batch.status,
    entryDate: batch.entryDate,
    lastRecordDate,
  })

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BatchHeader
        batch={batch}
        ageDay={snapshot.ageDay}
        missingSaisie={missingSaisie}
        userRole={role as string}
      />

      <BatchKpis
        liveCount={snapshot.liveCount}
        totalMortality={snapshot.totalMortality}
        mortalityRate={snapshot.mortalityRatePct}
        lastRecordDate={lastRecordDate}
        isActive={batch.status === "ACTIVE"}
      />

      {mortalityInsight && (
        <BatchMortalityPredictionCard
          prediction={mortalityInsight.prediction}
          trend={mortalityInsight.trend}
        />
      )}

      {!mortalityInsight && canShowMortalityPrediction && (
        <PlanGuardCard
          title="Debloquez la prediction mortalite"
          message={getFeatureUpgradeMessage("PREDICTIVE_HEALTH_ALERTS")}
          requiredPlan="Pro"
          currentPlan={subscription.plan}
        />
      )}

      {marginInsight && (
        <BatchMarginProjectionCard
          prediction={marginInsight.prediction}
          trend={marginInsight.trend}
        />
      )}

      {!marginInsight && canShowMortalityPrediction && (
        <PlanGuardCard
          title="Debloquez la projection de marge"
          message={getFeatureUpgradeMessage("PREDICTIVE_MARGIN_ALERTS")}
          requiredPlan="Pro"
          currentPlan={subscription.plan}
        />
      )}

      {profitability && (
        <ProfitabilityCard profitability={profitability} />
      )}

      {!profitability && (
        <PlanGuardCard
          title="Debloquez la rentabilite par lot"
          message={getFeatureUpgradeMessage("PROFITABILITY")}
          requiredPlan="Pro"
          currentPlan={subscription.plan}
        />
      )}

      <BatchAIAnalysisCard
        organizationId={organizationId}
        batchId={batch.id}
        planLabel={subscription.isTrialActive ? "Essai gratuit" : subscription.billingLabel}
        aiAccessLabel={
          subscription.isTrialActive
            ? "Essai limite"
            : aiPolicy.tier === "business"
              ? "Business AI"
              : aiPolicy.tier === "pro"
                ? "Pro AI"
                : "Upgrade"
        }
        dailyLimitLabel={
          aiPolicy.tier === "trial"
            ? "3 analyses maximum pendant l'essai"
            : `${aiPolicy.dailyLimit} analyses maximum par jour`
        }
        monthlyLimitLabel={
          aiPolicy.tier === "trial"
            ? "3 analyses maximum au total"
            : `${aiPolicy.monthlyLimit} analyses maximum par mois`
        }
        enabled={canUseBatchAI}
        upsellMessage={getFeatureUpgradeMessage("AI_BATCH_ANALYSIS")}
        previousAnalyses={previousAnalyses}
        comparisonEnabled={aiPolicy.advanced}
      />

      <RecentDailyRecords
        records={records.slice(0, 7)}
        batchId={batch.id}
      />

      <HealthSection
        vaccinations={vaccinations}
        treatments={treatments}
        medicineStocks={medicineStocks.map((stock) => ({
          id: stock.id,
          name: stock.name,
          unit: stock.unit,
          quantityOnHand: stock.quantityOnHand,
        }))}
        batchId={batch.id}
        organizationId={organizationId}
        userRole={role}
        entryDate={batch.entryDate}
        entryCount={batch.entryCount}
        batchType={batch.type}
        ageDay={snapshot.ageDay}
      />

      <RecentExpenses
        expenses={expenses.slice(0, 5)}
        batchId={batch.id}
      />
    </div>
  )
}
