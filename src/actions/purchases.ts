/**
 * SunuFarm — Server Actions : module achats
 *
 * Périmètre MVP :
 *   - Lister les achats d'une organisation
 *   - Créer un achat avec 1+ lignes (PurchaseItem)
 *   - Supprimer un achat sans paiement
 *
 * Un achat représente une commande fournisseur (aliments, poussins, médicaments...).
 * Le total est recalculé comme SUM des lignes lors de la création.
 *
 * Permissions : CREATE_PURCHASE (OWNER, MANAGER, SUPER_ADMIN)
 */

"use server"

import { z }           from "zod"
import prisma          from "@/src/lib/prisma"
import {
  requireSession,
  requireMembership,
  type ActionResult,
}                      from "@/src/lib/auth"
import { createAuditLog, AuditAction } from "@/src/lib/audit"
import { canPerformAction }            from "@/src/lib/permissions"
import { requiredIdSchema, optionalIdSchema, positiveIntSchema } from "@/src/lib/validators"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PurchaseItemData {
  description:   string
  quantity:      number
  unit:          string
  unitPriceFcfa: number
  totalFcfa:     number
}

export interface PurchaseSummary {
  id:           string
  purchaseDate: Date
  reference:    string | null
  totalFcfa:    number
  paidFcfa:     number
  balanceFcfa:  number
  notes:        string | null
  createdAt:    Date
  supplier: {
    id:   string
    name: string
    type: string | null
  } | null
  items: PurchaseItemData[]
}

// ---------------------------------------------------------------------------
// Schémas Zod
// ---------------------------------------------------------------------------

const purchaseItemSchema = z.object({
  description:   z.string().min(1, "Description requise").max(300),
  quantity:      z.number().positive("Quantité > 0"),
  unit:          z.string().min(1).max(20),
  unitPriceFcfa: positiveIntSchema,
})

const getPurchasesSchema = z.object({
  organizationId: requiredIdSchema,
  limit:          z.number().int().min(1).max(100).default(50),
})

const createPurchaseSchema = z.object({
  organizationId: requiredIdSchema,
  supplierId:     optionalIdSchema,
  purchaseDate:   z.coerce.date(),
  reference:      z.string().max(100).optional().or(z.literal("")),
  notes:          z.string().max(1000).optional().or(z.literal("")),
  items:          z.array(purchaseItemSchema).min(1, "Au moins une ligne requise"),
})

const deletePurchaseSchema = z.object({
  organizationId: requiredIdSchema,
  purchaseId:     requiredIdSchema,
})

// ---------------------------------------------------------------------------
// getPurchases
// ---------------------------------------------------------------------------

export async function getPurchases(
  data: unknown,
): Promise<ActionResult<PurchaseSummary[]>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = getPurchasesSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, limit } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult

    const purchases = await prisma.purchase.findMany({
      where:   { organizationId },
      orderBy: { purchaseDate: "desc" },
      take:    limit,
      select: {
        id:           true,
        purchaseDate: true,
        reference:    true,
        totalFcfa:    true,
        paidFcfa:     true,
        notes:        true,
        createdAt:    true,
        supplier: {
          select: { id: true, name: true, type: true },
        },
        items: {
          select: {
            description:   true,
            quantity:      true,
            unit:          true,
            unitPriceFcfa: true,
            totalFcfa:     true,
          },
        },
      },
    })

    return {
      success: true,
      data: purchases.map((p) => ({
        ...p,
        balanceFcfa: p.totalFcfa - p.paidFcfa,
      })),
    }
  } catch {
    return { success: false, error: "Impossible de charger les achats" }
  }
}

// ---------------------------------------------------------------------------
// createPurchase
// ---------------------------------------------------------------------------

export async function createPurchase(
  data: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = createPurchaseSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Données invalides" }
    }

    const { organizationId, supplierId, purchaseDate, reference, notes, items } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult

    if (!canPerformAction(membershipResult.data.role, "CREATE_PURCHASE")) {
      return { success: false, error: "Permission refusée" }
    }

    // Vérifier le fournisseur si fourni
    if (supplierId) {
      const supplier = await prisma.supplier.findFirst({
        where:  { id: supplierId, organizationId },
        select: { id: true },
      })
      if (!supplier) return { success: false, error: "Fournisseur introuvable" }
    }

    // Calculer les totaux des lignes (toujours entier FCFA)
    const itemsWithTotal = items.map((item) => ({
      description:   item.description,
      quantity:      item.quantity,
      unit:          item.unit,
      unitPriceFcfa: item.unitPriceFcfa,
      totalFcfa:     Math.round(item.quantity * item.unitPriceFcfa),
    }))

    const totalFcfa = itemsWithTotal.reduce((s, i) => s + i.totalFcfa, 0)

    const purchase = await prisma.purchase.create({
      data: {
        organizationId,
        supplierId:   supplierId ?? null,
        purchaseDate,
        reference:    reference || null,
        notes:        notes     || null,
        totalFcfa,
        paidFcfa:     0,
        createdById:  sessionResult.data.user.id,
        items: {
          create: itemsWithTotal,
        },
      },
      select: { id: true },
    })

    await createAuditLog({
      userId:         sessionResult.data.user.id,
      organizationId,
      action:         AuditAction.CREATE,
      resourceType:   "Purchase",
      resourceId:     purchase.id,
      after:          { totalFcfa, itemCount: itemsWithTotal.length },
    })

    return { success: true, data: { id: purchase.id } }
  } catch {
    return { success: false, error: "Impossible de créer l'achat" }
  }
}

// ---------------------------------------------------------------------------
// deletePurchase
// ---------------------------------------------------------------------------

export async function deletePurchase(
  data: unknown,
): Promise<ActionResult<void>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = deletePurchaseSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, purchaseId } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult

    if (!canPerformAction(membershipResult.data.role, "CREATE_PURCHASE")) {
      return { success: false, error: "Permission refusée" }
    }

    const purchase = await prisma.purchase.findFirst({
      where:  { id: purchaseId, organizationId },
      select: { id: true, paidFcfa: true, _count: { select: { payments: true } } },
    })
    if (!purchase) return { success: false, error: "Achat introuvable" }

    if (purchase._count.payments > 0) {
      return { success: false, error: "Impossible de supprimer un achat avec des paiements" }
    }

    await prisma.purchase.delete({ where: { id: purchaseId } })

    await createAuditLog({
      userId:         sessionResult.data.user.id,
      organizationId,
      action:         AuditAction.DELETE,
      resourceType:   "Purchase",
      resourceId:     purchaseId,
      before:         purchase,
    })

    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Impossible de supprimer l'achat" }
  }
}

// ---------------------------------------------------------------------------
// getSuppliers — helper pour le formulaire de création
// ---------------------------------------------------------------------------

export async function getSuppliers(
  data: unknown,
): Promise<ActionResult<{ id: string; name: string; type: string | null }[]>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = z.object({ organizationId: requiredIdSchema }).safeParse(data)
    if (!parsed.success) return { success: false, error: "Données invalides" }

    const { organizationId } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult

    const suppliers = await prisma.supplier.findMany({
      where:   { organizationId },
      select:  { id: true, name: true, type: true },
      orderBy: { name: "asc" },
    })

    return { success: true, data: suppliers }
  } catch {
    return { success: false, error: "Impossible de charger les fournisseurs" }
  }
}
