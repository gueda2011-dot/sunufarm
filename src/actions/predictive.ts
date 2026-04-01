"use server"

import prisma from "@/src/lib/prisma"
import { requireOrganizationModuleContext } from "@/src/lib/auth"
import { forbidden } from "@/src/lib/action-result"
import {
  computeFeedStockFeatures,
  computeMedicineStockFeatures,
} from "@/src/lib/predictive-features"
import {
  predictFeedStockRupture,
  predictMedicineStockRupture,
  type StockRupturePrediction,
} from "@/src/lib/predictive-rules"
import { hasPlanFeature } from "@/src/lib/subscriptions"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"

const WINDOW_DAYS = 14

export interface StockPredictionsResult {
  feed: Record<string, StockRupturePrediction>
  medicine: Record<string, StockRupturePrediction>
}

/**
 * Calcule les prédictions de rupture pour tous les stocks aliment et médicament
 * d'une organisation, sur une fenêtre de 14 jours de consommation.
 *
 * Sécurité : requireSession + requireMembership(organizationId) + accès module STOCK.
 * Multi-tenant : toutes les requêtes Prisma filtrent par organizationId.
 */
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
    const windowStart = new Date()
    windowStart.setDate(windowStart.getDate() - WINDOW_DAYS)
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

    const feedPredictions: Record<string, StockRupturePrediction> = {}
    for (const stock of feedStocks) {
      const features = computeFeedStockFeatures(
        stock.id,
        stock.quantityKg,
        feedSorties.map((m) => ({
          feedStockId: m.feedStockId,
          quantityKg: m.quantityKg,
          date: m.date,
        })),
        WINDOW_DAYS,
      )
      feedPredictions[stock.id] = predictFeedStockRupture(features)
    }

    const medicinePredictions: Record<string, StockRupturePrediction> = {}
    for (const stock of medicineStocks) {
      const features = computeMedicineStockFeatures(
        stock.id,
        stock.quantityOnHand,
        stock.unit,
        medicineSorties.map((m) => ({
          medicineStockId: m.medicineStockId,
          quantity: m.quantity,
          date: m.date,
        })),
        WINDOW_DAYS,
      )
      medicinePredictions[stock.id] = predictMedicineStockRupture(features)
    }

    return {
      success: true,
      data: { feed: feedPredictions, medicine: medicinePredictions },
    }
  } catch {
    return { success: false, error: "Erreur lors du calcul des predictions" }
  }
}

// ---------------------------------------------------------------------------
// Tendances de stock
// ---------------------------------------------------------------------------

export interface StockTrendsResult {
  feed: Record<string, import("@/src/lib/predictive-snapshots").StockTrendResult>
  medicine: Record<string, import("@/src/lib/predictive-snapshots").StockTrendResult>
}

/**
 * Retourne les tendances (improving / stable / degrading / unknown) des stocks
 * à partir des snapshots des 7 derniers jours.
 *
 * Sécurité : requireSession + requireMembership(organizationId) + accès module STOCK.
 */
export async function getStockTrends(
  organizationId: string,
): Promise<{ success: true; data: StockTrendsResult } | { success: false; error: string }> {
  const accessResult = await requireOrganizationModuleContext(organizationId, "STOCK")
  if (!accessResult.success) return accessResult

  // Pas de gate plan ici — les tendances sont visibles dès que les snapshots existent.
  // Les snapshots eux-mêmes ne sont créés que si PREDICTIVE_STOCK_ALERTS est actif.

  try {
    const { getOrganizationStockTrends } = await import("@/src/lib/predictive-snapshots")
    const [feedTrends, medicineTrends] = await Promise.all([
      getOrganizationStockTrends(prisma, organizationId, "FEED_STOCK", 7),
      getOrganizationStockTrends(prisma, organizationId, "MEDICINE_STOCK", 7),
    ])

    return {
      success: true,
      data: {
        feed:     Object.fromEntries(feedTrends),
        medicine: Object.fromEntries(medicineTrends),
      },
    }
  } catch {
    return { success: false, error: "Erreur lors du calcul des tendances" }
  }
}

/**
 * Version interne sans vérification auth — réservée au cron de notifications.
 * À appeler uniquement depuis des contextes serveur de confiance (cron, seed).
 */
export async function getStockPredictionsInternal(
  organizationId: string,
): Promise<StockPredictionsResult> {
  const windowStart = new Date()
  windowStart.setDate(windowStart.getDate() - WINDOW_DAYS)
  windowStart.setHours(0, 0, 0, 0)

  const [feedStocks, feedSorties, medicineStocks, medicineSorties] = await Promise.all([
    prisma.feedStock.findMany({
      where: { organizationId },
      select: { id: true, quantityKg: true, name: true },
    }),
    prisma.feedMovement.findMany({
      where: { organizationId, type: "SORTIE", date: { gte: windowStart } },
      select: { feedStockId: true, quantityKg: true, date: true },
    }),
    prisma.medicineStock.findMany({
      where: { organizationId },
      select: { id: true, quantityOnHand: true, unit: true, name: true },
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
      feedSorties.map((m) => ({ feedStockId: m.feedStockId, quantityKg: m.quantityKg, date: m.date })),
      WINDOW_DAYS,
    )
    feed[stock.id] = predictFeedStockRupture(features)
  }

  const medicine: Record<string, StockRupturePrediction> = {}
  for (const stock of medicineStocks) {
    const features = computeMedicineStockFeatures(
      stock.id,
      stock.quantityOnHand,
      stock.unit,
      medicineSorties.map((m) => ({ medicineStockId: m.medicineStockId, quantity: m.quantity, date: m.date })),
      WINDOW_DAYS,
    )
    medicine[stock.id] = predictMedicineStockRupture(features)
  }

  return { feed, medicine }
}
