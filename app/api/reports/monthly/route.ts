import { renderToBuffer } from "@react-pdf/renderer"
import React from "react"
import { auth } from "@/src/auth"
import { MonthlyReportDocument } from "@/src/components/pdf/MonthlyReportDocument"
import { getSunuFarmLogoDataUri } from "@/src/lib/branding.server"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { apiError, parseBoundedIntegerParam } from "@/src/lib/api-response"
import { logger } from "@/src/lib/logger"
import { hasModuleAccess } from "@/src/lib/permissions"
import { getRequestId } from "@/src/lib/request-security"
import {
  buildMonthlyReportCsv,
  buildMonthlyReportWorkbook,
  getMonthlyReportData,
} from "@/src/lib/monthly-reports"
import {
  buildMonthlyReportsPreview,
  hasMonthlyReportsPreviewData,
} from "@/src/lib/reports-preview"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { gateHasFullAccess, resolveEntitlementGate } from "@/src/lib/gate-resolver"
import { track } from "@/src/lib/analytics"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const requestId = getRequestId(request.headers)
  try {
    const session = await auth()
    if (!session?.user?.id) {
      logger.warn("reports.monthly.unauthenticated", { requestId })
      return apiError("Non authentifie", { status: 401, code: "UNAUTHENTICATED" })
    }

    const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
    if (!activeMembership) {
      logger.warn("reports.monthly.org_not_found", {
        requestId,
        userId: session.user.id,
      })
      return apiError("Organisation introuvable", { status: 404, code: "ORG_NOT_FOUND" })
    }

    if (!hasModuleAccess(activeMembership.role, activeMembership.modulePermissions, "REPORTS")) {
      logger.warn("reports.monthly.module_denied", {
        requestId,
        userId: session.user.id,
        organizationId: activeMembership.organizationId,
      })
      return apiError("Acces refuse au module REPORTS.", {
        status: 403,
        code: "MODULE_ACCESS_DENIED",
      })
    }

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const year = parseBoundedIntegerParam({
      value: searchParams.get("year"),
      fallback: now.getFullYear(),
      minimum: 2020,
      maximum: now.getFullYear() + 1,
    })
    const month = parseBoundedIntegerParam({
      value: searchParams.get("month"),
      fallback: now.getMonth() + 1,
      minimum: 1,
      maximum: 12,
    })
    const format = (searchParams.get("format") ?? "xlsx").toLowerCase()
    const allowedFormats = new Set(["xlsx", "pdf", "csv"])

    if (year === null || month === null || !allowedFormats.has(format)) {
      logger.warn("reports.monthly.invalid_params", {
        requestId,
        userId: session.user.id,
        organizationId: activeMembership.organizationId,
      })
      return apiError("Parametres de rapport invalides.", {
        status: 400,
        code: "INVALID_REPORT_PARAMS",
      })
    }

    const report = await getMonthlyReportData({
      organizationId: activeMembership.organizationId,
      year,
      month,
    })
    const subscription = await getOrganizationSubscription(activeMembership.organizationId)
    const reportsPreviewEnabled = hasMonthlyReportsPreviewData(report)
    const reportsGate = resolveEntitlementGate(subscription, "ADVANCED_REPORTS", {
      hasMinimumData: reportsPreviewEnabled,
      previewEnabled: reportsPreviewEnabled,
    })
    const watermarkGate = resolveEntitlementGate(subscription, "EXPORT_WITHOUT_WATERMARK")
    const isStarterPreviewPdf =
      subscription.commercialPlan === "STARTER" &&
      reportsGate.access === "preview" &&
      format === "pdf"

    if (!gateHasFullAccess(reportsGate) && !isStarterPreviewPdf) {
      logger.warn("reports.monthly.plan_upgrade_required", {
        requestId,
        userId: session.user.id,
        organizationId: activeMembership.organizationId,
        plan: subscription.commercialPlan,
        access: reportsGate.access,
        format,
      })
      return apiError(reportsGate.reason, {
        status: 403,
        code: "PLAN_UPGRADE_REQUIRED",
      })
    }

    const fileStem = `sunufarm-rapport-${year}-${String(month).padStart(2, "0")}`

    logger.info("reports.monthly.generated", {
      requestId,
      userId: session.user.id,
      organizationId: activeMembership.organizationId,
      format,
      year,
      month,
    })

    void track({
      userId: session.user.id,
      organizationId: activeMembership.organizationId,
      event: "export_launched",
      plan: subscription.commercialPlan,
      properties: { format, reportType: "monthly", year, month, watermark: watermarkGate.watermark },
    })

    if (format === "pdf") {
      const previewModel = isStarterPreviewPdf
        ? buildMonthlyReportsPreview(report, subscription.commercialPlan)
        : undefined
      const doc = React.createElement(MonthlyReportDocument, {
        report,
        logoSrc: await getSunuFarmLogoDataUri(),
        previewModel,
        watermarkText: watermarkGate.watermark ? "STARTER - APERCU" : undefined,
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const buffer = await renderToBuffer(doc as any)

      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${fileStem}.pdf"`,
          "Cache-Control": "no-store",
        },
      })
    }

    if (format === "csv") {
      return new Response(buildMonthlyReportCsv(report), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${fileStem}.csv"`,
          "Cache-Control": "no-store",
        },
      })
    }

    const workbook = await buildMonthlyReportWorkbook(report)
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
    logger.error("reports.monthly.failed", {
      requestId,
      error,
    })
    return apiError("Erreur lors de la generation du rapport mensuel.", {
      status: 500,
      code: "MONTHLY_REPORT_FAILED",
    })
  }
}
