import { NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import React from "react"
import { auth } from "@/src/auth"
import { MonthlyReportDocument } from "@/src/components/pdf/MonthlyReportDocument"
import { getSunuFarmLogoDataUri } from "@/src/lib/branding.server"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import {
  buildMonthlyReportCsv,
  buildMonthlyReportWorkbook,
  getMonthlyReportData,
} from "@/src/lib/monthly-reports"
import {
  getFeatureUpgradeMessage,
  hasPlanFeature,
} from "@/src/lib/subscriptions"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifie" }, { status: 401 })
  }

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) {
    return NextResponse.json({ error: "Organisation introuvable" }, { status: 404 })
  }

  const subscription = await getOrganizationSubscription(activeMembership.organizationId)
  if (!hasPlanFeature(subscription.plan, "REPORTS")) {
    return NextResponse.json(
      { error: getFeatureUpgradeMessage("REPORTS") },
      { status: 403 },
    )
  }

  const { searchParams } = new URL(request.url)
  const now = new Date()
  const year = Number(searchParams.get("year") ?? now.getFullYear())
  const month = Number(searchParams.get("month") ?? now.getMonth() + 1)
  const format = (searchParams.get("format") ?? "xlsx").toLowerCase()

  const report = await getMonthlyReportData({
    organizationId: activeMembership.organizationId,
    year,
    month,
  })
  const fileStem = `sunufarm-rapport-${year}-${String(month).padStart(2, "0")}`

  if (format === "pdf") {
    const doc = React.createElement(MonthlyReportDocument, {
      report,
      logoSrc: await getSunuFarmLogoDataUri(),
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(doc as any)

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileStem}.pdf"`,
        "Cache-Control": "no-store",
      },
    })
  }

  if (format === "csv") {
    return new NextResponse(buildMonthlyReportCsv(report), {
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

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileStem}.xlsx"`,
      "Cache-Control": "no-store",
    },
  })
}
