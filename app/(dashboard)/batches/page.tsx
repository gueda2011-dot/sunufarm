import Link from "next/link"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { auth } from "@/src/auth"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { getMembership } from "@/src/lib/auth"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
import prisma from "@/src/lib/prisma"
import { getAccessibleFarmIds } from "@/src/lib/batch-rules"
import { BatchListClient } from "./_components/BatchListClient"

export const metadata: Metadata = { title: "Lots d'elevage" }
export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function BatchesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")
  ensureModuleAccess(activeMembership, "BATCHES")

  const { organizationId } = activeMembership
  const membership = await getMembership(session.user.id, organizationId)
  if (!membership) redirect("/start")

  const accessibleFarmIds = getAccessibleFarmIds(
    membership.role,
    membership.farmPermissions,
    "canRead",
  )

  const batches = accessibleFarmIds !== null && accessibleFarmIds.length === 0
    ? []
    : await prisma.batch.findMany({
        where: {
          organizationId,
          deletedAt: null,
          ...(accessibleFarmIds !== null
            ? { building: { farmId: { in: accessibleFarmIds } } }
            : {}),
        },
        select: {
          id: true,
          organizationId: true,
          buildingId: true,
          number: true,
          type: true,
          status: true,
          entryDate: true,
          entryCount: true,
          entryAgeDay: true,
          unitCostFcfa: true,
          totalCostFcfa: true,
          closedAt: true,
          createdAt: true,
          breed: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          building: {
            select: {
              id: true,
              name: true,
              farmId: true,
              farm: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          _count: {
            select: {
              dailyRecords: true,
            },
          },
        },
        orderBy: { entryDate: "desc" },
        take: 200,
      })

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lots d&apos;elevage</h1>
          <p className="mt-1 text-sm text-gray-500">
            Retrouver, filtrer et suivre tous les lots crees sur l&apos;exploitation.
          </p>
        </div>

        <Link
          href="/batches/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
        >
          + Nouveau lot
        </Link>
      </div>

      <BatchListClient organizationId={organizationId} initialBatches={batches} />
    </div>
  )
}
