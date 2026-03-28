/**
 * SunuFarm — Server Actions : rentabilité par lot
 *
 * Agrège en une seule passe toutes les données financières et opérationnelles
 * d'un lot : revenus (SaleItem), charges (batch.totalCostFcfa + Expense),
 * mortalité (DailyRecord). Les KPI sont calculés via lib/kpi.ts.
 *
 * Pourquoi une action séparée et non dans batches.ts ?
 *   Cette action croise 4 modèles (Batch, SaleItem, Expense, DailyRecord).
 *   La garder dans batches.ts alourdirait un fichier déjà long et mélangerait
 *   CRUD et agrégation analytique. profitability.ts peut évoluer indépendamment.
 *
 * Revenus : SUM(SaleItem.totalFcfa) WHERE batchId = batchId ET organizationId = org
 *   Le filtre organizationId passe par la relation sale.organizationId pour
 *   garantir l'isolation multi-tenant même sur SaleItem.
 *
 * Charges directes : batch.totalCostFcfa (poussins) + SUM(Expense.amountFcfa)
 *   Les dépenses sans batchId (charges ferme / overhead) sont exclues
 *   intentionnellement — elles ne sont pas imputables à un lot précis.
 *
 * Mortalité : SUM(DailyRecord.mortality) — les réformes ne sont pas gérées
 *   au MVP, l'effectif vivant est donc une approximation.
 */

"use server"

import { z }                          from "zod"
import prisma                         from "@/src/lib/prisma"
import {
  requireOrganizationModuleContext,
  requireRole,
  type ActionResult,
}                                     from "@/src/lib/auth"
import { canAccessFarm }              from "@/src/lib/permissions"
import { requiredIdSchema }           from "@/src/lib/validators"
import { computeBatchProfitability }  from "@/src/lib/batch-profitability"
import {
  getFeatureUpgradeMessage,
  hasPlanFeature,
} from "@/src/lib/subscriptions"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { UserRole } from "@/src/generated/prisma/client"

// ---------------------------------------------------------------------------
// Schéma
// ---------------------------------------------------------------------------

const getBatchProfitabilitySchema = z.object({
  organizationId: requiredIdSchema,
  batchId:        requiredIdSchema,
})

// ---------------------------------------------------------------------------
// Type retourné
// ---------------------------------------------------------------------------

export interface BatchProfitability {
  batchId:             string
  entryCount:          number

  // Revenus
  revenueFcfa:         number
  saleItemsCount:      number

  // Charges
  purchaseCostFcfa:    number   // coût d'achat des poussins (batch.totalCostFcfa)
  operationalCostFcfa: number   // dépenses opérationnelles liées au lot
  totalCostFcfa:       number   // purchase + operational

  // Rentabilité
  profitFcfa:          number          // revenue - totalCost (peut être négatif)
  marginRate:          number | null   // (profit / totalCost) × 100, null si coûts = 0
  costPerBird:         number | null   // totalCost / entryCount, null si entryCount = 0

  // Opérationnel
  totalMortality:      number
  mortalityRatePct:    number | null   // (morts / entryCount) × 100
  liveCount:           number          // entryCount - totalMortality (approximation MVP)
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

/**
 * Calcule la rentabilité complète d'un lot.
 *
 * Toutes les agrégations sont faites en parallèle (Promise.all) pour minimiser
 * la latence. Le lot lui-même est chargé dans le même Promise.all.
 *
 * Requiert VIEW_FINANCES (canRead sur la ferme du lot).
 */
export async function getBatchProfitability(
  data: unknown,
): Promise<ActionResult<BatchProfitability>> {
  try {
    const parsed = getBatchProfitabilitySchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, batchId } = parsed.data

    const accessResult = await requireOrganizationModuleContext(organizationId, "REPORTS")
    if (!accessResult.success) return accessResult
    const roleResult = requireRole(
      accessResult.data.membership,
      [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT],
      "Accès aux données financières refusé",
    )
    if (!roleResult.success) return roleResult

    const subscription = await getOrganizationSubscription(organizationId)
    if (!hasPlanFeature(subscription.plan, "PROFITABILITY")) {
      return {
        success: false,
        error: getFeatureUpgradeMessage("PROFITABILITY"),
      }
    }

    // ── Fetch parallèle ────────────────────────────────────────────────────
    const [batch, saleItemsAgg, expensesAgg, mortalityAgg] = await Promise.all([

      // Lot — on a besoin de entryCount, totalCostFcfa et farmId (pour canAccessFarm)
      prisma.batch.findFirst({
        where:  { id: batchId, organizationId, deletedAt: null },
        select: {
          id:            true,
          entryCount:    true,
          totalCostFcfa: true,
          building: { select: { farmId: true } },
        },
      }),

      // Revenus : SUM + COUNT des SaleItems liés à ce lot dans cette organisation
      prisma.saleItem.aggregate({
        where: {
          batchId,
          sale: { organizationId },
        },
        _sum:   { totalFcfa: true },
        _count: { id: true },
      }),

      // Charges opérationnelles : dépenses directement imputées au lot
      prisma.expense.aggregate({
        where: { batchId, organizationId },
        _sum:  { amountFcfa: true },
      }),

      // Mortalité cumulée : agrégat sur tous les DailyRecords du lot
      prisma.dailyRecord.aggregate({
        where: { batchId },
        _sum:  { mortality: true },
      }),
    ])

    if (!batch) {
      return { success: false, error: "Lot introuvable" }
    }

    // Vérifier l'accès en lecture à la ferme du lot
    if (!canAccessFarm(
      accessResult.data.membership.role,
      accessResult.data.membership.farmPermissions,
      batch.building.farmId,
      "canRead",
    )) {
      return { success: false, error: "Accès refusé à ce lot" }
    }

    // ── Calculs ────────────────────────────────────────────────────────────

    const profitability = computeBatchProfitability({
      entryCount: batch.entryCount,
      revenueFcfa: saleItemsAgg._sum.totalFcfa ?? 0,
      saleItemsCount: saleItemsAgg._count.id,
      purchaseCostFcfa: batch.totalCostFcfa,
      operationalCostFcfa: expensesAgg._sum.amountFcfa ?? 0,
      totalMortality: mortalityAgg._sum.mortality ?? 0,
    })

    return {
      success: true,
      data: {
        batchId,
        ...profitability,
      },
    }
  } catch {
    return { success: false, error: "Impossible de calculer la rentabilité du lot" }
  }
}
