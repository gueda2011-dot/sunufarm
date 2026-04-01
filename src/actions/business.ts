"use server"

import prisma from "@/src/lib/prisma"
import { forbidden } from "@/src/lib/action-result"
import { requireOrganizationModuleContext } from "@/src/lib/auth"
import {
  buildBusinessDashboardViewModel,
  type BusinessDashboardViewModel,
} from "@/src/lib/business-dashboard"
import { hasPlanFeature } from "@/src/lib/subscriptions"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import {
  getBatchMarginPredictionsInternal,
  getBatchMortalityPredictionsInternal,
  getStockPredictionsInternal,
} from "@/src/actions/predictive"
import {
  getBatchMarginTrend,
  getBatchMortalityTrend,
} from "@/src/lib/predictive-snapshots"

export async function getBusinessDashboardOverview(
  organizationId: string,
): Promise<{ success: true; data: BusinessDashboardViewModel } | { success: false; error: string }> {
  const accessResult = await requireOrganizationModuleContext(organizationId, "DASHBOARD")
  if (!accessResult.success) return accessResult

  const subscription = await getOrganizationSubscription(organizationId)
  if (!hasPlanFeature(subscription.plan, "GLOBAL_ANALYTICS")) {
    return forbidden("La vue Business transverse est reservee au plan Business.")
  }

  try {
    const [batches, feedStocks, medicineStocks, stockPredictions, mortalityPredictions, marginPredictions] = await Promise.all([
      prisma.batch.findMany({
        where: {
          organizationId,
          deletedAt: null,
          status: "ACTIVE",
        },
        select: {
          id: true,
          number: true,
          entryCount: true,
          totalCostFcfa: true,
          building: {
            select: {
              name: true,
              farm: { select: { name: true } },
            },
          },
          dailyRecords: {
            select: { mortality: true },
          },
          expenses: {
            select: { amountFcfa: true },
          },
          saleItems: {
            select: { totalFcfa: true },
          },
        },
        orderBy: { entryDate: "desc" },
      }),
      prisma.feedStock.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          farm: { select: { name: true } },
        },
      }),
      prisma.medicineStock.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          farm: { select: { name: true } },
        },
      }),
      getStockPredictionsInternal(organizationId),
      getBatchMortalityPredictionsInternal(organizationId),
      getBatchMarginPredictionsInternal(organizationId),
    ])

    const [mortalityTrends, marginTrends] = await Promise.all([
      Promise.all(batches.map(async (batch) => ([
        batch.id,
        await getBatchMortalityTrend(prisma, organizationId, batch.id, 7),
      ] as const))),
      Promise.all(batches.map(async (batch) => ([
        batch.id,
        await getBatchMarginTrend(prisma, organizationId, batch.id, 7),
      ] as const))),
    ])

    const mortalityTrendMap = new Map(mortalityTrends)
    const marginTrendMap = new Map(marginTrends)

    const viewModel = buildBusinessDashboardViewModel({
      batches: batches.flatMap((batch) => {
        const marginPrediction = marginPredictions[batch.id]
        const mortalityPrediction = mortalityPredictions[batch.id]
        if (!marginPrediction || !mortalityPrediction) return []

        const observedRevenueFcfa = batch.saleItems.reduce((sum, item) => sum + item.totalFcfa, 0)
        const observedOperationalCostFcfa = batch.expenses.reduce((sum, expense) => sum + expense.amountFcfa, 0)
        const totalMortality = batch.dailyRecords.reduce((sum, record) => sum + record.mortality, 0)

        return [{
          id: batch.id,
          number: batch.number,
          farmName: batch.building.farm.name,
          buildingName: batch.building.name,
          entryCount: batch.entryCount,
          observedRevenueFcfa,
          observedTotalCostFcfa: batch.totalCostFcfa + observedOperationalCostFcfa,
          totalMortality,
          marginPrediction,
          marginTrend: marginTrendMap.get(batch.id) ?? {
            trend: "unknown",
            label: "Pas assez de donnees",
            deltaMarginRate: null,
          },
          mortalityPrediction,
          mortalityTrend: mortalityTrendMap.get(batch.id) ?? {
            trend: "unknown",
            label: "Pas assez de donnees",
            deltaScore: null,
          },
        }]
      }),
      stockItems: [
        ...feedStocks.flatMap((stock) => {
          const prediction = stockPredictions.feed[stock.id]
          return prediction
            ? [{
                id: stock.id,
                name: stock.name,
                type: "feed" as const,
                farmName: stock.farm.name,
                prediction,
              }]
            : []
        }),
        ...medicineStocks.flatMap((stock) => {
          const prediction = stockPredictions.medicine[stock.id]
          return prediction
            ? [{
                id: stock.id,
                name: stock.name,
                type: "medicine" as const,
                farmName: stock.farm.name,
                prediction,
              }]
            : []
        }),
      ],
    })

    return { success: true, data: viewModel }
  } catch {
    return { success: false, error: "Impossible de charger la vue Business." }
  }
}
