/**
 * SunuFarm — Détail d'un lot d'élevage (Server Component)
 */

import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"
import { auth } from "@/src/auth"
import { getBatch } from "@/src/actions/batches"
import type { ActionResult } from "@/src/lib/auth"
import { actionFailure } from "@/src/lib/action-result"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
import { getDailyRecords } from "@/src/actions/daily-records"
import { getExpenses } from "@/src/actions/expenses"
import { getVaccinations, getTreatments } from "@/src/actions/health"
import { getMedicineStocks } from "@/src/actions/stock"
import { getBatchProfitability, type BatchProfitability } from "@/src/actions/profitability"
import { FeatureGateCard } from "@/src/components/subscription/FeatureGateCard"
import { getFeatureUpgradeMessage } from "@/src/lib/subscriptions"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { getAIPolicy, listStoredBatchAnalyses } from "@/src/lib/ai"
import { getBatchMarginInsight, getBatchMortalityInsight } from "@/src/actions/predictive"
import {
  getBatchOperationalSnapshot,
  hasMissingBatchSaisie,
} from "@/src/lib/batch-metrics"
import { gateHasFullAccess, resolveEntitlementGate } from "@/src/lib/gate-resolver"
import { FREE_HISTORY_LIMIT } from "@/src/lib/entitlements"
import { getPremiumSurfaceCopy } from "@/src/lib/premium-surface-copy"
import { track } from "@/src/lib/analytics"
import prisma from "@/src/lib/prisma"
import { getAdjustedCurveForBatch } from "@/src/lib/feed-reference"
import { BatchHeader } from "./_components/BatchHeader"
import { BatchMarginProjectionCard } from "./_components/BatchMarginProjectionCard"
import { BatchMortalityPredictionCard } from "./_components/BatchMortalityPredictionCard"
import { BatchAIAnalysisCard } from "./_components/BatchAIAnalysisCard"
import { BatchKpis } from "./_components/BatchKpis"
import { FeedReferencePanel, type FeedReferencePanelPoint } from "./_components/FeedReferencePanel"
import { ProfitabilityCard } from "./_components/ProfitabilityCard"
import { ProfitabilityPreviewCard } from "./_components/ProfitabilityPreviewCard"
import { RecentDailyRecords } from "./_components/RecentDailyRecords"
import { HealthSection } from "./_components/HealthSection"
import { RecentExpenses } from "./_components/RecentExpenses"
import { BatchLocalHistory } from "./_components/BatchLocalHistory"

export const metadata: Metadata = { title: "Détail du lot" }

function formatChartDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-SN", {
    day: "2-digit",
    month: "2-digit",
  }).format(date)
}

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
  const aiPolicy = getAIPolicy(subscription)
  const canUseBatchAI = aiPolicy.enabled
  const canShowPredictiveCards = batch.status === "ACTIVE"

  const [
    recordsResult,
    expensesResult,
    vaccinationsResult,
    treatmentsResult,
    medicineStocksResult,
    previousAnalyses,
    eggProductionAgg,
  ] = await Promise.all([
    getDailyRecords({ organizationId, batchId: id, limit: 100 }),
    getExpenses({ organizationId, batchId: id, limit: 100 }),
    getVaccinations({ organizationId, batchId: id, limit: 10 }),
    getTreatments({ organizationId, batchId: id, limit: 10 }),
    getMedicineStocks({ organizationId, farmId: batch.building.farmId, limit: 100 }),
    listStoredBatchAnalyses(organizationId, id, 5),
    prisma.eggProductionRecord.aggregate({
      where: { batchId: id, organizationId },
      _sum: {
        totalEggs: true,
        sellableEggs: true,
      },
    }),
  ])

  const records = recordsResult.success ? recordsResult.data : []
  const expenses = expensesResult.success ? expensesResult.data : []
  const vaccinations = vaccinationsResult.success ? vaccinationsResult.data : []
  const treatments = treatmentsResult.success ? treatmentsResult.data : []
  const medicineStocks = medicineStocksResult.success ? medicineStocksResult.data : []

  const totalMortality = records.reduce((sum, record) => sum + record.mortality, 0)
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

  const hasDecisionData =
    records.length >= 3 &&
    (expenses.length > 0 || batch._count.saleItems > 0 || totalMortality > 0)
  const totalEggsProduced = eggProductionAgg._sum.totalEggs ?? 0
  const totalSellableEggs = eggProductionAgg._sum.sellableEggs ?? 0
  const feedRecordsForPanel = [...records]
    .filter((record) => record.feedKg > 0)
    .sort((left, right) => left.date.getTime() - right.date.getTime())
  const manualFeedRecordCount = feedRecordsForPanel.filter((record) => record.dataSource === "MANUAL_KG").length
  const estimatedFeedRecordCount = feedRecordsForPanel.filter((record) => record.dataSource === "ESTIMATED_FROM_BAG").length
  const totalFeedRecordCount = feedRecordsForPanel.length
  const manualFeedSharePct =
    totalFeedRecordCount > 0
      ? Math.round((manualFeedRecordCount / totalFeedRecordCount) * 100)
      : null
  const estimatedFeedSharePct =
    totalFeedRecordCount > 0
      ? Math.round((estimatedFeedRecordCount / totalFeedRecordCount) * 100)
      : null

  let feedReferencePoints: FeedReferencePanelPoint[] = []

  if (feedRecordsForPanel.length > 0 && batch.breed?.code) {
    const firstRecord = feedRecordsForPanel[0]
    const lastRecord = feedRecordsForPanel[feedRecordsForPanel.length - 1]
    const startAgeDay = batch.entryAgeDay + Math.max(
      0,
      Math.floor((firstRecord.date.getTime() - batch.entryDate.getTime()) / 86_400_000),
    )
    const endAgeDay = batch.entryAgeDay + Math.max(
      0,
      Math.floor((lastRecord.date.getTime() - batch.entryDate.getTime()) / 86_400_000),
    )

    const { curve } = await getAdjustedCurveForBatch(prisma, {
      batchId: batch.id,
      farmId: batch.building.farmId,
      batchType: batch.type as "CHAIR" | "PONDEUSE",
      breedCode: batch.breed.code,
      startAgeDay,
      endAgeDay,
    })

    const curveByAgeDay = new Map(curve.map((point) => [point.ageDay, point]))
    let cumulativeMortality = 0

    feedReferencePoints = feedRecordsForPanel.map((record) => {
      const ageDay = batch.entryAgeDay + Math.max(
        0,
        Math.floor((record.date.getTime() - batch.entryDate.getTime()) / 86_400_000),
      )
      const liveBirdsEstimate = Math.max(1, batch.entryCount - cumulativeMortality)
      cumulativeMortality += record.mortality

      const referencePoint = curveByAgeDay.get(ageDay)
      const referenceKg = referencePoint
        ? Math.round((referencePoint.dailyFeedGPerBird * liveBirdsEstimate) / 10) / 100
        : null

      return {
        id: record.id,
        label: formatChartDate(record.date),
        date: record.date.toISOString(),
        ageDay,
        actualKg: record.feedKg,
        referenceKg,
        actualGPerBird:
          liveBirdsEstimate > 0
            ? Math.round((record.feedKg * 1000) / liveBirdsEstimate * 10) / 10
            : null,
        referenceGPerBird: referencePoint?.dailyFeedGPerBird ?? null,
        source: record.dataSource,
        confidence: record.estimationConfidence,
      }
    })
  }

  const hasBreakEvenData =
    hasDecisionData &&
    (batch.type !== "PONDEUSE" || totalSellableEggs > 0)
  const profitabilityGate = resolveEntitlementGate(subscription, "REAL_PROFITABILITY", {
    hasMinimumData: hasDecisionData,
    previewEnabled: hasDecisionData,
  })
  const breakEvenGate = resolveEntitlementGate(subscription, "BREAK_EVEN_PRICE", {
    hasMinimumData: hasBreakEvenData,
    previewEnabled: hasBreakEvenData,
  })
  const mortalityGate = resolveEntitlementGate(subscription, "PREDICTIVE_HEALTH_ALERTS", {
    hasMinimumData: canShowPredictiveCards && records.length >= 3,
  })
  const marginGate = resolveEntitlementGate(subscription, "PREDICTIVE_MARGIN_ALERTS", {
    hasMinimumData: canShowPredictiveCards && records.length >= 3,
  })
  const historyGate = resolveEntitlementGate(subscription, "FULL_HISTORY")

  const [profitabilityResult, mortalityInsightResult, marginInsightResult] = await Promise.all([
    gateHasFullAccess(profitabilityGate) || gateHasFullAccess(breakEvenGate)
      ? getBatchProfitability({ organizationId, batchId: id })
      : Promise.resolve<ActionResult<BatchProfitability>>(
          actionFailure(getFeatureUpgradeMessage("PROFITABILITY"), {
            code: "PLAN_UPGRADE_REQUIRED",
            status: 403,
          }),
        ),
    gateHasFullAccess(mortalityGate) && canShowPredictiveCards
      ? getBatchMortalityInsight(organizationId, id)
      : Promise.resolve<ActionResult<Awaited<ReturnType<typeof getBatchMortalityInsight>> extends { success: true; data: infer T } ? T : never>>(
          actionFailure(getFeatureUpgradeMessage("PREDICTIVE_HEALTH_ALERTS"), {
            code: "PLAN_UPGRADE_REQUIRED",
            status: 403,
          }),
        ),
    gateHasFullAccess(marginGate) && canShowPredictiveCards
      ? getBatchMarginInsight(organizationId, id)
      : Promise.resolve<ActionResult<Awaited<ReturnType<typeof getBatchMarginInsight>> extends { success: true; data: infer T } ? T : never>>(
          actionFailure(getFeatureUpgradeMessage("PREDICTIVE_MARGIN_ALERTS"), {
            code: "PLAN_UPGRADE_REQUIRED",
            status: 403,
          }),
        ),
  ])

  const profitability = profitabilityResult.success ? profitabilityResult.data : null
  const mortalityInsight = mortalityInsightResult.success ? mortalityInsightResult.data : null
  const marginInsight = marginInsightResult.success ? marginInsightResult.data : null
  const profitabilityCopy = getPremiumSurfaceCopy("profitability", profitabilityGate.access)
  const marginCopy = getPremiumSurfaceCopy("margin", marginGate.access)
  const mortalityCopy = getPremiumSurfaceCopy("mortality", mortalityGate.access)

  // ── Tracking paywalls ──────────────────────────────────────────────────────
  const trackCtx = { userId: session.user.id, organizationId, plan: subscription.commercialPlan }
  if (!gateHasFullAccess(profitabilityGate) && profitabilityGate.access !== "blocked") {
    void track({ ...trackCtx, event: "paywall_viewed", properties: { entitlement: "REAL_PROFITABILITY", surface: "batch_detail", access: profitabilityGate.access } })
  }
  if (!gateHasFullAccess(mortalityGate) && mortalityGate.access !== "blocked" && canShowPredictiveCards) {
    void track({ ...trackCtx, event: "paywall_viewed", properties: { entitlement: "PREDICTIVE_HEALTH_ALERTS", surface: "batch_detail", access: mortalityGate.access } })
  }
  if (!gateHasFullAccess(marginGate) && marginGate.access !== "blocked" && canShowPredictiveCards) {
    void track({ ...trackCtx, event: "paywall_viewed", properties: { entitlement: "PREDICTIVE_MARGIN_ALERTS", surface: "batch_detail", access: marginGate.access } })
  }
  if (!gateHasFullAccess(historyGate)) {
    void track({ ...trackCtx, event: "paywall_viewed", properties: { entitlement: "FULL_HISTORY", surface: "full_history", access: historyGate.access } })
  }

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

      <BatchLocalHistory
        batchId={batch.id}
        organizationId={organizationId}
        entryCount={batch.entryCount}
      />

      <FeedReferencePanel
        points={feedReferencePoints}
        manualFeedSharePct={manualFeedSharePct}
        estimatedFeedSharePct={estimatedFeedSharePct}
      />

      {mortalityInsight && (
        <BatchMortalityPredictionCard
          prediction={mortalityInsight.prediction}
          trend={mortalityInsight.trend}
        />
      )}

      {!mortalityInsight && canShowPredictiveCards && (
        <FeatureGateCard
          title={mortalityCopy.title}
          message={mortalityGate.reason}
          targetPlanLabel={mortalityGate.requiredPlanLabel}
          currentPlanLabel={subscription.currentPlanLabel}
          access={mortalityGate.access}
          ctaLabel={mortalityCopy.ctaLabel}
          highlights={mortalityCopy.highlights}
          footerHint={mortalityCopy.footerHint}
          trackingSurface="mortality"
        />
      )}

      {marginInsight && (
        <BatchMarginProjectionCard
          prediction={marginInsight.prediction}
          trend={marginInsight.trend}
        />
      )}

      {!marginInsight && canShowPredictiveCards && (
        <FeatureGateCard
          title={marginCopy.title}
          message={marginGate.reason}
          targetPlanLabel={marginGate.requiredPlanLabel}
          currentPlanLabel={subscription.currentPlanLabel}
          access={marginGate.access}
          ctaLabel={marginCopy.ctaLabel}
          highlights={marginCopy.highlights}
          footerHint={marginCopy.footerHint}
          trackingSurface="margin"
        />
      )}

      {profitability && (
        <ProfitabilityCard profitability={profitability} />
      )}

      {!profitability && profitabilityGate.access === "preview" && (
        <ProfitabilityPreviewCard
          commercialPlan={subscription.commercialPlan}
          batchType={batch.type}
          breakEvenAccess={breakEvenGate.access}
          entryCount={batch.entryCount}
          purchaseCostFcfa={batch.totalCostFcfa}
          operationalCostFcfa={expenses.reduce((sum, expense) => sum + expense.amountFcfa, 0)}
          totalMortality={totalMortality}
          totalEggsProduced={totalEggsProduced}
          totalSellableEggs={totalSellableEggs}
          recordsCount={records.length}
          expensesCount={expenses.length}
          saleItemsCount={batch._count.saleItems}
        />
      )}

      {!profitability && (
        <FeatureGateCard
          title={profitabilityCopy.title}
          message={
            breakEvenGate.access === "blocked" && profitabilityGate.access !== "blocked"
              ? `${profitabilityGate.reason} Le prix minimum exact s activera des que les donnees de vente ou d oeufs seront suffisantes.`
              : profitabilityGate.reason
          }
          targetPlanLabel={profitabilityGate.requiredPlanLabel}
          currentPlanLabel={subscription.currentPlanLabel}
          access={profitabilityGate.access}
          ctaLabel={profitabilityCopy.ctaLabel}
          highlights={profitabilityCopy.highlights}
          footerHint={
            profitabilityGate.access === "preview"
              ? breakEvenGate.access === "blocked"
                ? "Vous voyez la decision preview de marge. Continuez la saisie pour preparer le prix minimum, puis Pro debloquera les valeurs exactes."
                : "Vous voyez maintenant une decision preview. Pro debloque la marge exacte et le vrai prix minimum de vente."
              : profitabilityCopy.footerHint
          }
          trackingSurface="profitability"
        />
      )}

      <BatchAIAnalysisCard
        organizationId={organizationId}
        batchId={batch.id}
        planLabel={subscription.currentPlanLabel}
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
        records={records.slice(0, FREE_HISTORY_LIMIT)}
        batchId={batch.id}
        historyLocked={historyGate.access !== "full"}
        totalRecordsCount={records.length}
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
