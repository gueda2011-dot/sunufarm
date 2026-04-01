/**
 * SunuFarm — Persistence et tendance des snapshots prédictifs
 *
 * Deux responsabilités :
 *   1. Upsert d'un snapshot par (org, type, entity, jour) — appelé par le cron
 *   2. Calcul de tendance à partir des N derniers snapshots — purement fonctionnel
 */

import type { PrismaClient } from "@/src/generated/prisma/client"
import type { StockRupturePrediction } from "@/src/lib/predictive-rules"

export const SNAPSHOT_MODEL_VERSION = "v1.0"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PredictionType = "FEED_STOCK" | "MEDICINE_STOCK"

export type StockTrend = "degrading" | "stable" | "improving" | "unknown"

export interface SnapshotRecord {
  snapshotDate: Date
  alertLevel: string
  daysToStockout: number | null
}

export interface StockTrendResult {
  trend: StockTrend
  /** Label court pour l'affichage UI */
  label: string
  /** Variation de daysToStockout entre le plus ancien et le plus récent snapshot */
  deltaDays: number | null
}

// ---------------------------------------------------------------------------
// Tendance — fonction pure
// ---------------------------------------------------------------------------

/**
 * Calcule la tendance d'un stock à partir de ses N derniers snapshots.
 *
 * Règles :
 *   - < 2 snapshots → "unknown"
 *   - deltaDays = recent.daysToStockout - oldest.daysToStockout
 *     (null si l'un des deux est null)
 *   - deltaDays > +1.0  → "improving"  (le stock dure plus longtemps)
 *   - deltaDays < -1.0  → "degrading"  (le stock se rapproche de la rupture)
 *   - entre -1.0 et 1.0 → "stable"
 *   - si les deux extrêmes sont null → "stable" (pas de conso connue, rien ne change)
 */
export function computeStockTrend(snapshots: SnapshotRecord[]): StockTrendResult {
  if (snapshots.length < 2) {
    return { trend: "unknown", label: "Pas assez de donnees", deltaDays: null }
  }

  // Trier du plus ancien au plus récent
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime(),
  )

  const oldest = sorted[0]
  const recent  = sorted[sorted.length - 1]

  if (oldest.daysToStockout === null && recent.daysToStockout === null) {
    return { trend: "stable", label: "Stable", deltaDays: null }
  }

  if (oldest.daysToStockout === null || recent.daysToStockout === null) {
    // Un seul extrême est null → tendance incalculable
    return { trend: "unknown", label: "Donnees partielles", deltaDays: null }
  }

  const deltaDays = recent.daysToStockout - oldest.daysToStockout
  const rounded   = Math.round(deltaDays * 10) / 10

  if (deltaDays > 1.0)  return { trend: "improving", label: "En amelioration",  deltaDays: rounded }
  if (deltaDays < -1.0) return { trend: "degrading",  label: "En degradation",   deltaDays: rounded }
  return                       { trend: "stable",     label: "Stable",            deltaDays: rounded }
}

// ---------------------------------------------------------------------------
// Persistence — upsert
// ---------------------------------------------------------------------------

export interface UpsertSnapshotInput {
  organizationId: string
  predictionType: PredictionType
  entityId: string
  prediction: StockRupturePrediction
  snapshotDate?: Date // défaut : aujourd'hui UTC
}

/**
 * Crée ou met à jour le snapshot du jour pour un stock donné.
 * Un seul snapshot par (org, type, entity, jour calendaire UTC).
 */
export async function upsertPredictiveSnapshot(
  prisma: PrismaClient,
  input: UpsertSnapshotInput,
): Promise<void> {
  const date = input.snapshotDate ?? new Date()
  // Normaliser à minuit UTC pour la clé de déduplication
  const snapshotDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))

  const { prediction } = input

  await prisma.predictiveSnapshot.upsert({
    where: {
      organizationId_predictionType_entityId_snapshotDate: {
        organizationId:  input.organizationId,
        predictionType:  input.predictionType,
        entityId:        input.entityId,
        snapshotDate,
      },
    },
    create: {
      organizationId:      input.organizationId,
      predictionType:      input.predictionType,
      entityId:            input.entityId,
      snapshotDate,
      alertLevel:           prediction.alertLevel,
      daysToStockout:       prediction.daysToStockout,
      estimatedRuptureDate: prediction.estimatedRuptureDate,
      avgDailyConsumption:  prediction.avgDailyConsumption,
      unit:                 prediction.unit,
      label:                prediction.label,
      features: {
        avgDailyConsumption: prediction.avgDailyConsumption,
        unit:                prediction.unit,
      },
      modelVersion: SNAPSHOT_MODEL_VERSION,
    },
    update: {
      alertLevel:           prediction.alertLevel,
      daysToStockout:       prediction.daysToStockout,
      estimatedRuptureDate: prediction.estimatedRuptureDate,
      avgDailyConsumption:  prediction.avgDailyConsumption,
      unit:                 prediction.unit,
      label:                prediction.label,
      features: {
        avgDailyConsumption: prediction.avgDailyConsumption,
        unit:                prediction.unit,
      },
    },
  })
}

/**
 * Upsert tous les snapshots d'une organisation en une passe.
 * Appels séquentiels (pas de Promise.all) pour éviter la surcharge sur les petits plans Supabase.
 */
export async function upsertOrganizationSnapshots(
  prisma: PrismaClient,
  organizationId: string,
  feedPredictions:     Record<string, StockRupturePrediction>,
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

// ---------------------------------------------------------------------------
// Lecture des tendances — query helper
// ---------------------------------------------------------------------------

/**
 * Récupère les N derniers snapshots pour chaque stock d'une organisation
 * et calcule la tendance pour chacun.
 *
 * @param lookbackDays  Fenêtre de lecture en jours (défaut : 7)
 * @returns Map { entityId → StockTrendResult }
 */
export async function getOrganizationStockTrends(
  prisma: PrismaClient,
  organizationId: string,
  predictionType: PredictionType,
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
      entityId:      true,
      snapshotDate:  true,
      alertLevel:    true,
      daysToStockout: true,
    },
    orderBy: { snapshotDate: "asc" },
  })

  // Grouper par entityId
  const grouped = new Map<string, SnapshotRecord[]>()
  for (const snap of snapshots) {
    const list = grouped.get(snap.entityId) ?? []
    list.push({
      snapshotDate:   snap.snapshotDate,
      alertLevel:     snap.alertLevel,
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
