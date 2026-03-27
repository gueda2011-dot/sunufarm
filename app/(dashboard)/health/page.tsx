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
import { getVaccinationSuggestions } from "@/src/lib/health-guidance"
import { HealthPageClient }               from "./_components/HealthPageClient"

export const metadata: Metadata = { title: "Santé animale" }

export default async function HealthPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const membership = await prisma.userOrganization.findFirst({
    where:   { userId: session.user.id },
    select:  { organizationId: true, role: true },
    orderBy: { organization: { name: "asc" } },
  })
  if (!membership) redirect("/login?error=no-org")

  const { organizationId } = membership

  // Fetch parallèle : vaccinations + traitements + map lots actifs
  const [vaccinationsResult, treatmentsResult, vaccinationPlansResult, batches] = await Promise.all([
    getVaccinations({ organizationId, limit: 30 }),
    getTreatments({ organizationId, limit: 30 }),
    getVaccinationPlans({ organizationId }),
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
  ])

  const vaccinations = vaccinationsResult.success ? vaccinationsResult.data : []
  const treatments   = treatmentsResult.success   ? treatmentsResult.data   : []
  const vaccinationPlans = vaccinationPlansResult.success ? vaccinationPlansResult.data : []

  // Map batchId → numéro de lot pour l'affichage
  const batchMap = Object.fromEntries(
    batches.map((b) => [b.id, { number: b.number, status: b.status }])
  )

  // KPIs
  const now       = new Date()
  const weekAgo   = new Date(now.getTime() - 7 * 86_400_000)
  const recentVax = vaccinations.filter((v) => new Date(v.date) >= weekAgo).length
  const activeTreatments = treatments.filter((t) => !t.endDate || new Date(t.endDate) >= now).length
  const batchAlerts = batches
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

  return (
    <HealthPageClient
      vaccinations={vaccinations}
      treatments={treatments}
      vaccinationPlans={vaccinationPlans}
      batchAlerts={batchAlerts}
      batchMap={batchMap}
      recentVaxCount={recentVax}
      activeTreatmentsCount={activeTreatments}
      totalVaxCount={vaccinations.length}
      totalTreatmentsCount={treatments.length}
    />
  )
}
