/**
 * SunuFarm — Server Actions : gestion des dépenses
 *
 * Les dépenses sont le socle de la rentabilité par lot.
 * Ce module couvre les charges directes (lot) et indirectes (ferme, organisation).
 *
 * Périmètre MVP :
 *   - Lister et consulter les dépenses d'une organisation avec filtres
 *   - Créer, modifier et supprimer une dépense
 *
 * Niveaux de rattachement :
 *   batchId fourni                → charge directe du lot (aliment, poussins, médicaments)
 *   farmId fourni, batchId null   → charge indirecte de la ferme (loyer, énergie, eau)
 *   les deux null                 → overhead organisation (comptable, transport commun...)
 *
 *   Les deux peuvent coexister : une dépense de lot est aussi implicitement
 *   sur la ferme du lot. batchId + farmId sont immuables après création.
 *
 * Suppression (hard delete) :
 *   Autorisée si purchaseId est null (dépense autonome).
 *   Refusée si purchaseId est renseigné — l'expense fait partie d'un bon d'achat,
 *   la suppression doit passer par le module achats.
 *   Le snapshot before dans l'audit log préserve la traçabilité complète.
 *
 * Permissions :
 *   Lecture  → VIEW_FINANCES (SUPER_ADMIN, OWNER, MANAGER, ACCOUNTANT)
 *   Mutations → CREATE_EXPENSE (SUPER_ADMIN, OWNER, MANAGER, ACCOUNTANT)
 *   Pas de filtre par ferme sur la lecture pour le MVP — l'ACCOUNTANT voit toutes
 *   les dépenses de l'organisation pour produire ses états financiers.
 */

"use server"

import { z } from "zod"
import prisma from "@/src/lib/prisma"
import {
  requireOrganizationModuleContext,
  requireRole,
  type ActionResult,
} from "@/src/lib/auth"
import { createAuditLog, AuditAction } from "@/src/lib/audit"
import {
  requiredIdSchema,
  optionalIdSchema,
  positiveIntSchema,
  dateSchema,
  optionalDateSchema,
} from "@/src/lib/validators"
import { UserRole } from "@/src/generated/prisma/client"
import { forbidden } from "@/src/lib/action-result"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { resolveEntitlementGate, gateHasFullAccess } from "@/src/lib/gate-resolver"

// ---------------------------------------------------------------------------
// Schémas Zod
// ---------------------------------------------------------------------------

const clientMutationIdSchema = z.string().trim().min(1).max(100)

const getExpensesSchema = z.object({
  organizationId: requiredIdSchema,
  batchId:        optionalIdSchema,
  farmId:         optionalIdSchema,
  categoryId:     optionalIdSchema,
  fromDate:       optionalDateSchema,
  toDate:         optionalDateSchema,
  /**
   * Cursor de pagination : date de la dernière dépense reçue.
   * La page suivante retourne les dépenses dont la date est strictement
   * antérieure à cursorDate (tri date desc).
   */
  cursorDate:     z.coerce.date().optional(),
  limit:          z.number().int().min(1).max(100).default(20),
})

const getExpenseSchema = z.object({
  organizationId: requiredIdSchema,
  expenseId:      requiredIdSchema,
})

const createExpenseSchema = z.object({
  organizationId: requiredIdSchema,
  clientMutationId: clientMutationIdSchema.optional(),
  /** Charge directe — lot auquel la dépense est imputée */
  batchId:        optionalIdSchema,
  /** Charge indirecte — ferme à laquelle la dépense est imputée */
  farmId:         optionalIdSchema,
  categoryId:     optionalIdSchema,
  date:           dateSchema,
  description:    z.string().min(1).max(255),
  /** Montant en FCFA — entier strictement positif (0 n'est pas une dépense) */
  amountFcfa:     positiveIntSchema,
  supplierId:     optionalIdSchema,
  /** Référence externe : numéro de facture, bon de livraison, etc. */
  reference:      z.string().max(100).optional(),
  notes:          z.string().max(1000).optional(),
})

const updateExpenseSchema = z.object({
  organizationId: requiredIdSchema,
  expenseId:      requiredIdSchema,
  // batchId et farmId sont immuables — ils définissent l'imputation comptable
  categoryId:     optionalIdSchema,
  date:           optionalDateSchema,
  description:    z.string().min(1).max(255).optional(),
  amountFcfa:     positiveIntSchema.optional(),
  supplierId:     optionalIdSchema,
  reference:      z.string().max(100).optional(),
  notes:          z.string().max(1000).optional(),
})

const deleteExpenseSchema = z.object({
  organizationId: requiredIdSchema,
  expenseId:      requiredIdSchema,
})

// ---------------------------------------------------------------------------
// Types retournés
// ---------------------------------------------------------------------------

export interface ExpenseCategory {
  id:   string
  name: string
  code: string
}

export interface ExpenseSummary {
  id:             string
  organizationId: string
  batchId:        string | null
  farmId:         string | null
  categoryId:     string | null
  date:           Date
  description:    string
  amountFcfa:     number
  supplierId:     string | null
  reference:      string | null
  createdAt:      Date
  category:       ExpenseCategory | null
}

export interface ExpenseDetail extends ExpenseSummary {
  notes:          string | null
  purchaseId:     string | null
  createdById:    string | null
  updatedAt:      Date
}

// ---------------------------------------------------------------------------
// Erreur métier interne
// ---------------------------------------------------------------------------

class BusinessRuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BusinessRuleError"
  }
}

// ---------------------------------------------------------------------------
// Sélections Prisma partagées
// ---------------------------------------------------------------------------

const categorySelect = {
  id:   true,
  name: true,
  code: true,
} as const

const expenseSummarySelect = {
  id:             true,
  organizationId: true,
  batchId:        true,
  farmId:         true,
  categoryId:     true,
  date:           true,
  description:    true,
  amountFcfa:     true,
  supplierId:     true,
  reference:      true,
  createdAt:      true,
  category:       { select: categorySelect },
} as const

const expenseDetailSelect = {
  ...expenseSummarySelect,
  notes:       true,
  purchaseId:  true,
  createdById: true,
  updatedAt:   true,
} as const

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

/**
 * Valide que le lot appartient à l'organisation et n'est pas soft-deleted.
 * Utilisé dans createExpense si batchId est fourni.
 */
async function validateBatch(batchId: string, organizationId: string) {
  return prisma.batch.findFirst({
    where:  { id: batchId, organizationId, deletedAt: null },
    select: { id: true },
  })
}

/**
 * Valide que la ferme appartient à l'organisation et n'est pas soft-deleted.
 * Utilisé dans createExpense si farmId est fourni.
 */
async function validateFarm(farmId: string, organizationId: string) {
  return prisma.farm.findFirst({
    where:  { id: farmId, organizationId, deletedAt: null },
    select: { id: true },
  })
}

// ---------------------------------------------------------------------------
// 1. getExpenses
// ---------------------------------------------------------------------------

/**
 * Retourne les dépenses d'une organisation avec filtres optionnels.
 *
 * Filtres cumulables :
 *   batchId    → dépenses d'un lot spécifique
 *   farmId     → dépenses d'une ferme spécifique
 *   categoryId → dépenses d'une catégorie
 *   fromDate / toDate → plage de dates (inclusive)
 *
 * Pagination cursor-based sur date desc.
 * Requiert VIEW_FINANCES.
 */
export async function getExpenses(
  data: unknown,
): Promise<ActionResult<ExpenseSummary[]>> {
  try {
    const parsed = getExpensesSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const {
      organizationId,
      batchId,
      farmId,
      categoryId,
      fromDate,
      toDate,
      cursorDate,
      limit,
    } = parsed.data

    const accessResult = await requireOrganizationModuleContext(organizationId, "FINANCES")
    if (!accessResult.success) return accessResult
    const roleResult = requireRole(
      accessResult.data.membership,
      [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT],
      "Accès aux données financières refusé",
    )
    if (!roleResult.success) return roleResult
    const subscription = await getOrganizationSubscription(organizationId)
    if (!gateHasFullAccess(resolveEntitlementGate(subscription, "SALES_ACCESS"))) {
      return forbidden("Les dépenses sont disponibles à partir du plan Starter.", "PLAN_REQUIRED")
    }

    const expenses = await prisma.expense.findMany({
      where: {
        organizationId,
        ...(batchId    ? { batchId }    : {}),
        ...(farmId     ? { farmId }     : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(fromDate || toDate
          ? {
              date: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate   ? { lte: toDate }   : {}),
              },
            }
          : {}),
        ...(cursorDate ? { date: { lt: cursorDate } } : {}),
      },
      select:  expenseSummarySelect,
      orderBy: { date: "desc" },
      take:    limit,
    })

    return { success: true, data: expenses }
  } catch {
    return { success: false, error: "Impossible de récupérer les dépenses" }
  }
}

// ---------------------------------------------------------------------------
// 2. getExpense
// ---------------------------------------------------------------------------

/**
 * Retourne le détail complet d'une dépense.
 * Requiert VIEW_FINANCES.
 */
export async function getExpense(
  data: unknown,
): Promise<ActionResult<ExpenseDetail>> {
  try {
    const parsed = getExpenseSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, expenseId } = parsed.data

    const accessResult = await requireOrganizationModuleContext(organizationId, "FINANCES")
    if (!accessResult.success) return accessResult
    const roleResult = requireRole(
      accessResult.data.membership,
      [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT],
      "Accès aux données financières refusé",
    )
    if (!roleResult.success) return roleResult
    const subscription = await getOrganizationSubscription(organizationId)
    if (!gateHasFullAccess(resolveEntitlementGate(subscription, "SALES_ACCESS"))) {
      return forbidden("Les dépenses sont disponibles à partir du plan Starter.", "PLAN_REQUIRED")
    }

    const expense = await prisma.expense.findFirst({
      where:  { id: expenseId, organizationId },
      select: expenseDetailSelect,
    })

    if (!expense) {
      return { success: false, error: "Dépense introuvable" }
    }

    return { success: true, data: expense }
  } catch {
    return { success: false, error: "Impossible de récupérer la dépense" }
  }
}

// ---------------------------------------------------------------------------
// 3. createExpense
// ---------------------------------------------------------------------------

/**
 * Crée une dépense et l'impute au niveau souhaité (org / ferme / lot).
 *
 * Si batchId est fourni, le lot doit être actif et appartenir à l'organisation.
 * Si farmId est fourni, la ferme doit appartenir à l'organisation.
 * Les deux peuvent être fournis pour une charge directe de lot avec référence ferme.
 *
 * Requiert CREATE_EXPENSE.
 */
export async function createExpense(
  data: unknown,
): Promise<ActionResult<ExpenseDetail>> {
  try {
    const parsed = createExpenseSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, clientMutationId, batchId, farmId, ...expenseData } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "FINANCES")
    if (!accessResult.success) return accessResult
    const actorId = accessResult.data.session.user.id
    const roleResult = requireRole(
      accessResult.data.membership,
      [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT],
      "Permission refusée",
    )
    if (!roleResult.success) return roleResult
    const subscription = await getOrganizationSubscription(organizationId)
    if (!gateHasFullAccess(resolveEntitlementGate(subscription, "SALES_ACCESS"))) {
      return forbidden("Les dépenses sont disponibles à partir du plan Starter.", "PLAN_REQUIRED")
    }

    if (clientMutationId) {
      const existingExpense = await prisma.expense.findFirst({
        where: { organizationId, clientMutationId },
        select: expenseDetailSelect,
      })
      if (existingExpense) {
        return { success: true, data: existingExpense }
      }
    }

    // Valider la chaîne d'appartenance selon le rattachement choisi
    if (batchId) {
      const batch = await validateBatch(batchId, organizationId)
      if (!batch) {
        return { success: false, error: "Lot introuvable" }
      }
    }

    if (farmId) {
      const farm = await validateFarm(farmId, organizationId)
      if (!farm) {
        return { success: false, error: "Ferme introuvable" }
      }
    }

    const expense = await prisma.expense.create({
      data: {
        organizationId,
        clientMutationId: clientMutationId ?? null,
        batchId:     batchId ?? null,
        farmId:      farmId  ?? null,
        createdById: actorId,
        ...expenseData,
      },
      select: expenseDetailSelect,
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.CREATE,
      resourceType:   "EXPENSE",
      resourceId:     expense.id,
      after:          { clientMutationId, batchId, farmId, ...expenseData },
    })

    return { success: true, data: expense }
  } catch {
    return { success: false, error: "Impossible de créer la dépense" }
  }
}

// ---------------------------------------------------------------------------
// 4. updateExpense
// ---------------------------------------------------------------------------

/**
 * Corrige une dépense existante.
 *
 * Champs immuables : batchId, farmId, organizationId.
 * Ces champs définissent l'imputation comptable — les modifier fausserait
 * la rentabilité calculée par lot et par ferme.
 *
 * Requiert CREATE_EXPENSE.
 */
export async function updateExpense(
  data: unknown,
): Promise<ActionResult<ExpenseDetail>> {
  try {
    const parsed = updateExpenseSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, expenseId, ...updates } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "FINANCES")
    if (!accessResult.success) return accessResult
    const actorId = accessResult.data.session.user.id
    const roleResult = requireRole(
      accessResult.data.membership,
      [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT],
      "Permission refusée",
    )
    if (!roleResult.success) return roleResult
    const subscription = await getOrganizationSubscription(organizationId)
    if (!gateHasFullAccess(resolveEntitlementGate(subscription, "SALES_ACCESS"))) {
      return forbidden("Les dépenses sont disponibles à partir du plan Starter.", "PLAN_REQUIRED")
    }

    const existing = await prisma.expense.findFirst({
      where:  { id: expenseId, organizationId },
      select: expenseDetailSelect,
    })
    if (!existing) {
      return { success: false, error: "Dépense introuvable" }
    }

    const expense = await prisma.expense.update({
      where:  { id: expenseId },
      data:   updates,
      select: expenseDetailSelect,
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.UPDATE,
      resourceType:   "EXPENSE",
      resourceId:     expenseId,
      before:         existing,
      after:          updates,
    })

    return { success: true, data: expense }
  } catch {
    return { success: false, error: "Impossible de mettre à jour la dépense" }
  }
}

// ---------------------------------------------------------------------------
// 5. deleteExpense
// ---------------------------------------------------------------------------

/**
 * Supprime définitivement une dépense (hard delete — pas de deletedAt sur ce modèle).
 *
 * Règle : refusé si purchaseId est renseigné.
 *   La dépense fait alors partie d'un bon d'achat — la suppression doit passer
 *   par le module achats pour maintenir la cohérence des totaux.
 *
 * Traçabilité : le snapshot before est enregistré dans l'audit log avant suppression.
 *
 * Retourne { success: true, data: undefined } — conforme à ActionResult<void>.
 * Requiert CREATE_EXPENSE.
 */
export async function deleteExpense(
  data: unknown,
): Promise<ActionResult<void>> {
  const parsed = deleteExpenseSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: "Données invalides" }
  }

  const { organizationId, expenseId } = parsed.data
  const accessResult = await requireOrganizationModuleContext(organizationId, "FINANCES")
  if (!accessResult.success) return accessResult
  const actorId = accessResult.data.session.user.id
  const roleResult = requireRole(
    accessResult.data.membership,
    [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT],
    "Permission refusée",
  )
  if (!roleResult.success) return roleResult
  const subscription = await getOrganizationSubscription(organizationId)
  if (!gateHasFullAccess(resolveEntitlementGate(subscription, "SALES_ACCESS"))) {
    return forbidden("Les dépenses sont disponibles à partir du plan Starter.", "PLAN_REQUIRED")
  }

  const existing = await prisma.expense.findFirst({
    where:  { id: expenseId, organizationId },
    select: expenseDetailSelect,
  })
  if (!existing) {
    return { success: false, error: "Dépense introuvable" }
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (existing.purchaseId) {
        throw new BusinessRuleError(
          "Cette dépense est liée à un bon d'achat. Supprimez-la depuis le module achats.",
        )
      }

      await tx.expense.delete({ where: { id: expenseId } })
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.DELETE,
      resourceType:   "EXPENSE",
      resourceId:     expenseId,
      before:         existing,
    })

    return { success: true, data: undefined }
  } catch (error) {
    if (error instanceof BusinessRuleError) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Impossible de supprimer la dépense" }
  }
}
