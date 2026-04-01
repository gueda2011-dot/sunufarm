"use server"

import prisma from "@/src/lib/prisma"
import { requireOrganizationModuleContext } from "@/src/lib/auth"
import { forbidden } from "@/src/lib/action-result"
import {
  computeFeedStockFeatures,
  computeMedicineStockFeatures,
} from "@/src/lib/predictive-features"
import {
  computeBatchMortalityFeatures,
} from "@/src/lib/predictive-mortality-features"
import {
  computeBatchMarginProjectionFeatures,
  type MarginBenchmarkFeatures,
} from "@/src/lib/predictive-margin-features"
import {
  predictBatchMarginProjection,
  type BatchMarginProjection,
} from "@/src/lib/predictive-margin-rules"
import {
  predictBatchMortalityRisk,
  type BatchMortalityPrediction,
} from "@/src/lib/predictive-mortality-rules"
import {
  predictFeedStockRupture,
  predictMedicineStockRupture,
  type StockRupturePrediction,
} from "@/src/lib/predictive-rules"
import { hasPlanFeature } from "@/src/lib/subscriptions"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import type {
  MarginTrendResult,
  RiskTrendResult,
  StockTrendResult,
} from "@/src/lib/predictive-snapshots"

const STOCK_WINDOW_DAYS = 14
const MORTALITY_WINDOW_DAYS = 7

export interface StockPredictionsResult {
  feed: Record<string, StockRupturePrediction>
  medicine: Record<string, StockRupturePrediction>
}

export interface StockTrendsResult {
  feed: Record<string, StockTrendResult>
  medicine: Record<string, StockTrendResult>
}

export interface BatchMortalityInsight {
  prediction: BatchMortalityPrediction
  trend: RiskTrendResult
}

export interface BatchMarginInsight {
  prediction: BatchMarginProjection
  trend: MarginTrendResult
}

async function computeOrganizationStockPredictions(
  organizationId: string,
): Promise<StockPredictionsResult> {
  const windowStart = new Date()
  windowStart.setDate(windowStart.getDate() - STOCK_WINDOW_DAYS)
  windowStart.setHours(0, 0, 0, 0)

  const [feedStocks, feedSorties, medicineStocks, medicineSorties] = await Promise.all([
    prisma.feedStock.findMany({
      where: { organizationId },
      select: { id: true, quantityKg: true },
    }),
    prisma.feedMovement.findMany({
      where: {
        organizationId,
        type: "SORTIE",
        date: { gte: windowStart },
      },
      select: { feedStockId: true, quantityKg: true, date: true },
    }),
    prisma.medicineStock.findMany({
      where: { organizationId },
      select: { id: true, quantityOnHand: true, unit: true },
    }),
    prisma.medicineMovement.findMany({
      where: {
        organizationId,
        type: "SORTIE",
        date: { gte: windowStart },
      },
      select: { medicineStockId: true, quantity: true, date: true },
    }),
  ])

  const feed: Record<string, StockRupturePrediction> = {}
  for (const stock of feedStocks) {
    const features = computeFeedStockFeatures(
      stock.id,
      stock.quantityKg,
      feedSorties.map((movement) => ({
        feedStockId: movement.feedStockId,
        quantityKg: movement.quantityKg,
        date: movement.date,
      })),
      STOCK_WINDOW_DAYS,
    )
    feed[stock.id] = predictFeedStockRupture(features)
  }

  const medicine: Record<string, StockRupturePrediction> = {}
  for (const stock of medicineStocks) {
    const features = computeMedicineStockFeatures(
      stock.id,
      stock.quantityOnHand,
      stock.unit,
      medicineSorties.map((movement) => ({
        medicineStockId: movement.medicineStockId,
        quantity: movement.quantity,
        date: movement.date,
      })),
      STOCK_WINDOW_DAYS,
    )
    medicine[stock.id] = predictMedicineStockRupture(features)
  }

  return { feed, medicine }
}

async function computeOrganizationBatchMortalityPredictions(
  organizationId: string,
): Promise<Record<string, BatchMortalityPrediction>> {
  const recentStart = new Date()
  recentStart.setDate(recentStart.getDate() - ((MORTALITY_WINDOW_DAYS * 2) - 1))
  recentStart.setHours(0, 0, 0, 0)

  const batches = await prisma.batch.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: "ACTIVE",
    },
    select: {
      id: true,
      type: true,
      entryCount: true,
      entryDate: true,
      entryAgeDay: true,
      dailyRecords: {
        where: { date: { gte: recentStart } },
        select: { date: true, mortality: true },
        orderBy: { date: "desc" },
      },
      vaccinationRecords: {
        select: { vaccineName: true },
      },
      treatmentRecords: {
        select: { startDate: true, endDate: true },
      },
    },
  })

  const predictions: Record<string, BatchMortalityPrediction> = {}
  for (const batch of batches) {
    const features = computeBatchMortalityFeatures({
      batchId: batch.id,
      batchType: batch.type,
      entryCount: batch.entryCount,
      entryDate: batch.entryDate,
      entryAgeDay: batch.entryAgeDay,
      dailyRecords: batch.dailyRecords,
      vaccinationRecords: batch.vaccinationRecords,
      treatmentRecords: batch.treatmentRecords,
      recentWindowDays: MORTALITY_WINDOW_DAYS,
    })
    predictions[batch.id] = predictBatchMortalityRisk(features)
  }

  return predictions
}

async function computeOrganizationBatchMarginPredictions(
  organizationId: string,
): Promise<Record<string, BatchMarginProjection>> {
  const batches = await prisma.batch.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: "ACTIVE",
    },
    select: {
      id: true,
      type: true,
      entryDate: true,
      entryAgeDay: true,
      entryCount: true,
      totalCostFcfa: true,
      expenses: {
        select: { amountFcfa: true },
      },
      saleItems: {
        select: { totalFcfa: true },
      },
      dailyRecords: {
        select: { mortality: true },
      },
    },
  })

  const comparableBatches = await prisma.batch.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { in: ["CLOSED", "SOLD", "SLAUGHTERED"] },
    },
    select: {
      id: true,
      type: true,
      entryCount: true,
      entryDate: true,
      entryAgeDay: true,
      closedAt: true,
      totalCostFcfa: true,
      expenses: {
        select: { amountFcfa: true },
      },
      saleItems: {
        select: { totalFcfa: true },
      },
      dailyRecords: {
        select: { mortality: true },
      },
    },
    orderBy: { entryDate: "desc" },
    take: 24,
  })

  const benchmarkByType = new Map<string, MarginBenchmarkFeatures>()
  for (const type of ["CHAIR", "PONDEUSE", "REPRODUCTEUR"] as const) {
    const candidates = comparableBatches.filter((batch) => batch.type === type)
    const normalized = candidates.flatMap((batch) => {
      const operationalCostFcfa = batch.expenses.reduce((sum, expense) => sum + expense.amountFcfa, 0)
      const revenueFcfa = batch.saleItems.reduce((sum, item) => sum + item.totalFcfa, 0)
      const totalMortality = batch.dailyRecords.reduce((sum, record) => sum + record.mortality, 0)
      const liveCount = Math.max(0, batch.entryCount - totalMortality)
      const cycleDays = Math.max(
        1,
        batch.closedAt
          ? Math.floor((batch.closedAt.getTime() - batch.entryDate.getTime()) / 86_400_000) + batch.entryAgeDay
          : batch.entryAgeDay || 1,
      )

      if (liveCount <= 0) return []

      return [{
        revenuePerBirdFcfa: revenueFcfa / liveCount,
        operationalCostPerDayFcfa: operationalCostFcfa / cycleDays,
        totalCostFcfa: batch.totalCostFcfa + operationalCostFcfa,
        revenueFcfa,
      }]
    })

    const sampleSize = normalized.length
    const average = (values: number[]) => (
      values.length > 0
        ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
        : null
    )
    const avgRevenuePerBirdFcfa = average(normalized.map((item) => item.revenuePerBirdFcfa))
    const avgOperationalCostPerDayFcfa = average(normalized.map((item) => item.operationalCostPerDayFcfa))
    const avgMarginRate = normalized.length > 0
      ? Math.round(normalized.reduce((sum, item) => {
          const profit = item.revenueFcfa - item.totalCostFcfa
          const rate = item.totalCostFcfa > 0 ? (profit / item.totalCostFcfa) * 100 : 0
          return sum + rate
        }, 0) / normalized.length * 10) / 10
      : null

    benchmarkByType.set(type, {
      sampleSize,
      avgRevenuePerBirdFcfa,
      avgOperationalCostPerDayFcfa,
      avgMarginRate,
    })
  }

  const predictions: Record<string, BatchMarginProjection> = {}
  for (const batch of batches) {
    const totalMortality = batch.dailyRecords.reduce((sum, record) => sum + record.mortality, 0)
    const liveCount = Math.max(0, batch.entryCount - totalMortality)
    const operationalCostFcfa = batch.expenses.reduce((sum, expense) => sum + expense.amountFcfa, 0)
    const revenueFcfa = batch.saleItems.reduce((sum, item) => sum + item.totalFcfa, 0)
    const features = computeBatchMarginProjectionFeatures({
      batchId: batch.id,
      batchType: batch.type,
      entryDate: batch.entryDate,
      entryAgeDay: batch.entryAgeDay,
      entryCount: batch.entryCount,
      liveCount,
      purchaseCostFcfa: batch.totalCostFcfa,
      operationalCostFcfa,
      revenueFcfa,
      totalMortality,
      benchmark: benchmarkByType.get(batch.type) ?? null,
    })
    predictions[batch.id] = predictBatchMarginProjection(features)
  }

  return predictions
}

export async function getStockPredictions(
  organizationId: string,
): Promise<{ success: true; data: StockPredictionsResult } | { success: false; error: string }> {
  const accessResult = await requireOrganizationModuleContext(organizationId, "STOCK")
  if (!accessResult.success) return accessResult

  const subscription = await getOrganizationSubscription(organizationId)
  if (!hasPlanFeature(subscription.plan, "PREDICTIVE_STOCK_ALERTS")) {
    return forbidden("Les alertes predictives de rupture stock sont disponibles a partir du plan Pro.")
  }

  try {
    return { success: true, data: await computeOrganizationStockPredictions(organizationId) }
  } catch {
    return { success: false, error: "Erreur lors du calcul des predictions" }
  }
}

export async function getStockTrends(
  organizationId: string,
): Promise<{ success: true; data: StockTrendsResult } | { success: false; error: string }> {
  const accessResult = await requireOrganizationModuleContext(organizationId, "STOCK")
  if (!accessResult.success) return accessResult

  try {
    const { getOrganizationStockTrends } = await import("@/src/lib/predictive-snapshots")
    const [feedTrends, medicineTrends] = await Promise.all([
      getOrganizationStockTrends(prisma, organizationId, "FEED_STOCK", 7),
      getOrganizationStockTrends(prisma, organizationId, "MEDICINE_STOCK", 7),
    ])

    return {
      success: true,
      data: {
        feed: Object.fromEntries(feedTrends),
        medicine: Object.fromEntries(medicineTrends),
      },
    }
  } catch {
    return { success: false, error: "Erreur lors du calcul des tendances" }
  }
}

export async function getBatchMortalityInsight(
  organizationId: string,
  batchId: string,
): Promise<{ success: true; data: BatchMortalityInsight } | { success: false; error: string }> {
  const accessResult = await requireOrganizationModuleContext(organizationId, "BATCHES")
  if (!accessResult.success) return accessResult

  const subscription = await getOrganizationSubscription(organizationId)
  if (!hasPlanFeature(subscription.plan, "PREDICTIVE_HEALTH_ALERTS")) {
    return forbidden("Les alertes predictives de mortalite sont disponibles a partir du plan Pro.")
  }

  try {
    const predictions = await computeOrganizationBatchMortalityPredictions(organizationId)
    const prediction = predictions[batchId]
    if (!prediction) {
      return { success: false, error: "Lot introuvable ou inactif" }
    }

    const { getBatchMortalityTrend } = await import("@/src/lib/predictive-snapshots")
    const trend = await getBatchMortalityTrend(prisma, organizationId, batchId, 7)

    return {
      success: true,
      data: {
        prediction,
        trend,
      },
    }
  } catch {
    return { success: false, error: "Erreur lors du calcul du risque mortalite" }
  }
}

export async function getBatchMarginInsight(
  organizationId: string,
  batchId: string,
): Promise<{ success: true; data: BatchMarginInsight } | { success: false; error: string }> {
  const accessResult = await requireOrganizationModuleContext(organizationId, "BATCHES")
  if (!accessResult.success) return accessResult

  const subscription = await getOrganizationSubscription(organizationId)
  if (!hasPlanFeature(subscription.plan, "PREDICTIVE_MARGIN_ALERTS")) {
    return forbidden("Les projections predictives de marge sont disponibles a partir du plan Pro.")
  }

  try {
    const predictions = await computeOrganizationBatchMarginPredictions(organizationId)
    const prediction = predictions[batchId]
    if (!prediction) {
      return { success: false, error: "Lot introuvable ou inactif" }
    }

    const { getBatchMarginTrend } = await import("@/src/lib/predictive-snapshots")
    const trend = await getBatchMarginTrend(prisma, organizationId, batchId, 7)

    return {
      success: true,
      data: {
        prediction,
        trend,
      },
    }
  } catch {
    return { success: false, error: "Erreur lors du calcul de la projection de marge" }
  }
}

export async function getStockPredictionsInternal(
  organizationId: string,
): Promise<StockPredictionsResult> {
  return computeOrganizationStockPredictions(organizationId)
}

export async function getBatchMortalityPredictionsInternal(
  organizationId: string,
): Promise<Record<string, BatchMortalityPrediction>> {
  return computeOrganizationBatchMortalityPredictions(organizationId)
}

export async function getBatchMarginPredictionsInternal(
  organizationId: string,
): Promise<Record<string, BatchMarginProjection>> {
  return computeOrganizationBatchMarginPredictions(organizationId)
}
