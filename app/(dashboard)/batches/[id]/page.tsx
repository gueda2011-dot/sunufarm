/**
 * SunuFarm — Détail d'un lot d'élevage (Server Component)
 *
 * Toutes les données sont chargées en parallèle (Promise.all) et les agrégations
 * calculées côté serveur avant de descendre en props simples vers les composants.
 * Pas de logique de calcul dans les enfants.
 *
 * Limites honnêtes documentées :
 *   - Revenus par lot : getSales ne filtre pas par batchId (lien affiché, total absent)
 *   - Effectif vivant : approximation entryCount - totalMortality (réformes non gérées au MVP)
 *   - totalMortality : agrégé depuis les 100 derniers records (suffisant pour MVP)
 */

import { notFound, redirect }          from "next/navigation"
import type { Metadata }               from "next"
import { auth }                        from "@/src/auth"
import prisma                          from "@/src/lib/prisma"
import { getBatch }                    from "@/src/actions/batches"
import { getDailyRecords }             from "@/src/actions/daily-records"
import { getExpenses }                 from "@/src/actions/expenses"
import { getVaccinations, getTreatments } from "@/src/actions/health"
import { BatchHeader }                 from "./_components/BatchHeader"
import { BatchKpis }                   from "./_components/BatchKpis"
import { RecentDailyRecords }          from "./_components/RecentDailyRecords"
import { HealthSection }               from "./_components/HealthSection"
import { RecentExpenses }              from "./_components/RecentExpenses"

export const metadata: Metadata = { title: "Détail du lot" }

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const membership = await prisma.userOrganization.findFirst({
    where:   { userId: session.user.id },
    select:  { organizationId: true, role: true },
    orderBy: { organization: { name: "asc" } },
  })
  if (!membership) redirect("/login?error=no-org")

  const { organizationId, role } = membership

  // ── Fetch parallèle ──────────────────────────────────────────────────────
  // getBatch doit réussir pour afficher la page.
  // Les autres fetches dégradent gracieusement si ils échouent (tableaux vides).
  const [
    batchResult,
    recordsResult,
    expensesResult,
    vaccinationsResult,
    treatmentsResult,
  ] = await Promise.all([
    getBatch({ organizationId, batchId: id }),
    getDailyRecords({ organizationId, batchId: id, limit: 100 }),
    getExpenses({ organizationId, batchId: id, limit: 100 }),
    getVaccinations({ organizationId, batchId: id, limit: 10 }),
    getTreatments({ organizationId, batchId: id, limit: 10 }),
  ])

  if (!batchResult.success) notFound()

  const batch        = batchResult.data
  const records      = recordsResult.success      ? recordsResult.data      : []
  const expenses     = expensesResult.success     ? expensesResult.data     : []
  const vaccinations = vaccinationsResult.success ? vaccinationsResult.data : []
  const treatments   = treatmentsResult.success   ? treatmentsResult.data   : []

  // ── Agrégations opérationnelles (calculées une fois, propagées en props) ─
  const totalMortality = records.reduce((s, r) => s + r.mortality, 0)
  const liveCount      = Math.max(0, batch.entryCount - totalMortality)
  const mortalityRate  = batch.entryCount > 0
    ? (totalMortality / batch.entryCount) * 100
    : 0

  // records est trié date desc par l'action getDailyRecords
  const lastRecordDate = records[0]?.date ?? null

  // Alerte "saisie manquante" : ACTIVE + lot > 1 jour + aucune saisie récente
  const daysSinceEntry = Math.floor(
    (Date.now() - new Date(batch.entryDate).getTime()) / 86_400_000,
  )
  const daysSinceLast = lastRecordDate
    ? Math.floor((Date.now() - new Date(lastRecordDate).getTime()) / 86_400_000)
    : Infinity
  const missingSaisie =
    batch.status === "ACTIVE" && daysSinceEntry > 1 && daysSinceLast > 1

  // Âge du lot : pour ACTIVE → aujourd'hui, pour terminé → à la date de clôture
  const endMs  = batch.status === "ACTIVE"
    ? Date.now()
    : new Date(batch.closedAt ?? new Date()).getTime()
  const ageDay = batch.entryAgeDay + Math.max(
    0,
    Math.floor((endMs - new Date(batch.entryDate).getTime()) / 86_400_000),
  )

  // ── Agrégations financières ───────────────────────────────────────────────
  const totalExpensesFcfa = expenses.reduce((s, e) => s + e.amountFcfa, 0)
  const totalChargesFcfa  = batch.totalCostFcfa + totalExpensesFcfa

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
        totalCostFcfa={batch.totalCostFcfa}
        unitCostFcfa={batch.unitCostFcfa}
        totalExpensesFcfa={totalExpensesFcfa}
        totalChargesFcfa={totalChargesFcfa}
        saleItemsCount={batch._count.saleItems}
        batchId={batch.id}
      />

      <RecentDailyRecords
        records={records.slice(0, 7)}
        batchId={batch.id}
      />

      <HealthSection
        vaccinations={vaccinations}
        treatments={treatments}
        batchId={batch.id}
      />

      <RecentExpenses
        expenses={expenses.slice(0, 5)}
        batchId={batch.id}
      />
    </div>
  )
}
