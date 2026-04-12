import { auth } from "@/src/auth"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { apiError } from "@/src/lib/api-response"
import { logger } from "@/src/lib/logger"
import { hasModuleAccess } from "@/src/lib/permissions"
import { getRequestId } from "@/src/lib/request-security"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { getBusinessDashboardOverview } from "@/src/actions/business"
import { gateHasFullAccess, resolveEntitlementGate } from "@/src/lib/gate-resolver"
import { track } from "@/src/lib/analytics"
import {
  buildBusinessReportCsv,
  buildBusinessReportWorkbook,
} from "@/src/lib/business-reports"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const requestId = getRequestId(request.headers)

  try {
    const session = await auth()
    if (!session?.user?.id) {
      logger.warn("reports.business.unauthenticated", { requestId })
      return apiError("Non authentifie", { status: 401, code: "UNAUTHENTICATED" })
    }

    const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
    if (!activeMembership) {
      logger.warn("reports.business.org_not_found", {
        requestId,
        userId: session.user.id,
      })
      return apiError("Organisation introuvable", { status: 404, code: "ORG_NOT_FOUND" })
    }

    if (!hasModuleAccess(activeMembership.role, activeMembership.modulePermissions, "DASHBOARD")) {
      logger.warn("reports.business.module_denied", {
        requestId,
        userId: session.user.id,
        organizationId: activeMembership.organizationId,
      })
      return apiError("Acces refuse au module DASHBOARD.", {
        status: 403,
        code: "MODULE_ACCESS_DENIED",
      })
    }

    const subscription = await getOrganizationSubscription(activeMembership.organizationId)
    const businessGate = resolveEntitlementGate(subscription, "GLOBAL_DASHBOARD")
    if (!gateHasFullAccess(businessGate)) {
      logger.warn("reports.business.plan_upgrade_required", {
        requestId,
        userId: session.user.id,
        organizationId: activeMembership.organizationId,
        plan: subscription.commercialPlan,
      })
      return apiError(businessGate.reason, {
        status: 403,
        code: "PLAN_UPGRADE_REQUIRED",
      })
    }

    const { searchParams } = new URL(request.url)
    const format = (searchParams.get("format") ?? "xlsx").toLowerCase()
    const allowedFormats = new Set(["xlsx", "csv"])

    if (!allowedFormats.has(format)) {
      logger.warn("reports.business.invalid_format", {
        requestId,
        userId: session.user.id,
        organizationId: activeMembership.organizationId,
        format,
      })
      return apiError("Format d'export Business invalide.", {
        status: 400,
        code: "INVALID_BUSINESS_EXPORT_FORMAT",
      })
    }

    const overviewResult = await getBusinessDashboardOverview(activeMembership.organizationId)
    if (!overviewResult.success) {
      logger.warn("reports.business.overview_failed", {
        requestId,
        userId: session.user.id,
        organizationId: activeMembership.organizationId,
      })
      return apiError(overviewResult.error, {
        status: 400,
        code: "BUSINESS_OVERVIEW_FAILED",
      })
    }

    const generatedAt = new Date()
    const organizationName = activeMembership.organization.name
    const fileStem = `sunufarm-business-${organizationName.toLowerCase().replace(/\s+/g, "-")}-${generatedAt.toISOString().slice(0, 10)}`

    logger.info("reports.business.generated", {
      requestId,
      userId: session.user.id,
      organizationId: activeMembership.organizationId,
      format,
    })

    void track({
      userId: session.user.id,
      organizationId: activeMembership.organizationId,
      event: "export_launched",
      plan: subscription.commercialPlan,
      properties: { format, reportType: "business" },
    })

    if (format === "csv") {
      return new Response(
        buildBusinessReportCsv({
          organizationName,
          generatedAt,
          overview: overviewResult.data,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${fileStem}.csv"`,
            "Cache-Control": "no-store",
          },
        },
      )
    }

    const workbook = await buildBusinessReportWorkbook({
      organizationName,
      generatedAt,
      overview: overviewResult.data,
    })
    const buffer = await workbook.xlsx.writeBuffer()

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileStem}.xlsx"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    logger.error("reports.business.failed", {
      requestId,
      error,
    })
    return apiError("Erreur lors de la generation du rapport Business.", {
      status: 500,
      code: "BUSINESS_REPORT_FAILED",
    })
  }
}
