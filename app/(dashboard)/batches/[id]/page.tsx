import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"
import { getSession } from "@/src/lib/auth"
import prisma from "@/src/lib/prisma"
import { getBatch } from "@/src/actions/batches"
import { getDailyRecords } from "@/src/actions/daily-records"
import { getExpenses } from "@/src/actions/expenses"
import {
  getVaccinationPlans,
  getVaccinations,
  getTreatments,
} from "@/src/actions/health"
import { getMedicineStocks } from "@/src/actions/stock"
import { getBatchProfitability } from "@/src/actions/profitability"
import { ensurePoultryReferenceData } from "@/src/lib/poultry-reference-data"
import { getTemplateProductionTypeForBatchType } from "@/src/lib/poultry-reference"
import { isMissingSchemaFeatureError } from "@/src/lib/prisma-schema-guard"
import { batchAgeDay, diffDays } from "@/src/lib/utils"
import {
  buildPlannedVaccinationOccurrences,
  parseBatchVaccinationPlanLink,
} from "@/src/lib/vaccination-planning"
import { BatchHeader } from "./_components/BatchHeader"
import { BatchKpis } from "./_components/BatchKpis"
import { ProfitabilityCard } from "./_components/ProfitabilityCard"
import { RecentDailyRecords } from "./_components/RecentDailyRecords"
import { HealthSection } from "./_components/HealthSection"
import { RecentExpenses } from "./_components/RecentExpenses"
import { VaccinationPlanningSection } from "./_components/VaccinationPlanningSection"

export const metadata: Metadata = { title: "Detail du lot" }

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await getSession()
  if (!session?.user?.id) redirect("/login")

  const memberships = await prisma.userOrganization.findMany({
    where: session.isImpersonating
      ? {
          userId: session.effectiveUserId,
          organizationId: session.impersonatedOrganizationId ?? undefined,
        }
      : {
          userId: session.effectiveUserId,
        },
    select: { organizationId: true, role: true },
    orderBy: { organization: { name: "asc" } },
  })
  if (memberships.length === 0) redirect("/login?error=no-org")

  const { organizationId, role } = memberships[0]
  const now = new Date()
  await ensurePoultryReferenceData()

  const [
    batchResult,
    recordsResult,
    expensesResult,
    vaccinationsResult,
    treatmentsResult,
    batchFarmResult,
    profitabilityResult,
  ] = await Promise.all([
    getBatch({ organizationId, batchId: id }),
    getDailyRecords({ organizationId, batchId: id, limit: 100 }),
    getExpenses({ organizationId, batchId: id, limit: 100 }),
    getVaccinations({ organizationId, batchId: id, limit: 10 }),
    getTreatments({ organizationId, batchId: id, limit: 10 }),
    prisma.batch.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: { building: { select: { farmId: true } } },
    }),
    getBatchProfitability({ organizationId, batchId: id }),
  ])

  if (!batchResult.success) {
    if (batchResult.error === "Lot introuvable") {
      notFound()
    }

    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {batchResult.error}
        </div>
      </div>
    )
  }

  const batch = batchResult.data
  const records = recordsResult.success ? recordsResult.data : []
  const expenses = expensesResult.success ? expensesResult.data : []
  const vaccinations = vaccinationsResult.success ? vaccinationsResult.data : []
  const treatments = treatmentsResult.success ? treatmentsResult.data : []
  const profitability = profitabilityResult.success
    ? profitabilityResult.data
    : null
  const batchFarmId = batchFarmResult?.building.farmId ?? null
  const vaccinationPlansResult = await getVaccinationPlans({
    organizationId,
    batchType: batch.type,
  })
  const vaccinationPlans = vaccinationPlansResult.success
    ? vaccinationPlansResult.data
    : []

  let vaccinationPlanTemplates: Array<{
    id: string
    name: string
    productionType: "BROILER" | "LAYER"
  }> = []
  let templateReferenceUnavailable = false

  const expectedTemplateProductionType =
    getTemplateProductionTypeForBatchType(batch.type)

  if (expectedTemplateProductionType) {
    try {
      vaccinationPlanTemplates = await prisma.vaccinationPlanTemplate.findMany({
        where: {
          isActive: true,
          productionType: expectedTemplateProductionType,
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          productionType: true,
        },
      })
    } catch (error) {
      if (
        isMissingSchemaFeatureError(error, [
          "VaccinationPlanTemplate",
          "VaccinationPlanTemplateItem",
        ])
      ) {
        templateReferenceUnavailable = true
      } else {
        throw error
      }
    }
  }

  const medicineStocksResult = batchFarmId
    ? await getMedicineStocks({ organizationId, farmId: batchFarmId })
    : { success: true as const, data: [] }
  const medicineStocks = medicineStocksResult.success
    ? medicineStocksResult.data
    : []

  const totalMortality = records.reduce((sum, record) => sum + record.mortality, 0)
  const liveCount = Math.max(0, batch.entryCount - totalMortality)
  const mortalityRate =
    batch.entryCount > 0 ? (totalMortality / batch.entryCount) * 100 : 0

  const lastRecordDate = records[0]?.date ?? null
  const daysSinceEntry = diffDays(batch.entryDate, now)
  const daysSinceLast = lastRecordDate
    ? diffDays(lastRecordDate, now)
    : Number.POSITIVE_INFINITY
  const missingSaisie =
    batch.status === "ACTIVE" && daysSinceEntry > 1 && daysSinceLast > 1

  const ageDay = batchAgeDay(
    batch.entryDate,
    batch.entryAgeDay,
    batch.status === "ACTIVE" ? now : (batch.closedAt ?? now),
  )

  const planLink = parseBatchVaccinationPlanLink(batch.notes)
  const selectedVaccinationPlan =
    vaccinationPlans.find((plan) => plan.id === planLink.planId) ?? null
  const plannedVaccinations = selectedVaccinationPlan
    ? buildPlannedVaccinationOccurrences({
        batchId: batch.id,
        entryDate: new Date(batch.entryDate),
        entryAgeDay: batch.entryAgeDay,
        now,
        plan: selectedVaccinationPlan,
        vaccinations,
      })
    : []

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

      {profitability ? <ProfitabilityCard profitability={profitability} /> : null}

      <RecentDailyRecords records={records.slice(0, 7)} batchId={batch.id} />

      <HealthSection
        vaccinations={vaccinations}
        treatments={treatments}
        batchId={batch.id}
        organizationId={organizationId}
        userRole={role as string}
        entryDate={new Date(batch.entryDate)}
        entryCount={batch.entryCount}
        medicineStocks={medicineStocks.map((stock) => ({
          id: stock.id,
          name: stock.name,
          unit: stock.unit,
          quantityOnHand: stock.quantityOnHand,
        }))}
      />

      <VaccinationPlanningSection
        organizationId={organizationId}
        batchId={batch.id}
        batchType={batch.type}
        userRole={role as string}
        plans={vaccinationPlans}
        templates={vaccinationPlanTemplates}
        templateReferenceUnavailable={templateReferenceUnavailable}
        selectedPlanId={selectedVaccinationPlan?.id ?? null}
        occurrences={plannedVaccinations}
      />

      <RecentExpenses expenses={expenses.slice(0, 5)} batchId={batch.id} />
    </div>
  )
}
