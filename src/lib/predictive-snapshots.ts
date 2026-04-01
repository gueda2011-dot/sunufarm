/**
 * SunuFarm — Persistence et tendance des snapshots predictifs
 *
 * Deux responsabilites :
 *   1. Upsert d'un snapshot par (org, type, entity, jour)
 *   2. Calcul de tendance a partir des N derniers snapshots
 */

import type { PrismaClient } from "@/src/generated/prisma/client"
import type { BatchMarginProjection } from "@/src/lib/predictive-margin-rules"
import type { BatchMortalityPrediction } from "@/src/lib/predictive-mortality-rules"
import type { StockRupturePrediction } from "@/src/lib/predictive-rules"

export const SNAPSHOT_MODEL_VERSION = "v1.0"

export type PredictionType = "FEED_STOCK" | "MEDICINE_STOCK" | "BATCH_MORTALITY" | "BATCH_MARGIN"

export type StockTrend = "degrading" | "stable" | "improving" | "unknown"

export interface SnapshotRecord {
  snapshotDate: Date
  alertLevel: string
  daysToStockout: number | null
}

export interface StockTrendResult {
  trend: StockTrend
  label: string
  deltaDays: number | null
}

export interface RiskTrendResult {
  trend: StockTrend
  label: string
  deltaScore: number | null
}

export interface MarginTrendResult {
  trend: StockTrend
  label: string
  deltaMarginRate: number | null
}

export function computeStockTrend(snapshots: SnapshotRecord[]): StockTrendResult {
  if (snapshots.length < 2) {
    return { trend: "unknown", label: "Pas assez de donnees", deltaDays: null }
  }

  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime(),
  )
  const oldest = sorted[0]
  const recent = sorted[sorted.length - 1]

  if (oldest.daysToStockout === null && recent.daysToStockout === null) {
    return { trend: "stable", label: "Stable", deltaDays: null }
  }

  if (oldest.daysToStockout === null || recent.daysToStockout === null) {
    return { trend: "unknown", label: "Donnees partielles", deltaDays: null }
  }

  const deltaDays = recent.daysToStockout - oldest.daysToStockout
  const rounded = Math.round(deltaDays * 10) / 10

  if (deltaDays > 1.0) return { trend: "improving", label: "En amelioration", deltaDays: rounded }
  if (deltaDays < -1.0) return { trend: "degrading", label: "En degradation", deltaDays: rounded }
  return { trend: "stable", label: "Stable", deltaDays: rounded }
}

export function computeRiskScoreTrend(
  scores: Array<{ snapshotDate: Date; riskScore: number | null }>,
): RiskTrendResult {
  if (scores.length < 2) {
    return { trend: "unknown", label: "Pas assez de donnees", deltaScore: null }
  }

  const sorted = [...scores].sort(
    (a, b) => new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime(),
  )
  const oldest = sorted[0]
  const recent = sorted[sorted.length - 1]

  if (oldest.riskScore === null || recent.riskScore === null) {
    return { trend: "unknown", label: "Donnees partielles", deltaScore: null }
  }

  const deltaScore = Math.round((recent.riskScore - oldest.riskScore) * 10) / 10
  if (deltaScore >= 5) return { trend: "degrading", label: "En degradation", deltaScore }
  if (deltaScore <= -5) return { trend: "improving", label: "En amelioration", deltaScore }
  return { trend: "stable", label: "Stable", deltaScore }
}

export function computeMarginRateTrend(
  points: Array<{ snapshotDate: Date; marginRate: number | null }>,
): MarginTrendResult {
  if (points.length < 2) {
    return { trend: "unknown", label: "Pas assez de donnees", deltaMarginRate: null }
  }

  const sorted = [...points].sort(
    (a, b) => new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime(),
  )
  const oldest = sorted[0]
  const recent = sorted[sorted.length - 1]

  if (oldest.marginRate === null || recent.marginRate === null) {
    return { trend: "unknown", label: "Donnees partielles", deltaMarginRate: null }
  }

  const deltaMarginRate = Math.round((recent.marginRate - oldest.marginRate) * 10) / 10
  if (deltaMarginRate >= 3) return { trend: "improving", label: "En amelioration", deltaMarginRate }
  if (deltaMarginRate <= -3) return { trend: "degrading", label: "En degradation", deltaMarginRate }
  return { trend: "stable", label: "Stable", deltaMarginRate }
}

export interface UpsertSnapshotInput {
  organizationId: string
  predictionType: PredictionType
  entityId: string
  prediction: StockRupturePrediction | BatchMortalityPrediction | BatchMarginProjection
  snapshotDate?: Date
}

export async function upsertPredictiveSnapshot(
  prisma: PrismaClient,
  input: UpsertSnapshotInput,
): Promise<void> {
  const date = input.snapshotDate ?? new Date()
  const snapshotDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))

  const isBatchMortality = input.predictionType === "BATCH_MORTALITY"
  const isBatchMargin = input.predictionType === "BATCH_MARGIN"
  const stockPrediction = input.prediction as StockRupturePrediction
  const batchPrediction = input.prediction as BatchMortalityPrediction
  const marginPrediction = input.prediction as BatchMarginProjection

  const sharedData = {
    alertLevel: input.prediction.alertLevel,
    label: input.prediction.label,
    modelVersion: SNAPSHOT_MODEL_VERSION,
  }

  await prisma.predictiveSnapshot.upsert({
    where: {
      organizationId_predictionType_entityId_snapshotDate: {
        organizationId: input.organizationId,
        predictionType: input.predictionType,
        entityId: input.entityId,
        snapshotDate,
      },
    },
    create: {
      organizationId: input.organizationId,
      predictionType: input.predictionType,
      entityId: input.entityId,
      snapshotDate,
      ...sharedData,
      daysToStockout: isBatchMortality || isBatchMargin ? null : stockPrediction.daysToStockout,
      estimatedRuptureDate: isBatchMortality || isBatchMargin ? null : stockPrediction.estimatedRuptureDate,
      avgDailyConsumption: isBatchMortality || isBatchMargin ? 0 : stockPrediction.avgDailyConsumption,
      unit: isBatchMortality ? "score" : isBatchMargin ? "fcfa" : stockPrediction.unit,
      features: isBatchMortality
        ? {
            riskScore: batchPrediction.riskScore,
            summary: batchPrediction.summary,
            reasons: batchPrediction.reasons,
            metrics: batchPrediction.metrics,
          }
        : isBatchMargin
          ? {
              projectedProfitFcfa: marginPrediction.projectedProfitFcfa,
              projectedMarginRate: marginPrediction.projectedMarginRate,
              projectedRevenueFcfa: marginPrediction.projectedRevenueFcfa,
              projectedTotalCostFcfa: marginPrediction.projectedTotalCostFcfa,
              summary: marginPrediction.summary,
              reasons: marginPrediction.reasons,
              confidence: marginPrediction.confidence,
              metrics: marginPrediction.metrics,
            }
        : {
            avgDailyConsumption: stockPrediction.avgDailyConsumption,
            unit: stockPrediction.unit,
          },
    },
    update: {
      ...sharedData,
      daysToStockout: isBatchMortality || isBatchMargin ? null : stockPrediction.daysToStockout,
      estimatedRuptureDate: isBatchMortality || isBatchMargin ? null : stockPrediction.estimatedRuptureDate,
      avgDailyConsumption: isBatchMortality || isBatchMargin ? 0 : stockPrediction.avgDailyConsumption,
      unit: isBatchMortality ? "score" : isBatchMargin ? "fcfa" : stockPrediction.unit,
      features: isBatchMortality
        ? {
            riskScore: batchPrediction.riskScore,
            summary: batchPrediction.summary,
            reasons: batchPrediction.reasons,
            metrics: batchPrediction.metrics,
          }
        : isBatchMargin
          ? {
              projectedProfitFcfa: marginPrediction.projectedProfitFcfa,
              projectedMarginRate: marginPrediction.projectedMarginRate,
              projectedRevenueFcfa: marginPrediction.projectedRevenueFcfa,
              projectedTotalCostFcfa: marginPrediction.projectedTotalCostFcfa,
              summary: marginPrediction.summary,
              reasons: marginPrediction.reasons,
              confidence: marginPrediction.confidence,
              metrics: marginPrediction.metrics,
            }
        : {
            avgDailyConsumption: stockPrediction.avgDailyConsumption,
            unit: stockPrediction.unit,
          },
    },
  })
}

export async function upsertOrganizationSnapshots(
  prisma: PrismaClient,
  organizationId: string,
  feedPredictions: Record<string, StockRupturePrediction>,
  medicinePredictions: Record<string, StockRupturePrediction>,
  snapshotDate?: Date,
): Promise<number> {
  let count = 0

  for (const [entityId, prediction] of Object.entries(feedPredictions)) {
    await upsertPredictiveSnapshot(prisma, {
      organizationId,
      predictionType: "FEED_STOCK",
      entityId,
      prediction,
      snapshotDate,
    })
    count++
  }

  for (const [entityId, prediction] of Object.entries(medicinePredictions)) {
    await upsertPredictiveSnapshot(prisma, {
      organizationId,
      predictionType: "MEDICINE_STOCK",
      entityId,
      prediction,
      snapshotDate,
    })
    count++
  }

  return count
}

export async function upsertOrganizationBatchMortalitySnapshots(
  prisma: PrismaClient,
  organizationId: string,
  predictions: Record<string, BatchMortalityPrediction>,
  snapshotDate?: Date,
): Promise<number> {
  let count = 0

  for (const [entityId, prediction] of Object.entries(predictions)) {
    await upsertPredictiveSnapshot(prisma, {
      organizationId,
      predictionType: "BATCH_MORTALITY",
      entityId,
      prediction,
      snapshotDate,
    })
    count++
  }

  return count
}

export async function upsertOrganizationBatchMarginSnapshots(
  prisma: PrismaClient,
  organizationId: string,
  predictions: Record<string, BatchMarginProjection>,
  snapshotDate?: Date,
): Promise<number> {
  let count = 0

  for (const [entityId, prediction] of Object.entries(predictions)) {
    await upsertPredictiveSnapshot(prisma, {
      organizationId,
      predictionType: "BATCH_MARGIN",
      entityId,
      prediction,
      snapshotDate,
    })
    count++
  }

  return count
}

export async function getOrganizationStockTrends(
  prisma: PrismaClient,
  organizationId: string,
  predictionType: Extract<PredictionType, "FEED_STOCK" | "MEDICINE_STOCK">,
  lookbackDays = 7,
): Promise<Map<string, StockTrendResult>> {
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - lookbackDays)
  since.setUTCHours(0, 0, 0, 0)

  const snapshots = await prisma.predictiveSnapshot.findMany({
    where: {
      organizationId,
      predictionType,
      snapshotDate: { gte: since },
    },
    select: {
      entityId: true,
      snapshotDate: true,
      alertLevel: true,
      daysToStockout: true,
    },
    orderBy: { snapshotDate: "asc" },
  })

  const grouped = new Map<string, SnapshotRecord[]>()
  for (const snap of snapshots) {
    const list = grouped.get(snap.entityId) ?? []
    list.push({
      snapshotDate: snap.snapshotDate,
      alertLevel: snap.alertLevel,
      daysToStockout: snap.daysToStockout,
    })
    grouped.set(snap.entityId, list)
  }

  const trends = new Map<string, StockTrendResult>()
  for (const [entityId, snaps] of grouped.entries()) {
    trends.set(entityId, computeStockTrend(snaps))
  }

  return trends
}

export async function getBatchMortalityTrend(
  prisma: PrismaClient,
  organizationId: string,
  batchId: string,
  lookbackDays = 7,
): Promise<RiskTrendResult> {
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - lookbackDays)
  since.setUTCHours(0, 0, 0, 0)

  const snapshots = await prisma.predictiveSnapshot.findMany({
    where: {
      organizationId,
      predictionType: "BATCH_MORTALITY",
      entityId: batchId,
      snapshotDate: { gte: since },
    },
    select: {
      snapshotDate: true,
      features: true,
    },
    orderBy: { snapshotDate: "asc" },
  })

  return computeRiskScoreTrend(
    snapshots.map((snapshot) => {
      const features = snapshot.features as { riskScore?: unknown } | null
      return {
        snapshotDate: snapshot.snapshotDate,
        riskScore: typeof features?.riskScore === "number" ? features.riskScore : null,
      }
    }),
  )
}

export async function getBatchMarginTrend(
  prisma: PrismaClient,
  organizationId: string,
  batchId: string,
  lookbackDays = 7,
): Promise<MarginTrendResult> {
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - lookbackDays)
  since.setUTCHours(0, 0, 0, 0)

  const snapshots = await prisma.predictiveSnapshot.findMany({
    where: {
      organizationId,
      predictionType: "BATCH_MARGIN",
      entityId: batchId,
      snapshotDate: { gte: since },
    },
    select: {
      snapshotDate: true,
      features: true,
    },
    orderBy: { snapshotDate: "asc" },
  })

  return computeMarginRateTrend(
    snapshots.map((snapshot) => {
      const features = snapshot.features as { projectedMarginRate?: unknown } | null
      return {
        snapshotDate: snapshot.snapshotDate,
        marginRate: typeof features?.projectedMarginRate === "number" ? features.projectedMarginRate : null,
      }
    }),
  )
}
