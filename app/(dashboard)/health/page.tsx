/**
 * SunuFarm - Page Sante animale (Server Component)
 *
 * Vue organisation :
 * - priorites vaccinales actionnables sur les lots actifs
 * - historique recent des vaccinations et traitements
 * La creation se fait depuis le detail d'un lot.
 */

import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { BatchStatus } from "@/src/generated/prisma/client"
import { auth } from "@/src/auth"
import {
  getTreatments,
  getVaccinationPlans,
  getVaccinations,
} from "@/src/actions/health"
import { canPerformAction, parseFarmPermissions } from "@/src/lib/permissions"
import prisma from "@/src/lib/prisma"
import {
  buildPlannedVaccinationOccurrences,
  parseBatchVaccinationPlanLink,
} from "@/src/lib/vaccination-planning"
import { HealthPageClient } from "./_components/HealthPageClient"

export const metadata: Metadata = { title: "Sante animale" }

type BatchMapEntry = {
  number: string
  status: string
  farmName: string
}

type VaccinationActionItem = {
  batchId: string
  batchNumber: string
  batchStatus: string
  farmName: string
  vaccineName: string
  plannedDate: Date
  status: "A_FAIRE" | "EN_RETARD"
}

type BatchWithoutPlanItem = {
  batchId: string
  batchNumber: string
  batchStatus: string
  batchType: string
  farmName: string
  entryDate: Date
}

function dateOnlyValue(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function isSameUtcDay(left: Date, right: Date) {
  return dateOnlyValue(left) === dateOnlyValue(right)
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export default async function HealthPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const membership = await prisma.userOrganization.findFirst({
    where: { userId: session.user.id },
    select: { organizationId: true, role: true, farmPermissions: true },
    orderBy: { organization: { name: "asc" } },
  })
  if (!membership) redirect("/login?error=no-org")

  const { organizationId, role, farmPermissions } = membership
  const farmReadScope = canPerformAction(role, "MANAGE_FARMS")
    ? "all"
    : parseFarmPermissions(farmPermissions).filter((permission) => permission.canRead).map((permission) => permission.farmId)

  const batchWhere =
    farmReadScope === "all"
      ? { organizationId, deletedAt: null as null }
      : {
          organizationId,
          deletedAt: null as null,
          building: { farmId: { in: farmReadScope } },
        }

  const [vaccinationsResult, treatmentsResult, batches, plansResult] =
    await Promise.all([
      getVaccinations({ organizationId, limit: 30 }),
      getTreatments({ organizationId, limit: 30 }),
      prisma.batch.findMany({
        where: batchWhere,
        select: {
          id: true,
          number: true,
          status: true,
          type: true,
          entryDate: true,
          entryAgeDay: true,
          notes: true,
          building: {
            select: {
              farm: { select: { name: true } },
            },
          },
        },
        orderBy: { number: "asc" },
      }),
      getVaccinationPlans({ organizationId }),
    ])

  const vaccinations = vaccinationsResult.success ? vaccinationsResult.data : []
  const treatments = treatmentsResult.success ? treatmentsResult.data : []
  const plans = plansResult.success
    ? plansResult.data.filter((plan) => plan.isActive)
    : []

  const activeBatches = batches.filter((batch) => batch.status === BatchStatus.ACTIVE)

  const vaccinationRecords = activeBatches.length === 0
    ? []
    : await prisma.vaccinationRecord.findMany({
        where: {
          organizationId,
          batchId: { in: activeBatches.map((batch) => batch.id) },
        },
        select: {
          id: true,
          batchId: true,
          date: true,
          vaccineName: true,
        },
      })

  const vaccinationRecordsByBatch = vaccinationRecords.reduce<
    Map<string, Array<{
      id: string
      batchId: string
      date: Date
      vaccineName: string
    }>>
  >((acc, record) => {
    const current = acc.get(record.batchId) ?? []
    current.push(record)
    acc.set(record.batchId, current)
    return acc
  }, new Map())

  const batchMap = Object.fromEntries(
    batches.map((batch) => [
      batch.id,
      {
        number: batch.number,
        status: batch.status,
        farmName: batch.building.farm.name,
      } satisfies BatchMapEntry,
    ]),
  )

  const now = new Date()
  const upcomingThreshold = addUtcDays(now, 7)
  const overdueVaccinations: VaccinationActionItem[] = []
  const todayVaccinations: VaccinationActionItem[] = []
  const upcomingVaccinations: VaccinationActionItem[] = []
  const batchesWithoutPlan: BatchWithoutPlanItem[] = []

  for (const batch of activeBatches) {
    const linkedPlanId = parseBatchVaccinationPlanLink(batch.notes).planId
    const linkedPlan = linkedPlanId
      ? plans.find((plan) => plan.id === linkedPlanId) ?? null
      : null

    if (!linkedPlan) {
      batchesWithoutPlan.push({
        batchId: batch.id,
        batchNumber: batch.number,
        batchStatus: batch.status,
        batchType: batch.type,
        farmName: batch.building.farm.name,
        entryDate: batch.entryDate,
      })
      continue
    }

    const occurrences = buildPlannedVaccinationOccurrences({
      batchId: batch.id,
      entryDate: batch.entryDate,
      entryAgeDay: batch.entryAgeDay,
      now,
      plan: linkedPlan,
      vaccinations: vaccinationRecordsByBatch.get(batch.id) ?? [],
    })

    for (const occurrence of occurrences) {
      if (occurrence.status === "FAIT") continue

      const item: VaccinationActionItem = {
        batchId: batch.id,
        batchNumber: batch.number,
        batchStatus: batch.status,
        farmName: batch.building.farm.name,
        vaccineName: occurrence.vaccineName,
        plannedDate: occurrence.plannedDate,
        status: occurrence.status,
      }

      if (occurrence.status === "EN_RETARD") {
        overdueVaccinations.push(item)
        continue
      }

      if (isSameUtcDay(occurrence.plannedDate, now)) {
        todayVaccinations.push(item)
        continue
      }

      if (
        dateOnlyValue(occurrence.plannedDate) > dateOnlyValue(now) &&
        dateOnlyValue(occurrence.plannedDate) <= dateOnlyValue(upcomingThreshold)
      ) {
        upcomingVaccinations.push(item)
      }
    }
  }

  overdueVaccinations.sort(
    (left, right) => left.plannedDate.getTime() - right.plannedDate.getTime(),
  )
  todayVaccinations.sort(
    (left, right) => left.batchNumber.localeCompare(right.batchNumber),
  )
  upcomingVaccinations.sort(
    (left, right) => left.plannedDate.getTime() - right.plannedDate.getTime(),
  )
  batchesWithoutPlan.sort(
    (left, right) => left.batchNumber.localeCompare(right.batchNumber),
  )

  const weekAgo = new Date(now.getTime() - 7 * 86_400_000)
  const recentVax = vaccinations.filter((v) => new Date(v.date) >= weekAgo).length
  const activeTreatments = treatments.filter(
    (t) => !t.endDate || new Date(t.endDate) >= now,
  ).length

  return (
    <HealthPageClient
      vaccinations={vaccinations}
      treatments={treatments}
      batchMap={batchMap}
      recentVaxCount={recentVax}
      activeTreatmentsCount={activeTreatments}
      totalVaxCount={vaccinations.length}
      totalTreatmentsCount={treatments.length}
      overdueVaccinations={overdueVaccinations}
      todayVaccinations={todayVaccinations}
      upcomingVaccinations={upcomingVaccinations}
      batchesWithoutPlan={batchesWithoutPlan}
    />
  )
}
