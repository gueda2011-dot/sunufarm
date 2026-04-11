"use server"

import prisma from "@/src/lib/prisma"
import { requireOrganizationModuleContext } from "@/src/lib/auth"
import { forbidden } from "@/src/lib/action-result"
import {
  computeOrganizationStockPredictions,
  computeOrganizationBatchMortalityPredictions,
  computeOrganizationBatchMarginPredictions,
  type StockPredictionsResult,
} from "@/src/lib/predictive-compute"
import type { BatchMarginProjection } from "@/src/lib/predictive-margin-rules"
import type { BatchMortalityPrediction } from "@/src/lib/predictive-mortality-rules"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { gateHasFullAccess, resolveEntitlementGate } from "@/src/lib/gate-resolver"
import type {
  MarginTrendResult,
  RiskTrendResult,
  StockTrendResult,
} from "@/src/lib/predictive-snapshots"

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

export async function getStockPredictions(
  organizationId: string,
): Promise<{ success: true; data: StockPredictionsResult } | { success: false; error: string }> {
  const accessResult = await requireOrganizationModuleContext(organizationId, "STOCK")
  if (!accessResult.success) return accessResult

  const subscription = await getOrganizationSubscription(organizationId)
  const stockGate = resolveEntitlementGate(subscription, "PREDICTIVE_STOCK_ALERTS")
  if (!gateHasFullAccess(stockGate)) {
    return forbidden(stockGate.reason)
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

  const subscription = await getOrganizationSubscription(organizationId)
  const stockGate = resolveEntitlementGate(subscription, "PREDICTIVE_STOCK_ALERTS")
  if (!gateHasFullAccess(stockGate)) {
    return forbidden(stockGate.reason)
  }

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
  const mortalityGate = resolveEntitlementGate(subscription, "PREDICTIVE_HEALTH_ALERTS")
  if (!gateHasFullAccess(mortalityGate)) {
    return forbidden(mortalityGate.reason)
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
  const marginGate = resolveEntitlementGate(subscription, "PREDICTIVE_MARGIN_ALERTS")
  if (!gateHasFullAccess(marginGate)) {
    return forbidden(marginGate.reason)
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

