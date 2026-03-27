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
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
import { getDailyRecords }                from "@/src/actions/daily-records"
import { getExpenses }                    from "@/src/actions/expenses"
import { getVaccinations, getTreatments } from "@/src/actions/health"
import { getBatchProfitability, type BatchProfitability } from "@/src/actions/profitability"
import { PlanGuardCard }                  from "@/src/components/subscription/PlanGuardCard"
import { getFeatureUpgradeMessage, hasPlanFeature } from "@/src/lib/subscriptions"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { getAIPolicy, listStoredBatchAnalyses } from "@/src/lib/ai"
import { BatchHeader }                    from "./_components/BatchHeader"
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

  const { organizationId, role } = activeMembership
  const subscription = await getOrganizationSubscription(organizationId)
  const canSeeProfitability = hasPlanFeature(subscription.plan, "PROFITABILITY")
  const aiPolicy = getAIPolicy(subscription)
  const canUseBatchAI = aiPolicy.enabled

  // ── Fetch parallèle ──────────────────────────────────────────────────────
  // getBatch doit réussir pour afficher la page.
  // Les autres fetches dégradent gracieusement si ils échouent (tableaux vides).
  const [
    batchResult,
    recordsResult,
    expensesResult,
    vaccinationsResult,
    treatmentsResult,
    profitabilityResult,
    previousAnalyses,
  ] = await Promise.all([
    getBatch({ organizationId, batchId: id }),
    getDailyRecords({ organizationId, batchId: id, limit: 100 }),
    getExpenses({ organizationId, batchId: id, limit: 100 }),
    getVaccinations({ organizationId, batchId: id, limit: 10 }),
    getTreatments({ organizationId, batchId: id, limit: 10 }),
    canSeeProfitability
      ? getBatchProfitability({ organizationId, batchId: id })
      : Promise.resolve<ActionResult<BatchProfitability>>({
          success: false,
          error: getFeatureUpgradeMessage("PROFITABILITY"),
        }),
    listStoredBatchAnalyses(organizationId, id, 5),
  ])

  if (!batchResult.success) notFound()

  const batch         = batchResult.data
  const records       = recordsResult.success       ? recordsResult.data       : []
  const expenses      = expensesResult.success      ? expensesResult.data      : []
  const vaccinations  = vaccinationsResult.success  ? vaccinationsResult.data  : []
  const treatments    = treatmentsResult.success    ? treatmentsResult.data    : []
  const profitability = profitabilityResult.success ? profitabilityResult.data : null

  // ── Agrégations opérationnelles (calculées une fois, propagées en props) ─
  const totalMortality = records.reduce((s, r) => s + r.mortality, 0)
  const liveCount      = Math.max(0, batch.entryCount - totalMortality)
  const mortalityRate  = batch.entryCount > 0
    ? (totalMortality / batch.entryCount) * 100
    : 0

  // records est trié date desc par l'action getDailyRecords
  const lastRecordDate = records[0]?.date ?? null

  const nowMs = new Date().getTime()

  // Alerte "saisie manquante" : ACTIVE + lot > 1 jour + aucune saisie récente
  const daysSinceEntry = Math.floor(
    (nowMs - new Date(batch.entryDate).getTime()) / 86_400_000,
  )
  const daysSinceLast = lastRecordDate
    ? Math.floor((nowMs - new Date(lastRecordDate).getTime()) / 86_400_000)
    : Infinity
  const missingSaisie =
    batch.status === "ACTIVE" && daysSinceEntry > 1 && daysSinceLast > 1

  // Âge du lot : pour ACTIVE → aujourd'hui, pour terminé → à la date de clôture
  const endMs  = batch.status === "ACTIVE"
    ? nowMs
    : new Date(batch.closedAt ?? nowMs).getTime()
  const ageDay = batch.entryAgeDay + Math.max(
    0,
    Math.floor((endMs - new Date(batch.entryDate).getTime()) / 86_400_000),
  )

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BatchHeader
        batch={batch}
        ageDay={ageDay}
        missingSaisie={missingSaisie}
        userRole={role as string}
      />

      <BatchKpis
        liveCount={liveCount}
        totalMortality={totalMortality}
        mortalityRate={mortalityRate}
        lastRecordDate={lastRecordDate}
        isActive={batch.status === "ACTIVE"}
      />

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
        batchId={batch.id}
        organizationId={organizationId}
        userRole={role}
        entryDate={batch.entryDate}
        entryCount={batch.entryCount}
        batchType={batch.type}
        ageDay={ageDay}
      />

      <RecentExpenses
        expenses={expenses.slice(0, 5)}
        batchId={batch.id}
      />
    </div>
  )
}
