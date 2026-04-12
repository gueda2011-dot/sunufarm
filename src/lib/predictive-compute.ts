/**
 * SunuFarm — Fonctions de calcul prédictif (utilitaires internes)
 *
 * Ce module n'est PAS marqué "use server" intentionnellement.
 * Il expose des fonctions de calcul pur qui doivent être appelées depuis
 * des Server Actions ou des routes API déjà authentifiées et autorisées.
 *
 * Ne pas exporter depuis un fichier "use server" pour éviter qu'elles
 * soient accessibles directement comme Server Actions par les clients.
 */

import prisma from "@/src/lib/prisma"
import {
  computeFeedStockFeatures,
  computeMedicineStockFeatures,
} from "@/src/lib/predictive-features"
import { computeBatchMortalityFeatures } from "@/src/lib/predictive-mortality-features"
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

const STOCK_WINDOW_DAYS = 14
const MORTALITY_WINDOW_DAYS = 7

export interface StockPredictionsResult {
  feed: Record<string, StockRupturePrediction>
  medicine: Record<string, StockRupturePrediction>
}

export async function computeOrganizationStockPredictions(
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
      where: { organizationId, type: "SORTIE", date: { gte: windowStart } },
      select: { feedStockId: true, quantityKg: true, date: true },
    }),
    prisma.medicineStock.findMany({
      where: { organizationId },
      select: { id: true, quantityOnHand: true, unit: true },
    }),
    prisma.medicineMovement.findMany({
      where: { organizationId, type: "SORTIE", date: { gte: windowStart } },
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

export async function computeOrganizationBatchMortalityPredictions(
  organizationId: string,
): Promise<Record<string, BatchMortalityPrediction>> {
  const recentStart = new Date()
  recentStart.setDate(recentStart.getDate() - ((MORTALITY_WINDOW_DAYS * 2) - 1))
  recentStart.setHours(0, 0, 0, 0)

  const batches = await prisma.batch.findMany({
    where: { organizationId, deletedAt: null, status: "ACTIVE" },
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
      vaccinationRecords: { select: { vaccineName: true } },
      treatmentRecords: { select: { startDate: true, endDate: true } },
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

export async function computeOrganizationBatchMarginPredictions(
  organizationId: string,
): Promise<Record<string, BatchMarginProjection>> {
  const batches = await prisma.batch.findMany({
    where: { organizationId, deletedAt: null, status: "ACTIVE" },
    select: {
      id: true,
      type: true,
      entryDate: true,
      entryAgeDay: true,
      entryCount: true,
      totalCostFcfa: true,
      expenses: { select: { amountFcfa: true } },
      saleItems: { select: { totalFcfa: true } },
      dailyRecords: { select: { mortality: true } },
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
      expenses: { select: { amountFcfa: true } },
      saleItems: { select: { totalFcfa: true } },
      dailyRecords: { select: { mortality: true } },
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
    const avgMarginRate = normalized.length > 0
      ? Math.round(normalized.reduce((sum, item) => {
          const profit = item.revenueFcfa - item.totalCostFcfa
          const rate = item.totalCostFcfa > 0 ? (profit / item.totalCostFcfa) * 100 : 0
          return sum + rate
        }, 0) / normalized.length * 10) / 10
      : null

    benchmarkByType.set(type, {
      sampleSize,
      avgRevenuePerBirdFcfa: average(normalized.map((item) => item.revenuePerBirdFcfa)),
      avgOperationalCostPerDayFcfa: average(normalized.map((item) => item.operationalCostPerDayFcfa)),
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
