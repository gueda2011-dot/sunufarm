import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { auth } from "@/src/auth"
import { getBatches } from "@/src/actions/batches"
import { getEggRecords } from "@/src/actions/eggs"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
import prisma from "@/src/lib/prisma"
import { EggsClient, type LayerBatchMetric } from "./_components/EggsClient"

export const metadata: Metadata = { title: "Production d'oeufs" }

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export default async function EggsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")
  ensureModuleAccess(activeMembership, "EGGS")

  const { organizationId, role } = activeMembership

  const batchesResult = await getBatches({
    organizationId,
    status: "ACTIVE",
    type: "PONDEUSE",
    limit: 100,
  })

  const pondeuseBatches = batchesResult.success ? batchesResult.data : []
  const batchIds = pondeuseBatches.map((batch) => batch.id)

  const [recordsResult, mortalityRecords] = await Promise.all([
    getEggRecords({ organizationId, limit: 100 }),
    batchIds.length > 0
      ? prisma.dailyRecord.findMany({
          where: {
            organizationId,
            batchId: { in: batchIds },
          },
          select: {
            batchId: true,
            date: true,
            mortality: true,
          },
          orderBy: [{ batchId: "asc" }, { date: "asc" }],
        })
      : Promise.resolve([]),
  ])

  const initialRecords = recordsResult.success ? recordsResult.data : []

  const mortalityByBatch = new Map<
    string,
    Array<{ date: string; cumulativeMortality: number }>
  >()
  const cumulativeMortalityByBatch = new Map<string, number>()

  for (const record of mortalityRecords) {
    const nextCumulative =
      (cumulativeMortalityByBatch.get(record.batchId) ?? 0) + record.mortality
    cumulativeMortalityByBatch.set(record.batchId, nextCumulative)

    const checkpoints = mortalityByBatch.get(record.batchId) ?? []
    checkpoints.push({
      date: toDateKey(record.date),
      cumulativeMortality: nextCumulative,
    })
    mortalityByBatch.set(record.batchId, checkpoints)
  }

  const layerBatchMetrics: LayerBatchMetric[] = pondeuseBatches.map((batch) => {
    const cumulativeMortality = cumulativeMortalityByBatch.get(batch.id) ?? 0

    return {
      batchId: batch.id,
      entryCount: batch.entryCount,
      liveHensToday: Math.max(0, batch.entryCount - cumulativeMortality),
      mortalityCheckpoints: mortalityByBatch.get(batch.id) ?? [],
    }
  })

  return (
    <EggsClient
      organizationId={organizationId}
      userRole={role as string}
      pondeuseBatches={pondeuseBatches}
      initialRecords={initialRecords}
      layerBatchMetrics={layerBatchMetrics}
    />
  )
}
