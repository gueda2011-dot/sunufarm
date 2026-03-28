/**
 * SunuFarm - API route: export PDF d'un lot
 *
 * GET /api/reports/batch/[id]
 */

import { type NextRequest } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import React from "react"
import { auth } from "@/src/auth"
import { getBatchProfitability } from "@/src/actions/profitability"
import { BatchReportDocument } from "@/src/components/pdf/BatchReportDocument"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { apiError } from "@/src/lib/api-response"
import { getBatchOperationalSnapshot } from "@/src/lib/batch-metrics"
import { getSunuFarmLogoDataUri } from "@/src/lib/branding.server"
import { logger } from "@/src/lib/logger"
import { hasModuleAccess } from "@/src/lib/permissions"
import prisma from "@/src/lib/prisma"
import { getRequestId } from "@/src/lib/request-security"
import { hasPlanFeature } from "@/src/lib/subscriptions"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"

export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req.headers)
  try {
    const session = await auth()
    if (!session?.user?.id) {
      logger.warn("reports.batch.unauthenticated", { requestId })
      return apiError("Non authentifie", { status: 401, code: "UNAUTHENTICATED" })
    }

    const { id: batchId } = await params
    const { activeMembership } = await getCurrentOrganizationContext(session.user.id)

    if (!activeMembership) {
      logger.warn("reports.batch.org_not_found", {
        requestId,
        userId: session.user.id,
      })
      return apiError("Organisation introuvable", { status: 403, code: "ORG_NOT_FOUND" })
    }

    if (!hasModuleAccess(activeMembership.role, activeMembership.modulePermissions, "REPORTS")) {
      logger.warn("reports.batch.module_denied", {
        requestId,
        userId: session.user.id,
        organizationId: activeMembership.organizationId,
        batchId,
      })
      return apiError("Acces refuse au module REPORTS.", {
        status: 403,
        code: "MODULE_ACCESS_DENIED",
      })
    }

    const { organizationId } = activeMembership

    const [batch, records, orgMembership] = await Promise.all([
      prisma.batch.findFirst({
        where: { id: batchId, organizationId, deletedAt: null },
        select: {
          id: true,
          number: true,
          type: true,
          status: true,
          entryDate: true,
          entryCount: true,
          entryAgeDay: true,
          totalCostFcfa: true,
          closedAt: true,
          closeReason: true,
          building: {
            select: {
              name: true,
              farm: { select: { name: true } },
            },
          },
        },
      }),
      prisma.dailyRecord.findMany({
        where: { batchId, batch: { organizationId } },
        orderBy: { date: "desc" },
        take: 10,
        select: {
          date: true,
          mortality: true,
          feedKg: true,
          waterLiters: true,
          observations: true,
        },
      }),
      prisma.userOrganization.findFirst({
        where: { userId: session.user.id, organizationId },
        select: { organization: { select: { name: true } } },
      }),
    ])

    if (!batch) {
      logger.warn("reports.batch.not_found", {
        requestId,
        userId: session.user.id,
        organizationId,
        batchId,
      })
      return apiError("Lot introuvable", { status: 404, code: "BATCH_NOT_FOUND" })
    }

    const subscription = await getOrganizationSubscription(organizationId)
    const canSeeProfitability = hasPlanFeature(subscription.plan, "PROFITABILITY")
    const profitabilityResult = canSeeProfitability
      ? await getBatchProfitability({ organizationId, batchId })
      : null
    const profitability = profitabilityResult?.success
      ? profitabilityResult.data
      : null

    const mortalityAgg = await prisma.dailyRecord.aggregate({
      where: { batchId, batch: { organizationId } },
      _sum: { mortality: true, feedKg: true },
    })

    const totalFeedKg = mortalityAgg._sum.feedKg ?? 0
    const snapshot = getBatchOperationalSnapshot({
      entryDate: batch.entryDate,
      entryAgeDay: batch.entryAgeDay,
      entryCount: batch.entryCount,
      status: batch.status,
      closedAt: batch.closedAt,
      totalMortality: mortalityAgg._sum.mortality ?? 0,
    })

    const orgName = orgMembership?.organization.name ?? "SunuFarm"

    const doc = React.createElement(BatchReportDocument, {
      orgName,
      batchNumber: batch.number,
      batchType: batch.type,
      batchStatus: batch.status,
      farmName: batch.building.farm.name,
      buildingName: batch.building.name,
      entryDate: batch.entryDate,
      entryCount: batch.entryCount,
      closedAt: batch.closedAt ?? null,
      closeReason: batch.closeReason ?? null,
      ageDay: snapshot.ageDay,
      totalMortality: snapshot.totalMortality,
      mortalityRate: snapshot.mortalityRatePct,
      liveCount: snapshot.liveCount,
      totalFeedKg,
      profitability,
      recentRecords: records,
      generatedAt: new Date(),
      logoSrc: await getSunuFarmLogoDataUri(),
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(doc as any)
    const filename = `lot-${batch.number.replace(/[^a-zA-Z0-9-]/g, "-")}.pdf`

    logger.info("reports.batch.generated", {
      requestId,
      userId: session.user.id,
      organizationId,
      batchId,
      canSeeProfitability,
    })

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    logger.error("reports.batch.failed", {
      requestId,
      error,
    })
    return apiError("Erreur lors de la generation du PDF", {
      status: 500,
      code: "PDF_GENERATION_FAILED",
    })
  }
}
