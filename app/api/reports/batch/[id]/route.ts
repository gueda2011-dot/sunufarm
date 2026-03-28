/**
 * SunuFarm — API route : export PDF d'un lot
 *
 * GET /api/reports/batch/[id]
 *
 * Sécurité :
 *   - Session NextAuth obligatoire
 *   - Appartenance organisation vérifiée
 *   - Le lot doit appartenir à l'organisation
 *
 * Génère un PDF complet du lot via @react-pdf/renderer et le retourne
 * en streaming avec Content-Disposition: attachment.
 */

import { type NextRequest, NextResponse } from "next/server"
import { renderToBuffer }                 from "@react-pdf/renderer"
import React                              from "react"
import { auth }                           from "@/src/auth"
import prisma                             from "@/src/lib/prisma"
import { getBatchProfitability }          from "@/src/actions/profitability"
import { getSunuFarmLogoDataUri }         from "@/src/lib/branding.server"
import { hasPlanFeature }                 from "@/src/lib/subscriptions"
import { getOrganizationSubscription }    from "@/src/lib/subscriptions.server"
import { BatchReportDocument }            from "@/src/components/pdf/BatchReportDocument"

export const dynamic = "force-dynamic"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // ── Auth ─────────────────────────────────────────────────────────────
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
    }

    const { id: batchId } = await params

    // ── Organisation active ───────────────────────────────────────────────
    const membership = await prisma.userOrganization.findFirst({
      where:   { userId: session.user.id },
      select:  { organizationId: true },
      orderBy: { organization: { name: "asc" } },
    })
    if (!membership) {
      return NextResponse.json({ error: "Organisation introuvable" }, { status: 403 })
    }

    const { organizationId } = membership

    // ── Fetch lot + saisies en parallèle ──────────────────────────────────
    const [batch, records, orgMembership] = await Promise.all([
      prisma.batch.findFirst({
        where:  { id: batchId, organizationId, deletedAt: null },
        select: {
          id:            true,
          number:        true,
          type:          true,
          status:        true,
          entryDate:     true,
          entryCount:    true,
          entryAgeDay:   true,
          totalCostFcfa: true,
          closedAt:      true,
          closeReason:   true,
          building: {
            select: {
              name: true,
              farm: { select: { name: true } },
            },
          },
        },
      }),

      // 10 dernières saisies, date décroissante
      prisma.dailyRecord.findMany({
        where:   { batchId, batch: { organizationId } },
        orderBy: { date: "desc" },
        take:    10,
        select: {
          date:         true,
          mortality:    true,
          feedKg:       true,
          waterLiters:  true,
          observations: true,
        },
      }),

      prisma.userOrganization.findFirst({
        where:  { userId: session.user.id, organizationId },
        select: { organization: { select: { name: true } } },
      }),
    ])

    if (!batch) {
      return NextResponse.json({ error: "Lot introuvable" }, { status: 404 })
    }

    // ── Rentabilité (si plan l'autorise) ──────────────────────────────────
    const subscription = await getOrganizationSubscription(organizationId)
    const canSeeProfitability = hasPlanFeature(subscription.plan, "PROFITABILITY")

    const profitabilityResult = canSeeProfitability
      ? await getBatchProfitability({ organizationId, batchId })
      : null
    const profitability = profitabilityResult?.success
      ? profitabilityResult.data
      : null

    // ── Agrégations KPI ───────────────────────────────────────────────────
    const mortalityAgg = await prisma.dailyRecord.aggregate({
      where: { batchId, batch: { organizationId } },
      _sum:  { mortality: true, feedKg: true },
    })

    const totalMortality = mortalityAgg._sum.mortality ?? 0
    const totalFeedKg    = mortalityAgg._sum.feedKg    ?? 0
    const liveCount      = Math.max(0, batch.entryCount - totalMortality)
    const mortalityRate  = batch.entryCount > 0
      ? (totalMortality / batch.entryCount) * 100
      : 0

    const nowMs  = Date.now()
    const endMs  = batch.status === "ACTIVE"
      ? nowMs
      : new Date(batch.closedAt ?? nowMs).getTime()
    const ageDay = batch.entryAgeDay + Math.max(
      0,
      Math.floor((endMs - new Date(batch.entryDate).getTime()) / 86_400_000),
    )

    const orgName = orgMembership?.organization.name ?? "SunuFarm"

    // ── Génération PDF ─────────────────────────────────────────────────────
    const doc = React.createElement(BatchReportDocument, {
      orgName,
      batchNumber:    batch.number,
      batchType:      batch.type,
      batchStatus:    batch.status,
      farmName:       batch.building.farm.name,
      buildingName:   batch.building.name,
      entryDate:      batch.entryDate,
      entryCount:     batch.entryCount,
      closedAt:       batch.closedAt ?? null,
      closeReason:    batch.closeReason ?? null,
      ageDay,
      totalMortality,
      mortalityRate,
      liveCount,
      totalFeedKg,
      profitability,
      recentRecords:  records,
      generatedAt:    new Date(),
      logoSrc:        await getSunuFarmLogoDataUri(),
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(doc as any)

    const filename = `lot-${batch.number.replace(/[^a-zA-Z0-9-]/g, "-")}.pdf`

    return new NextResponse(new Uint8Array(buffer), {
      status:  200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control":       "no-store",
      },
    })
  } catch (err) {
    console.error("[PDF batch] Error:", err)
    return NextResponse.json(
      { error: "Erreur lors de la génération du PDF" },
      { status: 500 },
    )
  }
}
