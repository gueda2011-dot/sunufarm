/**
 * SunuFarm - Server Actions : module achats
 *
 * Perimetre :
 *   - Lister les achats d'une organisation
 *   - Creer un achat avec 1+ lignes (PurchaseItem)
 *   - Modifier un achat sans paiement
 *   - Supprimer un achat sans paiement
 *   - Reconciler proprement le stock si l'achat impacte le stock
 *
 * Regle cle :
 *   Aucune suppression ou modification ne doit laisser un ecart silencieux
 *   entre achats et stock. Si la reconciliation n'est pas possible, l'action
 *   est bloquee.
 */

"use server"

import { z } from "zod"
import prisma from "@/src/lib/prisma"
import {
  requireSession,
  requireMembership,
  type ActionResult,
} from "@/src/lib/auth"
import { createAuditLog, AuditAction } from "@/src/lib/audit"
import { canPerformAction } from "@/src/lib/permissions"
import {
  requiredIdSchema,
  optionalIdSchema,
  positiveIntSchema,
} from "@/src/lib/validators"
import {
  createFeedMovement,
  createMedicineMovement,
} from "@/src/actions/stock"
import {
  buildMovementNotesWithSource,
  validateStockMovementInput,
} from "@/src/lib/stock-movement-conventions"
import {
  buildPurchaseMovementContext,
  buildPurchaseNotesWithStockImpact,
  parsePurchaseStockImpact,
  type PurchaseStockImpact,
} from "@/src/lib/purchase-stock-impact"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PurchaseItemData {
  description: string
  quantity: number
  unit: string
  unitPriceFcfa: number
  totalFcfa: number
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
  stockImpact: PurchaseStockImpact
}

type ItemsWithTotal = PurchaseItemData[]

type StockMovementPlan = {
  targetType: "ALIMENT" | "MEDICAMENT"
  targetStockId: string
  quantity: number
  unitPriceFcfa: number
}

type PurchaseRecordForLifecycle = {
  id: string
  organizationId: string
  supplierId: string | null
  purchaseDate: Date
  reference: string | null
  notes: string | null
  totalFcfa: number
  paidFcfa: number
  createdById: string | null
  items: PurchaseItemData[]
  _count: { payments: number }
}

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

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

const purchaseStockImpactSchema = z.object({
  enabled: z.boolean().default(false),
  targetType: z.enum(["ALIMENT", "MEDICAMENT"]).nullable().optional(),
  targetStockId: optionalIdSchema,
})

const createPurchaseSchema = z.object({
  organizationId: requiredIdSchema,
  supplierId: optionalIdSchema,
  purchaseDate: z.coerce.date(),
  reference: z.string().max(100).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
  items: z.array(purchaseItemSchema).min(1, "Au moins une ligne requise"),
  stockImpact: purchaseStockImpactSchema.optional(),
})

const updatePurchaseSchema = createPurchaseSchema.extend({
  purchaseId: requiredIdSchema,
})

const deletePurchaseSchema = z.object({
  organizationId: requiredIdSchema,
  purchaseId: requiredIdSchema,
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildItemsWithTotal(items: z.infer<typeof purchaseItemSchema>[]): ItemsWithTotal {
  return items.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unitPriceFcfa: item.unitPriceFcfa,
    totalFcfa: Math.round(item.quantity * item.unitPriceFcfa),
  }))
}

function normalizeStockImpact(
  stockImpact: z.infer<typeof purchaseStockImpactSchema> | undefined,
): PurchaseStockImpact {
  return stockImpact?.enabled
    ? {
        enabled: true,
        targetType: stockImpact.targetType ?? null,
        targetStockId: stockImpact.targetStockId ?? null,
      }
    : {
        enabled: false,
        targetType: null,
        targetStockId: null,
      }
}

function totalFromItems(items: ItemsWithTotal) {
  return items.reduce((sum, item) => sum + item.totalFcfa, 0)
}

function movementDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function purchaseMovementSignature(
  movement: StockMovementPlan | null,
  reference: string | null,
  purchaseDate: Date,
) {
  if (!movement) return "NONE"

  return [
    movement.targetType,
    movement.targetStockId,
    movement.quantity,
    movement.unitPriceFcfa,
    reference ?? "",
    movementDateKey(purchaseDate),
  ].join("|")
}

function buildCurrentMovementPlan(
  purchase: PurchaseRecordForLifecycle,
): ActionResult<StockMovementPlan | null> {
  const impact = parsePurchaseStockImpact(purchase.notes)

  if (!impact.enabled) {
    return { success: true, data: null }
  }

  if (!impact.targetType || !impact.targetStockId) {
    return {
      success: false,
      error: "Etat achat incoherent : impact stock actif sans cible exploitable",
    }
  }

  if (purchase.items.length !== 1) {
    return {
      success: false,
      error:
        "Etat achat incoherent : un achat lie au stock devrait contenir une seule ligne",
    }
  }

  const [item] = purchase.items

  return {
    success: true,
    data: {
      targetType: impact.targetType,
      targetStockId: impact.targetStockId,
      quantity: item.quantity,
      unitPriceFcfa: item.unitPriceFcfa,
    },
  }
}

async function validateSupplier(
  organizationId: string,
  supplierId: string | undefined,
) {
  if (!supplierId) return null

  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, organizationId },
    select: { id: true },
  })

  return supplier
}

async function resolveNextMovementPlan(args: {
  organizationId: string
  items: ItemsWithTotal
  stockImpact: PurchaseStockImpact
}): Promise<ActionResult<StockMovementPlan | null>> {
  const { organizationId, items, stockImpact } = args

  if (!stockImpact.enabled) {
    return { success: true, data: null }
  }

  if (!stockImpact.targetType || !stockImpact.targetStockId) {
    return {
      success: false,
      error: "Le stock cible est obligatoire si l'achat impacte le stock",
    }
  }

  if (items.length !== 1) {
    return {
      success: false,
      error:
        "Un achat qui impacte le stock doit contenir une seule ligne pour cette premiere integration",
    }
  }

  const [item] = items
  const movementValidation = validateStockMovementInput({
    type: "ENTREE",
    quantity: item.quantity,
    availableQuantity: 0,
    stockId: stockImpact.targetStockId,
  })

  if (movementValidation) {
    return { success: false, error: movementValidation }
  }

  if (stockImpact.targetType === "ALIMENT") {
    const feedStock = await prisma.feedStock.findFirst({
      where: { id: stockImpact.targetStockId, organizationId },
      select: { id: true },
    })

    if (!feedStock) {
      return { success: false, error: "Stock d'aliment introuvable" }
    }

    if (item.unit.trim().toUpperCase() !== "KG") {
      return {
        success: false,
        error: "Un achat qui entre en stock aliment doit etre saisi en kg",
      }
    }
  }

  if (stockImpact.targetType === "MEDICAMENT") {
    const medicineStock = await prisma.medicineStock.findFirst({
      where: { id: stockImpact.targetStockId, organizationId },
      select: { id: true, unit: true },
    })

    if (!medicineStock) {
      return { success: false, error: "Stock de medicament introuvable" }
    }

    if (
      item.unit.trim().toUpperCase() !==
      medicineStock.unit.trim().toUpperCase()
    ) {
      return {
        success: false,
        error:
          `L'unite de la ligne doit correspondre au stock cible (${medicineStock.unit})`,
      }
    }
  }

  return {
    success: true,
    data: {
      targetType: stockImpact.targetType,
      targetStockId: stockImpact.targetStockId,
      quantity: item.quantity,
      unitPriceFcfa: item.unitPriceFcfa,
    },
  }
}

async function createPurchaseEntryMovement(args: {
  organizationId: string
  purchaseId: string
  purchaseDate: Date
  reference: string | null
  notes: string | null | undefined
  movement: StockMovementPlan
  source: "ACHAT" | "CORRECTION"
  label: string
}) {
  const {
    organizationId,
    purchaseId,
    purchaseDate,
    reference,
    notes,
    movement,
    source,
    label,
  } = args

  const movementReference = reference || `ACHAT-${purchaseId}`
  const movementNotes = buildMovementNotesWithSource(
    source,
    buildPurchaseMovementContext(purchaseId, label, notes),
  )

  return movement.targetType === "ALIMENT"
    ? createFeedMovement({
        organizationId,
        feedStockId: movement.targetStockId,
        type: "ENTREE",
        quantityKg: movement.quantity,
        unitPriceFcfa: movement.unitPriceFcfa,
        reference: movementReference,
        notes: movementNotes,
        date: purchaseDate,
      })
    : createMedicineMovement({
        organizationId,
        medicineStockId: movement.targetStockId,
        type: "ENTREE",
        quantity: movement.quantity,
        unitPriceFcfa: movement.unitPriceFcfa,
        reference: movementReference,
        notes: movementNotes,
        date: purchaseDate,
      })
}

async function reversePurchaseEntryMovement(args: {
  organizationId: string
  purchaseId: string
  purchaseDate: Date
  reference: string | null
  notes: string | null | undefined
  movement: StockMovementPlan
  label: string
}) {
  const {
    organizationId,
    purchaseId,
    purchaseDate,
    reference,
    notes,
    movement,
    label,
  } = args

  const movementReference = reference || `ACHAT-${purchaseId}`
  const movementNotes = buildMovementNotesWithSource(
    "CORRECTION",
    buildPurchaseMovementContext(purchaseId, label, notes),
  )

  return movement.targetType === "ALIMENT"
    ? createFeedMovement({
        organizationId,
        feedStockId: movement.targetStockId,
        type: "SORTIE",
        quantityKg: movement.quantity,
        unitPriceFcfa: movement.unitPriceFcfa,
        reference: movementReference,
        notes: movementNotes,
        date: purchaseDate,
      })
    : createMedicineMovement({
        organizationId,
        medicineStockId: movement.targetStockId,
        type: "SORTIE",
        quantity: movement.quantity,
        unitPriceFcfa: movement.unitPriceFcfa,
        reference: movementReference,
        notes: movementNotes,
        date: purchaseDate,
      })
}

async function persistPurchaseState(args: {
  organizationId: string
  purchaseId: string
  supplierId: string | undefined
  purchaseDate: Date
  reference: string | null
  notes: string | null
  items: ItemsWithTotal
}) {
  const { purchaseId, supplierId, purchaseDate, reference, notes, items } = args
  const totalFcfa = totalFromItems(items)

  await prisma.$transaction(async (tx) => {
    await tx.purchase.update({
      where: { id: purchaseId },
      data: {
        supplierId: supplierId ?? null,
        purchaseDate,
        reference,
        notes,
        totalFcfa,
      },
    })

    await tx.purchaseItem.deleteMany({
      where: { purchaseId },
    })

    await tx.purchaseItem.createMany({
      data: items.map((item) => ({
        purchaseId,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPriceFcfa: item.unitPriceFcfa,
        totalFcfa: item.totalFcfa,
      })),
    })
  })
}

function lifecycleSelect() {
  return {
    id: true,
    organizationId: true,
    supplierId: true,
    purchaseDate: true,
    reference: true,
    notes: true,
    totalFcfa: true,
    paidFcfa: true,
    createdById: true,
    items: {
      select: {
        description: true,
        quantity: true,
        unit: true,
        unitPriceFcfa: true,
        totalFcfa: true,
      },
    },
    _count: { select: { payments: true } },
  } as const
}

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
      return { success: false, error: "Donnees invalides" }
    }

    const { organizationId, limit } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult

    const purchases = await prisma.purchase.findMany({
      where: { organizationId },
      orderBy: { purchaseDate: "desc" },
      take: limit,
      select: {
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
            description: true,
            quantity: true,
            unit: true,
            unitPriceFcfa: true,
            totalFcfa: true,
          },
        },
      },
    })

    return {
      success: true,
      data: purchases.map((purchase) => ({
        ...purchase,
        balanceFcfa: purchase.totalFcfa - purchase.paidFcfa,
        stockImpact: parsePurchaseStockImpact(purchase.notes),
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
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Donnees invalides",
      }
    }

    const {
      organizationId,
      supplierId,
      purchaseDate,
      reference,
      notes,
      items,
      stockImpact,
    } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult

    if (!canPerformAction(membershipResult.data.role, "CREATE_PURCHASE")) {
      return { success: false, error: "Permission refusee" }
    }

    const supplier = await validateSupplier(organizationId, supplierId)
    if (supplierId && !supplier) {
      return { success: false, error: "Fournisseur introuvable" }
    }

    const itemsWithTotal = buildItemsWithTotal(items)
    const normalizedStockImpact = normalizeStockImpact(stockImpact)
    const nextMovementPlan = await resolveNextMovementPlan({
      organizationId,
      items: itemsWithTotal,
      stockImpact: normalizedStockImpact,
    })
    if (!nextMovementPlan.success) return nextMovementPlan

    const purchaseNotes = buildPurchaseNotesWithStockImpact(
      normalizedStockImpact,
      notes || null,
    )

    const purchase = await prisma.purchase.create({
      data: {
        organizationId,
        supplierId: supplierId ?? null,
        purchaseDate,
        reference: reference || null,
        notes: purchaseNotes,
        totalFcfa: totalFromItems(itemsWithTotal),
        paidFcfa: 0,
        createdById: sessionResult.data.user.id,
        items: {
          create: itemsWithTotal,
        },
      },
      select: { id: true },
    })

    if (nextMovementPlan.data) {
      const movementResult = await createPurchaseEntryMovement({
        organizationId,
        purchaseId: purchase.id,
        purchaseDate,
        reference: reference || null,
        notes: notes || null,
        movement: nextMovementPlan.data,
        source: "ACHAT",
        label: "Creation achat",
      })

      if (!movementResult.success) {
        await prisma.purchase.delete({ where: { id: purchase.id } })
        return { success: false, error: movementResult.error }
      }
    }

    await createAuditLog({
      userId: sessionResult.data.user.id,
      organizationId,
      action: AuditAction.CREATE,
      resourceType: "Purchase",
      resourceId: purchase.id,
      after: {
        totalFcfa: totalFromItems(itemsWithTotal),
        itemCount: itemsWithTotal.length,
        stockImpact: normalizedStockImpact,
      },
    })

    return { success: true, data: { id: purchase.id } }
  } catch {
    return { success: false, error: "Impossible de creer l'achat" }
  }
}

// ---------------------------------------------------------------------------
// updatePurchase
// ---------------------------------------------------------------------------

export async function updatePurchase(
  data: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = updatePurchaseSchema.safeParse(data)
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Donnees invalides",
      }
    }

    const {
      organizationId,
      purchaseId,
      supplierId,
      purchaseDate,
      reference,
      notes,
      items,
      stockImpact,
    } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult

    if (!canPerformAction(membershipResult.data.role, "CREATE_PURCHASE")) {
      return { success: false, error: "Permission refusee" }
    }

    const existing = await prisma.purchase.findFirst({
      where: { id: purchaseId, organizationId },
      select: lifecycleSelect(),
    })

    if (!existing) {
      return { success: false, error: "Achat introuvable" }
    }

    if (existing._count.payments > 0 || existing.paidFcfa > 0) {
      return {
        success: false,
        error: "Un achat avec paiement ne peut plus etre modifie",
      }
    }

    const supplier = await validateSupplier(organizationId, supplierId)
    if (supplierId && !supplier) {
      return { success: false, error: "Fournisseur introuvable" }
    }

    const itemsWithTotal = buildItemsWithTotal(items)
    const normalizedStockImpact = normalizeStockImpact(stockImpact)
    const nextMovementPlan = await resolveNextMovementPlan({
      organizationId,
      items: itemsWithTotal,
      stockImpact: normalizedStockImpact,
    })
    if (!nextMovementPlan.success) return nextMovementPlan

    const currentMovementPlan = buildCurrentMovementPlan(
      existing as PurchaseRecordForLifecycle,
    )
    if (!currentMovementPlan.success) return currentMovementPlan

    const previousUserNotes = existing.notes
    const nextPurchaseNotes = buildPurchaseNotesWithStockImpact(
      normalizedStockImpact,
      notes || null,
    )

    const stockSignatureChanged =
      purchaseMovementSignature(
        currentMovementPlan.data,
        existing.reference,
        existing.purchaseDate,
      ) !==
      purchaseMovementSignature(
        nextMovementPlan.data,
        reference || null,
        purchaseDate,
      )

    if (!stockSignatureChanged) {
      await persistPurchaseState({
        organizationId,
        purchaseId,
        supplierId,
        purchaseDate,
        reference: reference || null,
        notes: nextPurchaseNotes,
        items: itemsWithTotal,
      })

      await createAuditLog({
        userId: sessionResult.data.user.id,
        organizationId,
        action: AuditAction.UPDATE,
        resourceType: "Purchase",
        resourceId: purchaseId,
        before: {
          supplierId: existing.supplierId,
          purchaseDate: existing.purchaseDate,
          reference: existing.reference,
          notes: existing.notes,
          items: existing.items,
        },
        after: {
          supplierId: supplierId ?? null,
          purchaseDate,
          reference: reference || null,
          notes: nextPurchaseNotes,
          items: itemsWithTotal,
          stockImpact: normalizedStockImpact,
        },
      })

      return { success: true, data: { id: purchaseId } }
    }

    if (nextMovementPlan.data) {
      const createNextEntryResult = await createPurchaseEntryMovement({
        organizationId,
        purchaseId,
        purchaseDate,
        reference: reference || null,
        notes: notes || null,
        movement: nextMovementPlan.data,
        source: "ACHAT",
        label: "Reconciliation achat - nouvelle entree",
      })

      if (!createNextEntryResult.success) {
        return { success: false, error: createNextEntryResult.error }
      }

      try {
        await persistPurchaseState({
          organizationId,
          purchaseId,
          supplierId,
          purchaseDate,
          reference: reference || null,
          notes: nextPurchaseNotes,
          items: itemsWithTotal,
        })
      } catch {
        await reversePurchaseEntryMovement({
          organizationId,
          purchaseId,
          purchaseDate,
          reference: reference || null,
          notes: notes || null,
          movement: nextMovementPlan.data,
          label: "Rollback mise a jour achat",
        })

        return {
          success: false,
          error: "Impossible de mettre a jour l'achat apres creation du nouveau mouvement",
        }
      }

      if (currentMovementPlan.data) {
        const reverseCurrentResult = await reversePurchaseEntryMovement({
          organizationId,
          purchaseId,
          purchaseDate: existing.purchaseDate,
          reference: existing.reference,
          notes: previousUserNotes,
          movement: currentMovementPlan.data,
          label: "Reconciliation achat - annulation ancienne entree",
        })

        if (!reverseCurrentResult.success) {
          await persistPurchaseState({
            organizationId,
            purchaseId,
            supplierId: existing.supplierId ?? undefined,
            purchaseDate: existing.purchaseDate,
            reference: existing.reference,
            notes: existing.notes,
            items: existing.items,
          })

          await reversePurchaseEntryMovement({
            organizationId,
            purchaseId,
            purchaseDate,
            reference: reference || null,
            notes: notes || null,
            movement: nextMovementPlan.data,
            label: "Rollback nouvelle entree achat",
          })

          return { success: false, error: reverseCurrentResult.error }
        }
      }
    } else {
      if (!currentMovementPlan.data) {
        await persistPurchaseState({
          organizationId,
          purchaseId,
          supplierId,
          purchaseDate,
          reference: reference || null,
          notes: nextPurchaseNotes,
          items: itemsWithTotal,
        })
      } else {
        const reverseCurrentResult = await reversePurchaseEntryMovement({
          organizationId,
          purchaseId,
          purchaseDate: existing.purchaseDate,
          reference: existing.reference,
          notes: previousUserNotes,
          movement: currentMovementPlan.data,
          label: "Suppression impact stock achat",
        })

        if (!reverseCurrentResult.success) {
          return { success: false, error: reverseCurrentResult.error }
        }

        try {
          await persistPurchaseState({
            organizationId,
            purchaseId,
            supplierId,
            purchaseDate,
            reference: reference || null,
            notes: nextPurchaseNotes,
            items: itemsWithTotal,
          })
        } catch {
          await createPurchaseEntryMovement({
            organizationId,
            purchaseId,
            purchaseDate: existing.purchaseDate,
            reference: existing.reference,
            notes: previousUserNotes,
            movement: currentMovementPlan.data,
            source: "CORRECTION",
            label: "Rollback suppression impact stock achat",
          })

          return {
            success: false,
            error: "Impossible de mettre a jour l'achat apres reversion du stock",
          }
        }
      }
    }

    await createAuditLog({
      userId: sessionResult.data.user.id,
      organizationId,
      action: AuditAction.UPDATE,
      resourceType: "Purchase",
      resourceId: purchaseId,
      before: {
        supplierId: existing.supplierId,
        purchaseDate: existing.purchaseDate,
        reference: existing.reference,
        notes: existing.notes,
        items: existing.items,
        stockImpact: parsePurchaseStockImpact(existing.notes),
      },
      after: {
        supplierId: supplierId ?? null,
        purchaseDate,
        reference: reference || null,
        notes: nextPurchaseNotes,
        items: itemsWithTotal,
        stockImpact: normalizedStockImpact,
      },
    })

    return { success: true, data: { id: purchaseId } }
  } catch {
    return { success: false, error: "Impossible de modifier l'achat" }
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
      return { success: false, error: "Donnees invalides" }
    }

    const { organizationId, purchaseId } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult

    if (!canPerformAction(membershipResult.data.role, "CREATE_PURCHASE")) {
      return { success: false, error: "Permission refusee" }
    }

    const purchase = await prisma.purchase.findFirst({
      where: { id: purchaseId, organizationId },
      select: lifecycleSelect(),
    })

    if (!purchase) return { success: false, error: "Achat introuvable" }

    if (purchase._count.payments > 0 || purchase.paidFcfa > 0) {
      return {
        success: false,
        error: "Impossible de supprimer un achat avec des paiements",
      }
    }

    const currentMovementPlan = buildCurrentMovementPlan(
      purchase as PurchaseRecordForLifecycle,
    )
    if (!currentMovementPlan.success) return currentMovementPlan

    if (currentMovementPlan.data) {
      const reverseResult = await reversePurchaseEntryMovement({
        organizationId,
        purchaseId,
        purchaseDate: purchase.purchaseDate,
        reference: purchase.reference,
        notes: purchase.notes,
        movement: currentMovementPlan.data,
        label: "Suppression achat",
      })

      if (!reverseResult.success) {
        return {
          success: false,
          error:
            `Suppression bloquee : impossible de reverser l'entree de stock liee. ${reverseResult.error}`,
        }
      }
    }

    await prisma.purchase.delete({ where: { id: purchaseId } })

    await createAuditLog({
      userId: sessionResult.data.user.id,
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

// ---------------------------------------------------------------------------
// getSuppliers - helper pour le formulaire de creation
// ---------------------------------------------------------------------------

export async function getSuppliers(
  data: unknown,
): Promise<ActionResult<{ id: string; name: string; type: string | null }[]>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = z.object({ organizationId: requiredIdSchema }).safeParse(data)
    if (!parsed.success) return { success: false, error: "Donnees invalides" }

    const { organizationId } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult

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
