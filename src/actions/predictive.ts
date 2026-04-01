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
