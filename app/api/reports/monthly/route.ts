import { NextResponse } from "next/server"
import { auth } from "@/src/auth"
import prisma from "@/src/lib/prisma"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import {
  getFeatureUpgradeMessage,
  hasPlanFeature,
} from "@/src/lib/subscriptions"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"

function toCsvRow(values: Array<string | number>) {
  return values
    .map((value) => `"${String(value).replaceAll('"', '""')}"`)
    .join(",")
}

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

  const fromDate = new Date(year, month - 1, 1)
  const toDate = new Date(year, month, 0, 23, 59, 59)

  const [batches, expensesAgg, salesAgg, purchasesAgg, mortalityAgg, dailyRecordsCount] =
    await Promise.all([
      prisma.batch.findMany({
        where: {
          organizationId: activeMembership.organizationId,
          deletedAt: null,
          entryDate: { lte: toDate },
          OR: [{ status: "ACTIVE" }, { closedAt: { gte: fromDate } }],
        },
        select: {
          number: true,
          status: true,
          entryDate: true,
          entryCount: true,
          totalCostFcfa: true,
        },
        orderBy: { entryDate: "desc" },
      }),
      prisma.expense.aggregate({
        where: {
          organizationId: activeMembership.organizationId,
          date: { gte: fromDate, lte: toDate },
        },
        _sum: { amountFcfa: true },
      }),
      prisma.sale.aggregate({
        where: {
          organizationId: activeMembership.organizationId,
          saleDate: { gte: fromDate, lte: toDate },
        },
        _sum: { totalFcfa: true, paidFcfa: true },
      }),
      prisma.purchase.aggregate({
        where: {
          organizationId: activeMembership.organizationId,
          purchaseDate: { gte: fromDate, lte: toDate },
        },
        _sum: { totalFcfa: true },
      }),
      prisma.dailyRecord.aggregate({
        where: {
          batch: { organizationId: activeMembership.organizationId },
          date: { gte: fromDate, lte: toDate },
        },
        _sum: { mortality: true, feedKg: true },
      }),
      prisma.dailyRecord.count({
        where: {
          batch: { organizationId: activeMembership.organizationId },
          date: { gte: fromDate, lte: toDate },
        },
      }),
    ])

  const totalExpenses = expensesAgg._sum.amountFcfa ?? 0
  const totalSales = salesAgg._sum.totalFcfa ?? 0
  const totalPaid = salesAgg._sum.paidFcfa ?? 0
  const totalPurchases = purchasesAgg._sum.totalFcfa ?? 0
  const totalMortality = mortalityAgg._sum.mortality ?? 0
  const totalFeedKg = mortalityAgg._sum.feedKg ?? 0
  const netResult = totalSales - totalExpenses

  const lines = [
    toCsvRow(["Indicateur", "Valeur"]),
    toCsvRow(["Periode", `${String(month).padStart(2, "0")}/${year}`]),
    toCsvRow(["Revenus ventes FCFA", totalSales]),
    toCsvRow(["Encaissements FCFA", totalPaid]),
    toCsvRow(["Depenses FCFA", totalExpenses]),
    toCsvRow(["Achats fournisseurs FCFA", totalPurchases]),
    toCsvRow(["Resultat net FCFA", netResult]),
    toCsvRow(["Mortalite", totalMortality]),
    toCsvRow(["Aliment distribue kg", totalFeedKg]),
    toCsvRow(["Saisies journalieres", dailyRecordsCount]),
    "",
    toCsvRow(["Lots", "Statut", "Date entree", "Effectif", "Cout FCFA"]),
    ...batches.map((batch) =>
      toCsvRow([
        batch.number,
        batch.status,
        batch.entryDate.toISOString().slice(0, 10),
        batch.entryCount,
        batch.totalCostFcfa,
      ]),
    ),
  ]

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"sunufarm-rapport-${year}-${String(month).padStart(2, "0")}.csv\"`,
      "Cache-Control": "no-store",
    },
  })
}
