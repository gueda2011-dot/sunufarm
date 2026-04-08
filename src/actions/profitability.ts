/**
 * SunuFarm - Server Actions : rentabilite par lot
 */

"use server"

import { z } from "zod"
import prisma from "@/src/lib/prisma"
import {
  requireOrganizationModuleContext,
  requireRole,
  type ActionResult,
} from "@/src/lib/auth"
import { canAccessFarm } from "@/src/lib/permissions"
import { requiredIdSchema } from "@/src/lib/validators"
import { computeBatchProfitability } from "@/src/lib/batch-profitability"
import {
  getFeatureUpgradeMessage,
  hasPlanFeature,
} from "@/src/lib/subscriptions"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { BatchType, UserRole } from "@/src/generated/prisma/client"

const getBatchProfitabilitySchema = z.object({
  organizationId: requiredIdSchema,
  batchId: requiredIdSchema,
})

export interface BatchProfitability {
  batchId: string
  batchType: BatchType
  entryCount: number
  revenueFcfa: number
  saleItemsCount: number
  purchaseCostFcfa: number
  operationalCostFcfa: number
  totalCostFcfa: number
  profitFcfa: number
  marginRate: number | null
  costPerBird: number | null
  breakEvenSalePricePerLiveBirdFcfa: number | null
  costPerEggProducedFcfa: number | null
  costPerSellableEggFcfa: number | null
  breakEvenEggSalePriceFcfa: number | null
  breakEvenTraySalePriceFcfa: number | null
  sellableEggRatePct: number | null
  totalMortality: number
  mortalityRatePct: number | null
  liveCount: number
  totalEggsProduced: number
  totalSellableEggs: number
}

export async function getBatchProfitability(
  data: unknown,
): Promise<ActionResult<BatchProfitability>> {
  try {
    const parsed = getBatchProfitabilitySchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const { organizationId, batchId } = parsed.data

    const accessResult = await requireOrganizationModuleContext(organizationId, "REPORTS")
    if (!accessResult.success) return accessResult

    const roleResult = requireRole(
      accessResult.data.membership,
      [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT],
      "Acces aux donnees financieres refuse",
    )
    if (!roleResult.success) return roleResult

    const subscription = await getOrganizationSubscription(organizationId)
    if (!hasPlanFeature(subscription.plan, "PROFITABILITY")) {
      return {
        success: false,
        error: getFeatureUpgradeMessage("PROFITABILITY"),
      }
    }

    const [batch, saleItemsAgg, expensesAgg, mortalityAgg, eggAgg] = await Promise.all([
      prisma.batch.findFirst({
        where: { id: batchId, organizationId, deletedAt: null },
        select: {
          id: true,
          type: true,
          entryCount: true,
          totalCostFcfa: true,
          building: { select: { farmId: true } },
        },
      }),
      prisma.saleItem.aggregate({
        where: {
          batchId,
          sale: { organizationId },
        },
        _sum: { totalFcfa: true },
        _count: { id: true },
      }),
      prisma.expense.aggregate({
        where: { batchId, organizationId },
        _sum: { amountFcfa: true },
      }),
      prisma.dailyRecord.aggregate({
        where: { batchId },
        _sum: { mortality: true },
      }),
      prisma.eggProductionRecord.aggregate({
        where: { batchId, organizationId },
        _sum: {
          totalEggs: true,
          sellableEggs: true,
        },
      }),
    ])

    if (!batch) {
      return { success: false, error: "Lot introuvable" }
    }

    if (!canAccessFarm(
      accessResult.data.membership.role,
      accessResult.data.membership.farmPermissions,
      batch.building.farmId,
      "canRead",
    )) {
      return { success: false, error: "Acces refuse a ce lot" }
    }

    const profitability = computeBatchProfitability({
      entryCount: batch.entryCount,
      revenueFcfa: saleItemsAgg._sum.totalFcfa ?? 0,
      saleItemsCount: saleItemsAgg._count.id,
      purchaseCostFcfa: batch.totalCostFcfa,
      operationalCostFcfa: expensesAgg._sum.amountFcfa ?? 0,
      totalMortality: mortalityAgg._sum.mortality ?? 0,
      totalEggsProduced: eggAgg._sum.totalEggs ?? 0,
      totalSellableEggs: eggAgg._sum.sellableEggs ?? 0,
    })

    return {
      success: true,
      data: {
        batchId,
        batchType: batch.type,
        ...profitability,
        totalEggsProduced: profitability.totalEggsProduced ?? 0,
        totalSellableEggs: profitability.totalSellableEggs ?? 0,
      },
    }
  } catch {
    return { success: false, error: "Impossible de calculer la rentabilite du lot" }
  }
}
