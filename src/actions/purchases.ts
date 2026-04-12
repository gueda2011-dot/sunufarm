"use server"

import { z } from "zod"
import prisma from "@/src/lib/prisma"
import {
  requireOrganizationModuleContext,
  requireRole,
  type ActionResult,
} from "@/src/lib/auth"
import { createAuditLog, AuditAction } from "@/src/lib/audit"
import { canAccessFarm } from "@/src/lib/permissions"
import {
  dateSchema,
  positiveIntSchema,
  positiveNumberSchema,
  requiredIdSchema,
  optionalIdSchema,
} from "@/src/lib/validators"
import {
  FeedMovementType,
  MedicineMovementType,
  PaymentMethod,
  UserRole,
} from "@/src/generated/prisma/client"

const FEED_SACK_WEIGHT_KG = 50

export interface PurchaseItemData {
  id: string
  description: string
  quantity: number
  unit: string
  unitPriceFcfa: number
  totalFcfa: number
  stockLinked: boolean
}

export interface PurchaseSummary {
  id: string
  purchaseDate: Date
  reference: string | null
  totalFcfa: number
  paidFcfa: number
  balanceFcfa: number
  notes: string | null
  createdAt: Date
  supplier: {
    id: string
    name: string
    type: string | null
  } | null
  items: PurchaseItemData[]
}

const purchaseItemSchema = z.object({
  description: z.string().min(1, "Description requise").max(300),
  quantity: z.number().positive("Quantite > 0"),
  unit: z.string().min(1).max(20),
  unitPriceFcfa: positiveIntSchema,
})

const getPurchasesSchema = z.object({
  organizationId: requiredIdSchema,
  limit: z.number().int().min(1).max(100).default(50),
})

const createPurchaseSchema = z.object({
  organizationId:  requiredIdSchema,
  supplierId:      optionalIdSchema,
  purchaseDate:    z.coerce.date(),
  reference:       z.string().max(100).optional().or(z.literal("")),
  notes:           z.string().max(1000).optional().or(z.literal("")),
  items:           z.array(purchaseItemSchema).min(1, "Au moins une ligne requise"),
  clientMutationId: z.string().trim().min(1).max(100).optional(),
})

const deletePurchaseSchema = z.object({
  organizationId: requiredIdSchema,
  purchaseId: requiredIdSchema,
})

const recordPurchasePaymentSchema = z.object({
  organizationId: requiredIdSchema,
  purchaseId: requiredIdSchema,
  amountFcfa: positiveIntSchema,
  paymentDate: dateSchema,
  method: z.nativeEnum(PaymentMethod),
  reference: z.string().max(100).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
})

const linkPurchaseItemToStockSchema = z.object({
  organizationId: requiredIdSchema,
  purchaseId: requiredIdSchema,
  purchaseItemId: requiredIdSchema,
  stockType: z.enum(["FEED", "MEDICINE"]),
  stockId: requiredIdSchema,
  quantity: positiveNumberSchema,
  notes: z.string().max(1000).optional().or(z.literal("")),
})

const purchaseSelect = {
  id: true,
  purchaseDate: true,
  reference: true,
  totalFcfa: true,
  paidFcfa: true,
  notes: true,
  createdAt: true,
  supplier: {
    select: { id: true, name: true, type: true },
  },
  items: {
    select: {
      id: true,
      description: true,
      quantity: true,
      unit: true,
      unitPriceFcfa: true,
      totalFcfa: true,
    },
  },
} as const

function getPurchaseItemStockReference(purchaseItemId: string) {
  return `purchase-item:${purchaseItemId}`
}

function getFeedUnitPricePerKg(
  purchaseItem: {
    unit: string
    unitPriceFcfa: number
  },
) {
  return purchaseItem.unit.trim().toUpperCase() === "SAC"
    ? Math.round(purchaseItem.unitPriceFcfa / FEED_SACK_WEIGHT_KG)
    : purchaseItem.unitPriceFcfa
}

async function decoratePurchasesWithStockLinks(
  organizationId: string,
  purchases: Array<{
    id: string
    purchaseDate: Date
    reference: string | null
    totalFcfa: number
    paidFcfa: number
    notes: string | null
    createdAt: Date
    supplier: { id: string; name: string; type: string | null } | null
    items: Array<{
      id: string
      description: string
      quantity: number
      unit: string
      unitPriceFcfa: number
      totalFcfa: number
    }>
  }>,
): Promise<PurchaseSummary[]> {
  const references = purchases.flatMap((purchase) =>
    purchase.items.map((item) => getPurchaseItemStockReference(item.id)),
  )

  const [feedLinks, medicineLinks] = references.length === 0
    ? [[], []]
    : await Promise.all([
        prisma.feedMovement.findMany({
          where: {
            organizationId,
            reference: { in: references },
          },
          select: { reference: true },
        }),
        prisma.medicineMovement.findMany({
          where: {
            organizationId,
            reference: { in: references },
          },
          select: { reference: true },
        }),
      ])

  const linkedReferences = new Set([
    ...feedLinks.map((row) => row.reference).filter((value): value is string => Boolean(value)),
    ...medicineLinks.map((row) => row.reference).filter((value): value is string => Boolean(value)),
  ])

  return purchases.map((purchase) => ({
    ...purchase,
    balanceFcfa: purchase.totalFcfa - purchase.paidFcfa,
    items: purchase.items.map((item) => ({
      ...item,
      stockLinked: linkedReferences.has(getPurchaseItemStockReference(item.id)),
    })),
  }))
}

export async function getPurchases(
  data: unknown,
): Promise<ActionResult<PurchaseSummary[]>> {
  try {
    const parsed = getPurchasesSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const { organizationId, limit } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "PURCHASES")
    if (!accessResult.success) return accessResult

    const purchases = await prisma.purchase.findMany({
      where: { organizationId },
      orderBy: { purchaseDate: "desc" },
      take: limit,
      select: purchaseSelect,
    })

    return {
      success: true,
      data: await decoratePurchasesWithStockLinks(organizationId, purchases),
    }
  } catch {
    return { success: false, error: "Impossible de charger les achats" }
  }
}

export async function createPurchase(
  data: unknown,
): Promise<ActionResult<PurchaseSummary>> {
  try {
    const parsed = createPurchaseSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Donnees invalides" }
    }

    const { organizationId, supplierId, purchaseDate, reference, notes, items, clientMutationId } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "PURCHASES")
    if (!accessResult.success) return accessResult
    const roleResult = requireRole(
      accessResult.data.membership,
      [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER],
      "Permission refusee",
    )
    if (!roleResult.success) return roleResult

    // Idempotence : si clientMutationId déjà connu, retourner l'achat existant
    if (clientMutationId) {
      const existingByMutation = await prisma.purchase.findUnique({
        where: { clientMutationId },
        select: purchaseSelect,
      })
      if (existingByMutation) {
        const [decorated] = await decoratePurchasesWithStockLinks(organizationId, [existingByMutation])
        return { success: true, data: decorated }
      }
    }

    if (supplierId) {
      const supplier = await prisma.supplier.findFirst({
        where: { id: supplierId, organizationId },
        select: { id: true },
      })
      if (!supplier) return { success: false, error: "Fournisseur introuvable" }
    }

    const itemsWithTotal = items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPriceFcfa: item.unitPriceFcfa,
      totalFcfa: Math.round(item.quantity * item.unitPriceFcfa),
    }))

    const totalFcfa = itemsWithTotal.reduce((sum, item) => sum + item.totalFcfa, 0)

    const purchase = await prisma.purchase.create({
      data: {
        organizationId,
        supplierId: supplierId ?? null,
        purchaseDate,
        reference: reference || null,
        notes: notes || null,
        totalFcfa,
        paidFcfa: 0,
        clientMutationId: clientMutationId ?? null,
        createdById: accessResult.data.session.user.id,
        items: {
          create: itemsWithTotal,
        },
      },
      select: purchaseSelect,
    })

    await createAuditLog({
      userId: accessResult.data.session.user.id,
      organizationId,
      action: AuditAction.CREATE,
      resourceType: "Purchase",
      resourceId: purchase.id,
      after: { totalFcfa, itemCount: itemsWithTotal.length },
    })

    return {
      success: true,
      data: (await decoratePurchasesWithStockLinks(organizationId, [purchase]))[0]!,
    }
  } catch {
    return { success: false, error: "Impossible de creer l'achat" }
  }
}

export async function recordPurchasePayment(
  data: unknown,
): Promise<ActionResult<PurchaseSummary>> {
  try {
    const parsed = recordPurchasePaymentSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const { organizationId, purchaseId, amountFcfa, paymentDate, method, reference, notes } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "PURCHASES")
    if (!accessResult.success) return accessResult
    const roleResult = requireRole(
      accessResult.data.membership,
      [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT],
      "Permission refusee",
    )
    if (!roleResult.success) return roleResult

    const existing = await prisma.purchase.findFirst({
      where: { id: purchaseId, organizationId },
      select: { id: true, totalFcfa: true, paidFcfa: true },
    })
    if (!existing) {
      return { success: false, error: "Achat introuvable" }
    }

    const nextPaidFcfa = existing.paidFcfa + amountFcfa
    if (nextPaidFcfa > existing.totalFcfa) {
      return {
        success: false,
        error: "Le paiement depasse le montant restant de cet achat.",
      }
    }

    const purchase = await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          organizationId,
          purchaseId,
          amountFcfa,
          paymentDate,
          method,
          reference: reference || null,
          notes: notes || null,
          createdById: accessResult.data.session.user.id,
        },
      })

      return tx.purchase.update({
        where: { id: purchaseId },
        data: { paidFcfa: nextPaidFcfa },
        select: purchaseSelect,
      })
    })

    await createAuditLog({
      userId: accessResult.data.session.user.id,
      organizationId,
      action: AuditAction.UPDATE,
      resourceType: "Purchase",
      resourceId: purchaseId,
      after: {
        paidFcfa: nextPaidFcfa,
        paymentAmountFcfa: amountFcfa,
        paymentMethod: method,
        paymentDate,
      },
    })

    return {
      success: true,
      data: (await decoratePurchasesWithStockLinks(organizationId, [purchase]))[0]!,
    }
  } catch {
    return { success: false, error: "Impossible d'enregistrer le paiement" }
  }
}

export async function linkPurchaseItemToStock(
  data: unknown,
): Promise<ActionResult<{ purchaseId: string; purchaseItemId: string }>> {
  try {
    const parsed = linkPurchaseItemToStockSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const { organizationId, purchaseId, purchaseItemId, stockType, stockId, quantity, notes } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "STOCK")
    if (!accessResult.success) return accessResult
    const roleResult = requireRole(
      accessResult.data.membership,
      [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER, UserRole.TECHNICIAN],
      "Permission refusee",
    )
    if (!roleResult.success) return roleResult

    const purchaseItem = await prisma.purchaseItem.findFirst({
      where: {
        id: purchaseItemId,
        purchaseId,
        purchase: { organizationId },
      },
      select: {
        id: true,
        description: true,
        quantity: true,
        unit: true,
        unitPriceFcfa: true,
        purchase: {
          select: {
            id: true,
            purchaseDate: true,
            reference: true,
          },
        },
      },
    })

    if (!purchaseItem) {
      return { success: false, error: "Ligne d'achat introuvable" }
    }

    const movementReference = getPurchaseItemStockReference(purchaseItem.id)

    const [existingFeedMovement, existingMedicineMovement] = await Promise.all([
      prisma.feedMovement.findFirst({
        where: { organizationId, reference: movementReference },
        select: { id: true },
      }),
      prisma.medicineMovement.findFirst({
        where: { organizationId, reference: movementReference },
        select: { id: true },
      }),
    ])

    if (existingFeedMovement || existingMedicineMovement) {
      return { success: false, error: "Cette ligne d'achat a deja ete envoyee au stock." }
    }

    const movementNotes = [
      `Achat fournisseur: ${purchaseItem.description}`,
      `Quantite achetee: ${purchaseItem.quantity} ${purchaseItem.unit}`,
      notes?.trim() ? `Note: ${notes.trim()}` : null,
    ].filter(Boolean).join(" | ")

    if (stockType === "FEED") {
      const unitPriceFcfaPerKg = getFeedUnitPricePerKg(purchaseItem)
      const feedStock = await prisma.feedStock.findFirst({
        where: { id: stockId, organizationId },
        select: { id: true, farmId: true, feedTypeId: true, quantityKg: true },
      })

      if (!feedStock) {
        return { success: false, error: "Stock aliment introuvable" }
      }

      if (!canAccessFarm(
        accessResult.data.membership.role,
        accessResult.data.membership.farmPermissions,
        feedStock.farmId,
        "canWrite",
      )) {
        return { success: false, error: "Acces en ecriture refuse sur cette ferme" }
      }

      await prisma.$transaction(async (tx) => {
        await tx.feedStock.update({
          where: { id: feedStock.id },
          data: { quantityKg: feedStock.quantityKg + quantity },
        })

        await tx.feedMovement.create({
          data: {
            organizationId,
            feedStockId: feedStock.id,
            feedTypeId: feedStock.feedTypeId,
            type: FeedMovementType.ENTREE,
            quantityKg: quantity,
            unitPriceFcfa: unitPriceFcfaPerKg,
            totalFcfa: Math.round(quantity * unitPriceFcfaPerKg),
            reference: movementReference,
            notes: movementNotes,
            recordedById: accessResult.data.session.user.id,
            date: purchaseItem.purchase.purchaseDate,
          },
        })
      })
    } else {
      const medicineStock = await prisma.medicineStock.findFirst({
        where: { id: stockId, organizationId },
        select: { id: true, farmId: true, quantityOnHand: true },
      })

      if (!medicineStock) {
        return { success: false, error: "Stock medicament introuvable" }
      }

      if (!canAccessFarm(
        accessResult.data.membership.role,
        accessResult.data.membership.farmPermissions,
        medicineStock.farmId,
        "canWrite",
      )) {
        return { success: false, error: "Acces en ecriture refuse sur cette ferme" }
      }

      await prisma.$transaction(async (tx) => {
        await tx.medicineStock.update({
          where: { id: medicineStock.id },
          data: { quantityOnHand: medicineStock.quantityOnHand + quantity },
        })

        await tx.medicineMovement.create({
          data: {
            organizationId,
            medicineStockId: medicineStock.id,
            type: MedicineMovementType.ENTREE,
            quantity,
            unitPriceFcfa: purchaseItem.unitPriceFcfa,
            totalFcfa: Math.round(quantity * purchaseItem.unitPriceFcfa),
            reference: movementReference,
            notes: movementNotes,
            recordedById: accessResult.data.session.user.id,
            date: purchaseItem.purchase.purchaseDate,
          },
        })
      })
    }

    await createAuditLog({
      userId: accessResult.data.session.user.id,
      organizationId,
      action: AuditAction.CREATE,
      resourceType: "PURCHASE_STOCK_LINK",
      resourceId: purchaseItem.id,
      after: {
        purchaseId,
        purchaseItemId,
        stockType,
        stockId,
        quantity,
      },
    })

    return {
      success: true,
      data: { purchaseId, purchaseItemId },
    }
  } catch {
    return { success: false, error: "Impossible d'envoyer cette ligne au stock" }
  }
}

export async function deletePurchase(
  data: unknown,
): Promise<ActionResult<void>> {
  try {
    const parsed = deletePurchaseSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const { organizationId, purchaseId } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "PURCHASES")
    if (!accessResult.success) return accessResult
    const roleResult = requireRole(
      accessResult.data.membership,
      [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER],
      "Permission refusee",
    )
    if (!roleResult.success) return roleResult

    const purchase = await prisma.purchase.findFirst({
      where: { id: purchaseId, organizationId },
      select: { id: true, paidFcfa: true, _count: { select: { payments: true } } },
    })
    if (!purchase) return { success: false, error: "Achat introuvable" }

    if (purchase._count.payments > 0) {
      return { success: false, error: "Impossible de supprimer un achat avec des paiements" }
    }

    await prisma.purchase.delete({ where: { id: purchaseId } })

    await createAuditLog({
      userId: accessResult.data.session.user.id,
      organizationId,
      action: AuditAction.DELETE,
      resourceType: "Purchase",
      resourceId: purchaseId,
      before: purchase,
    })

    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Impossible de supprimer l'achat" }
  }
}

export async function getSuppliers(
  data: unknown,
): Promise<ActionResult<{ id: string; name: string; type: string | null }[]>> {
  try {
    const parsed = z.object({ organizationId: requiredIdSchema }).safeParse(data)
    if (!parsed.success) return { success: false, error: "Donnees invalides" }

    const { organizationId } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "PURCHASES")
    if (!accessResult.success) return accessResult

    const suppliers = await prisma.supplier.findMany({
      where: { organizationId },
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" },
    })

    return { success: true, data: suppliers }
  } catch {
    return { success: false, error: "Impossible de charger les fournisseurs" }
  }
}
