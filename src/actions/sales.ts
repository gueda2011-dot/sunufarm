/**
 * SunuFarm - Server Actions : gestion des ventes
 *
 * Perimetre :
 *   - Lister et consulter les ventes d'une organisation
 *   - Creer / modifier / supprimer une vente
 *   - Relier provisoirement les ventes de FIENTE au stock aliment
 *
 * Regle cle :
 *   Aucune vente avec impact stock ne doit laisser un ecart silencieux
 *   entre ventes et stock. Si la reconciliation n'est pas possible,
 *   l'operation est bloquee ou rollbackee.
 */

"use server"

import { z } from "zod"

import prisma from "@/src/lib/prisma"
import {
  requireOrganizationAccess,
  type ActionResult,
} from "@/src/lib/auth"
import { createAuditLog, AuditAction } from "@/src/lib/audit"
import { canPerformAction } from "@/src/lib/permissions"
import {
  requiredIdSchema,
  optionalIdSchema,
  positiveIntSchema,
  dateSchema,
  optionalDateSchema,
} from "@/src/lib/validators"
import { SaleProductType } from "@/src/generated/prisma/client"
import { createFeedMovement } from "@/src/actions/stock"
import {
  buildMovementNotesWithSource,
  validateStockMovementInput,
} from "@/src/lib/stock-movement-conventions"
import {
  buildSaleMovementContext,
  buildSaleNotesWithStockImpact,
  parseSaleStockImpact,
  type SaleStockImpact,
} from "@/src/lib/sale-stock-impact"

const SALE_UNITS = ["KG", "PIECE", "PLATEAU", "CAISSE"] as const

export interface SaleItemSummary {
  id: string
  batchId: string | null
  description: string
  quantity: number
  unit: string
  unitPriceFcfa: number
  totalFcfa: number
}

export interface SaleSummary {
  id: string
  organizationId: string
  customerId: string | null
  invoiceId: string | null
  saleDate: Date
  productType: SaleProductType
  totalFcfa: number
  paidFcfa: number
  createdAt: Date
  customer: {
    id: string
    name: string
    phone: string | null
  } | null
  items: SaleItemSummary[]
  stockImpact: SaleStockImpact
}

export interface SaleDetail extends SaleSummary {
  notes: string | null
  createdById: string | null
  updatedAt: Date
}

type SaleItemsWithTotal = SaleItemSummary[]

type SaleStockMovementPlan = {
  feedStockId: string
  quantityKg: number
  unitPriceFcfa: number
}

type SaleRecordForLifecycle = {
  id: string
  organizationId: string
  customerId: string | null
  invoiceId: string | null
  saleDate: Date
  productType: SaleProductType
  totalFcfa: number
  paidFcfa: number
  notes: string | null
  items: SaleItemSummary[]
  _count: { payments: number }
}

const saleItemInputSchema = z.object({
  batchId: optionalIdSchema,
  description: z.string().min(1).max(255),
  quantity: z.number().positive(),
  unit: z.enum(SALE_UNITS),
  unitPriceFcfa: positiveIntSchema,
})

const saleStockImpactSchema = z.object({
  enabled: z.boolean().default(false),
  feedStockId: optionalIdSchema,
})

const getSalesSchema = z.object({
  organizationId: requiredIdSchema,
  customerId: optionalIdSchema,
  productType: z.nativeEnum(SaleProductType).optional(),
  fromDate: optionalDateSchema,
  toDate: optionalDateSchema,
  cursorDate: z.coerce.date().optional(),
  limit: z.number().int().min(1).max(100).default(20),
})

const getSaleSchema = z.object({
  organizationId: requiredIdSchema,
  saleId: requiredIdSchema,
})

const createSaleSchema = z.object({
  organizationId: requiredIdSchema,
  customerId: optionalIdSchema,
  saleDate: dateSchema,
  productType: z.nativeEnum(SaleProductType),
  notes: z.string().max(1000).optional(),
  items: z.array(saleItemInputSchema).min(1),
  stockImpact: saleStockImpactSchema.optional(),
})

const updateSaleSchema = z.object({
  organizationId: requiredIdSchema,
  saleId: requiredIdSchema,
  customerId: optionalIdSchema,
  saleDate: optionalDateSchema,
  productType: z.nativeEnum(SaleProductType).optional(),
  paidFcfa: z.number().int().nonnegative().optional(),
  notes: z.string().max(1000).optional(),
  items: z.array(saleItemInputSchema).min(1).optional(),
  stockImpact: saleStockImpactSchema.optional(),
})

const deleteSaleSchema = z.object({
  organizationId: requiredIdSchema,
  saleId: requiredIdSchema,
})

class BusinessRuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BusinessRuleError"
  }
}

const saleItemSelect = {
  id: true,
  batchId: true,
  description: true,
  quantity: true,
  unit: true,
  unitPriceFcfa: true,
  totalFcfa: true,
} as const

const saleSummarySelect = {
  id: true,
  organizationId: true,
  customerId: true,
  invoiceId: true,
  saleDate: true,
  productType: true,
  totalFcfa: true,
  paidFcfa: true,
  createdAt: true,
  customer: {
    select: { id: true, name: true, phone: true },
  },
  items: { select: saleItemSelect },
  notes: true,
} as const

const saleDetailSelect = {
  ...saleSummarySelect,
  createdById: true,
  updatedAt: true,
} as const

function computeItemTotal(quantity: number, unitPriceFcfa: number): number {
  return Math.round(quantity * unitPriceFcfa)
}

function computeSaleTotal(
  items: Array<{ quantity: number; unitPriceFcfa: number }>,
): number {
  return items.reduce(
    (sum, item) => sum + computeItemTotal(item.quantity, item.unitPriceFcfa),
    0,
  )
}

function buildItemsWithTotal(
  items: z.infer<typeof saleItemInputSchema>[],
): SaleItemsWithTotal {
  return items.map((item) => ({
    id: "",
    batchId: item.batchId ?? null,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unitPriceFcfa: item.unitPriceFcfa,
    totalFcfa: computeItemTotal(item.quantity, item.unitPriceFcfa),
  }))
}

function normalizeStockImpact(
  stockImpact: z.infer<typeof saleStockImpactSchema> | undefined,
): SaleStockImpact {
  return stockImpact?.enabled
    ? {
        enabled: true,
        feedStockId: stockImpact.feedStockId ?? null,
      }
    : {
        enabled: false,
        feedStockId: null,
      }
}

function movementDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function saleMovementSignature(
  movement: SaleStockMovementPlan | null,
  saleDate: Date,
) {
  if (!movement) return "NONE"

  return [
    movement.feedStockId,
    movement.quantityKg,
    movement.unitPriceFcfa,
    movementDateKey(saleDate),
  ].join("|")
}

async function validateItemBatchIds(
  items: Array<{ batchId?: string | null }>,
  organizationId: string,
): Promise<string | null> {
  const batchIds = [
    ...new Set(items.map((i) => i.batchId).filter((id): id is string => !!id)),
  ]
  if (batchIds.length === 0) return null

  const validBatches = await prisma.batch.findMany({
    where: { id: { in: batchIds }, organizationId, deletedAt: null },
    select: { id: true },
  })

  if (validBatches.length !== batchIds.length) {
    return "Un ou plusieurs lots references sont introuvables ou appartiennent a une autre organisation"
  }

  return null
}

async function validateCustomer(
  organizationId: string,
  customerId: string | undefined,
) {
  if (!customerId) return null

  return prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    select: { id: true },
  })
}

async function resolveNextMovementPlan(args: {
  organizationId: string
  productType: SaleProductType
  items: SaleItemsWithTotal
  stockImpact: SaleStockImpact
}): Promise<ActionResult<SaleStockMovementPlan | null>> {
  const { organizationId, productType, items, stockImpact } = args

  if (!stockImpact.enabled) {
    return { success: true, data: null }
  }

  if (productType !== SaleProductType.FIENTE) {
    return {
      success: false,
      error: "Seules les ventes de fiente peuvent impacter le stock dans cette phase",
    }
  }

  if (!stockImpact.feedStockId) {
    return {
      success: false,
      error: "Le stock cible est obligatoire si la vente impacte le stock",
    }
  }

  if (items.length !== 1) {
    return {
      success: false,
      error: "Une vente avec impact stock doit contenir une seule ligne pour cette phase",
    }
  }

  const [item] = items

  const basicValidation = validateStockMovementInput({
    type: "SORTIE",
    quantity: item.quantity,
    availableQuantity: Number.POSITIVE_INFINITY,
    stockId: stockImpact.feedStockId,
  })

  if (basicValidation) {
    return { success: false, error: basicValidation }
  }

  if (item.unit !== "KG") {
    return {
      success: false,
      error: "Une vente de fiente avec impact stock doit etre saisie en KG",
    }
  }

  const feedStock = await prisma.feedStock.findFirst({
    where: { id: stockImpact.feedStockId, organizationId },
    select: { id: true, quantityKg: true },
  })

  if (!feedStock) {
    return { success: false, error: "Stock cible introuvable" }
  }

  const stockValidation = validateStockMovementInput({
    type: "SORTIE",
    quantity: item.quantity,
    availableQuantity: feedStock.quantityKg,
    stockId: stockImpact.feedStockId,
  })

  if (stockValidation) {
    return { success: false, error: stockValidation }
  }

  return {
    success: true,
    data: {
      feedStockId: stockImpact.feedStockId,
      quantityKg: item.quantity,
      unitPriceFcfa: item.unitPriceFcfa,
    },
  }
}

function buildCurrentMovementPlan(
  sale: SaleRecordForLifecycle,
): ActionResult<SaleStockMovementPlan | null> {
  const impact = parseSaleStockImpact(sale.notes)

  if (!impact.enabled) {
    return { success: true, data: null }
  }

  if (sale.productType !== SaleProductType.FIENTE) {
    return {
      success: false,
      error: "Etat vente incoherent : impact stock actif sur un produit non pris en charge",
    }
  }

  if (!impact.feedStockId) {
    return {
      success: false,
      error: "Etat vente incoherent : impact stock actif sans stock cible exploitable",
    }
  }

  if (sale.items.length !== 1) {
    return {
      success: false,
      error: "Etat vente incoherent : une vente liee au stock devrait contenir une seule ligne",
    }
  }

  const [item] = sale.items
  return {
    success: true,
    data: {
      feedStockId: impact.feedStockId,
      quantityKg: item.quantity,
      unitPriceFcfa: item.unitPriceFcfa,
    },
  }
}

async function createSaleStockExit(args: {
  organizationId: string
  saleId: string
  saleDate: Date
  notes: string | null
  movement: SaleStockMovementPlan
  label: string
  source?: "VENTE" | "CORRECTION"
}): Promise<ActionResult<{ id: string }>> {
  const {
    organizationId,
    saleId,
    saleDate,
    notes,
    movement,
    label,
    source = "VENTE",
  } = args

  const movementNotes = buildMovementNotesWithSource(
    source,
    buildSaleMovementContext(saleId, label, notes),
  )

  const result = await createFeedMovement({
    organizationId,
    feedStockId: movement.feedStockId,
    type: "SORTIE",
    quantityKg: movement.quantityKg,
    unitPriceFcfa: movement.unitPriceFcfa,
    notes: movementNotes,
    date: saleDate,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  return { success: true, data: { id: result.data.id } }
}

async function reverseSaleStockExit(args: {
  organizationId: string
  saleId: string
  saleDate: Date
  notes: string | null
  movement: SaleStockMovementPlan
  label: string
}): Promise<ActionResult<{ id: string }>> {
  const { organizationId, saleId, saleDate, notes, movement, label } = args

  const movementNotes = buildMovementNotesWithSource(
    "CORRECTION",
    buildSaleMovementContext(saleId, label, notes),
  )

  const result = await createFeedMovement({
    organizationId,
    feedStockId: movement.feedStockId,
    type: "ENTREE",
    quantityKg: movement.quantityKg,
    unitPriceFcfa: movement.unitPriceFcfa,
    notes: movementNotes,
    date: saleDate,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  return { success: true, data: { id: result.data.id } }
}

async function persistSaleState(args: {
  saleId: string
  customerId: string | undefined
  saleDate: Date
  productType: SaleProductType
  paidFcfa: number
  notes: string | null
  items: SaleItemsWithTotal
}) {
  const {
    saleId,
    customerId,
    saleDate,
    productType,
    paidFcfa,
    notes,
    items,
  } = args

  await prisma.$transaction(async (tx) => {
    await tx.sale.update({
      where: { id: saleId },
      data: {
        customerId: customerId ?? null,
        saleDate,
        productType,
        paidFcfa,
        notes,
        totalFcfa: computeSaleTotal(items),
      },
    })

    await tx.saleItem.deleteMany({ where: { saleId } })
    await tx.saleItem.createMany({
      data: items.map((item) => ({
        saleId,
        batchId: item.batchId ?? null,
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
    customerId: true,
    invoiceId: true,
    saleDate: true,
    productType: true,
    totalFcfa: true,
    paidFcfa: true,
    notes: true,
    items: {
      select: saleItemSelect,
    },
    _count: { select: { payments: true } },
  } as const
}

function mapSaleSummary(sale: {
  id: string
  organizationId: string
  customerId: string | null
  invoiceId: string | null
  saleDate: Date
  productType: SaleProductType
  totalFcfa: number
  paidFcfa: number
  createdAt: Date
  notes: string | null
  customer: { id: string; name: string; phone: string | null } | null
  items: SaleItemSummary[]
}): SaleSummary {
  const { notes, ...summary } = sale
  return {
    ...summary,
    stockImpact: parseSaleStockImpact(notes),
  }
}

function mapSaleDetail(sale: {
  id: string
  organizationId: string
  customerId: string | null
  invoiceId: string | null
  saleDate: Date
  productType: SaleProductType
  totalFcfa: number
  paidFcfa: number
  createdAt: Date
  notes: string | null
  createdById: string | null
  updatedAt: Date
  customer: { id: string; name: string; phone: string | null } | null
  items: SaleItemSummary[]
}): SaleDetail {
  return {
    ...sale,
    stockImpact: parseSaleStockImpact(sale.notes),
  }
}

export async function getSales(
  data: unknown,
): Promise<ActionResult<SaleSummary[]>> {
  try {
    const parsed = getSalesSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const {
      organizationId,
      customerId,
      productType,
      fromDate,
      toDate,
      cursorDate,
      limit,
    } = parsed.data

    const accessResult = await requireOrganizationAccess(organizationId)
    if (!accessResult.success) return accessResult

    if (!canPerformAction(accessResult.data.membership.role, "VIEW_FINANCES")) {
      return { success: false, error: "Acces aux donnees financieres refuse" }
    }

    const sales = await prisma.sale.findMany({
      where: {
        organizationId,
        ...(customerId ? { customerId } : {}),
        ...(productType ? { productType } : {}),
        ...(fromDate || toDate
          ? {
              saleDate: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
        ...(cursorDate ? { saleDate: { lt: cursorDate } } : {}),
      },
      select: saleSummarySelect,
      orderBy: { saleDate: "desc" },
      take: limit,
    })

    return { success: true, data: sales.map(mapSaleSummary) }
  } catch {
    return { success: false, error: "Impossible de recuperer les ventes" }
  }
}

export async function getSale(
  data: unknown,
): Promise<ActionResult<SaleDetail>> {
  try {
    const parsed = getSaleSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const { organizationId, saleId } = parsed.data

    const accessResult = await requireOrganizationAccess(organizationId)
    if (!accessResult.success) return accessResult

    if (!canPerformAction(accessResult.data.membership.role, "VIEW_FINANCES")) {
      return { success: false, error: "Acces aux donnees financieres refuse" }
    }

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizationId },
      select: saleDetailSelect,
    })

    if (!sale) {
      return { success: false, error: "Vente introuvable" }
    }

    return { success: true, data: mapSaleDetail(sale) }
  } catch {
    return { success: false, error: "Impossible de recuperer la vente" }
  }
}

export async function createSale(
  data: unknown,
): Promise<ActionResult<SaleDetail>> {
  try {
    const parsed = createSaleSchema.safeParse(data)
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Donnees invalides",
      }
    }

    const {
      organizationId,
      customerId,
      saleDate,
      productType,
      notes,
      items,
      stockImpact,
    } = parsed.data

    const accessResult = await requireOrganizationAccess(organizationId)
    if (!accessResult.success) return accessResult

    const { session, membership, effectiveUserId } = accessResult.data

    if (!canPerformAction(membership.role, "CREATE_SALE")) {
      return { success: false, error: "Permission refusee" }
    }

    const customer = await validateCustomer(organizationId, customerId)
    if (customerId && !customer) {
      return { success: false, error: "Client introuvable" }
    }

    const batchError = await validateItemBatchIds(items, organizationId)
    if (batchError) {
      return { success: false, error: batchError }
    }

    const itemsWithTotal = buildItemsWithTotal(items)
    const normalizedStockImpact = normalizeStockImpact(stockImpact)
    const nextMovementPlan = await resolveNextMovementPlan({
      organizationId,
      productType,
      items: itemsWithTotal,
      stockImpact: normalizedStockImpact,
    })
    if (!nextMovementPlan.success) return nextMovementPlan

    const saleNotes = buildSaleNotesWithStockImpact(
      normalizedStockImpact,
      notes || null,
    )

    const sale = await prisma.sale.create({
      data: {
        organizationId,
        customerId: customerId ?? null,
        saleDate,
        productType,
        totalFcfa: computeSaleTotal(itemsWithTotal),
        paidFcfa: 0,
        notes: saleNotes,
        createdById: effectiveUserId,
        items: {
          create: itemsWithTotal.map((item) => ({
            batchId: item.batchId,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPriceFcfa: item.unitPriceFcfa,
            totalFcfa: item.totalFcfa,
          })),
        },
      },
      select: saleDetailSelect,
    })

    if (nextMovementPlan.data) {
      const movementResult = await createSaleStockExit({
        organizationId,
        saleId: sale.id,
        saleDate,
        notes: notes || null,
        movement: nextMovementPlan.data,
        label: "Sortie stock vente",
      })

      if (!movementResult.success) {
        await prisma.sale.delete({ where: { id: sale.id } })
        return {
          success: false,
          error:
            `Creation de la vente annulee : impossible d'enregistrer la sortie de stock. ${movementResult.error}`,
        }
      }
    }

    await createAuditLog({
      userId: effectiveUserId,
      organizationId,
      actorUserId: session.actorUserId,
      effectiveUserId: session.effectiveUserId,
      impersonationSessionId: session.impersonationSessionId,
      action: AuditAction.CREATE,
      resourceType: "SALE",
      resourceId: sale.id,
      after: {
        customerId: customerId ?? null,
        saleDate,
        productType,
        itemCount: itemsWithTotal.length,
        totalFcfa: computeSaleTotal(itemsWithTotal),
        stockImpact: normalizedStockImpact,
      },
    })

    return { success: true, data: mapSaleDetail(sale) }
  } catch {
    return { success: false, error: "Impossible de creer la vente" }
  }
}

export async function updateSale(
  data: unknown,
): Promise<ActionResult<SaleDetail>> {
  try {
    const parsed = updateSaleSchema.safeParse(data)
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Donnees invalides",
      }
    }

    const {
      organizationId,
      saleId,
      customerId,
      saleDate,
      productType,
      paidFcfa,
      notes,
      items,
      stockImpact,
    } = parsed.data

    const accessResult = await requireOrganizationAccess(organizationId)
    if (!accessResult.success) return accessResult

    const { session, membership, effectiveUserId } = accessResult.data

    if (!canPerformAction(membership.role, "CREATE_SALE")) {
      return { success: false, error: "Permission refusee" }
    }

    const existing = await prisma.sale.findFirst({
      where: { id: saleId, organizationId },
      select: lifecycleSelect(),
    })
    if (!existing) {
      return { success: false, error: "Vente introuvable" }
    }

    if (existing._count.payments > 0 || existing.paidFcfa > 0) {
      return {
        success: false,
        error: "Une vente avec encaissement ne peut plus etre modifiee",
      }
    }

    if (existing.invoiceId) {
      return {
        success: false,
        error: "Une vente deja facturee ne peut plus etre modifiee dans cette phase",
      }
    }

    const nextCustomerId =
      customerId === undefined ? existing.customerId ?? undefined : customerId
    const nextSaleDate = saleDate ?? existing.saleDate
    const nextProductType = productType ?? existing.productType
    const nextItems = items
      ? buildItemsWithTotal(items)
      : existing.items.map((item) => ({ ...item }))
    const nextPaidFcfa = paidFcfa ?? existing.paidFcfa

    const customer = await validateCustomer(organizationId, nextCustomerId)
    if (nextCustomerId && !customer) {
      return { success: false, error: "Client introuvable" }
    }

    const batchError = await validateItemBatchIds(nextItems, organizationId)
    if (batchError) {
      return { success: false, error: batchError }
    }

    const nextTotalFcfa = computeSaleTotal(nextItems)
    if (nextPaidFcfa > nextTotalFcfa) {
      return {
        success: false,
        error:
          `Le montant encaisse (${nextPaidFcfa} FCFA) depasse le total de la vente (${nextTotalFcfa} FCFA)`,
      }
    }

    const currentMovementPlan = buildCurrentMovementPlan(
      existing as SaleRecordForLifecycle,
    )
    if (!currentMovementPlan.success) return currentMovementPlan

    const normalizedStockImpact =
      stockImpact === undefined
        ? parseSaleStockImpact(existing.notes)
        : normalizeStockImpact(stockImpact)

    const nextMovementPlan = await resolveNextMovementPlan({
      organizationId,
      productType: nextProductType,
      items: nextItems,
      stockImpact: normalizedStockImpact,
    })
    if (!nextMovementPlan.success) return nextMovementPlan

    const previousUserNotes = existing.notes
    const nextSaleNotes = buildSaleNotesWithStockImpact(
      normalizedStockImpact,
      notes === undefined ? previousUserNotes : notes || null,
    )

    const stockSignatureChanged =
      saleMovementSignature(currentMovementPlan.data, existing.saleDate) !==
      saleMovementSignature(nextMovementPlan.data, nextSaleDate)

    if (stockSignatureChanged) {
      if (currentMovementPlan.data) {
        const reverseCurrent = await reverseSaleStockExit({
          organizationId,
          saleId,
          saleDate: existing.saleDate,
          notes: previousUserNotes,
          movement: currentMovementPlan.data,
          label: "Reconciliation vente - annulation ancienne sortie",
        })

        if (!reverseCurrent.success) {
          return {
            success: false,
            error:
              `Modification bloquee : impossible d'annuler l'ancienne sortie de stock. ${reverseCurrent.error}`,
          }
        }
      }

      if (nextMovementPlan.data) {
        const createNext = await createSaleStockExit({
          organizationId,
          saleId,
          saleDate: nextSaleDate,
          notes: notes === undefined ? previousUserNotes : notes || null,
          movement: nextMovementPlan.data,
          label: "Reconciliation vente - nouvelle sortie",
        })

        if (!createNext.success) {
          if (currentMovementPlan.data) {
            await createSaleStockExit({
              organizationId,
              saleId,
              saleDate: existing.saleDate,
              notes: previousUserNotes,
              movement: currentMovementPlan.data,
              label: "Rollback ancienne sortie vente",
              source: "CORRECTION",
            })
          }

          return {
            success: false,
            error:
              `Modification annulee : impossible d'appliquer la nouvelle sortie de stock. ${createNext.error}`,
          }
        }
      }

      try {
        await persistSaleState({
          saleId,
          customerId: nextCustomerId,
          saleDate: nextSaleDate,
          productType: nextProductType,
          paidFcfa: nextPaidFcfa,
          notes: nextSaleNotes,
          items: nextItems,
        })
      } catch {
        if (nextMovementPlan.data) {
          await reverseSaleStockExit({
            organizationId,
            saleId,
            saleDate: nextSaleDate,
            notes: notes === undefined ? previousUserNotes : notes || null,
            movement: nextMovementPlan.data,
            label: "Rollback nouvelle sortie vente",
          })
        }

        if (currentMovementPlan.data) {
          await createSaleStockExit({
            organizationId,
            saleId,
            saleDate: existing.saleDate,
            notes: previousUserNotes,
            movement: currentMovementPlan.data,
            label: "Rollback etat stock initial vente",
            source: "CORRECTION",
          })
        }

        return {
          success: false,
          error: "Impossible de mettre a jour la vente apres reconciliation du stock",
        }
      }
    } else {
      try {
        await persistSaleState({
          saleId,
          customerId: nextCustomerId,
          saleDate: nextSaleDate,
          productType: nextProductType,
          paidFcfa: nextPaidFcfa,
          notes: nextSaleNotes,
          items: nextItems,
        })
      } catch {
        return { success: false, error: "Impossible de mettre a jour la vente" }
      }
    }

    const updated = await prisma.sale.findFirst({
      where: { id: saleId, organizationId },
      select: saleDetailSelect,
    })

    if (!updated) {
      return { success: false, error: "Vente introuvable apres mise a jour" }
    }

    await createAuditLog({
      userId: effectiveUserId,
      organizationId,
      actorUserId: session.actorUserId,
      effectiveUserId: session.effectiveUserId,
      impersonationSessionId: session.impersonationSessionId,
      action: AuditAction.UPDATE,
      resourceType: "SALE",
      resourceId: saleId,
      before: {
        ...existing,
        stockImpact: parseSaleStockImpact(existing.notes),
      },
      after: {
        customerId: nextCustomerId ?? null,
        saleDate: nextSaleDate,
        productType: nextProductType,
        paidFcfa: nextPaidFcfa,
        notes: nextSaleNotes,
        items: nextItems,
        stockImpact: normalizedStockImpact,
      },
    })

    return { success: true, data: mapSaleDetail(updated) }
  } catch {
    return { success: false, error: "Impossible de mettre a jour la vente" }
  }
}

export async function deleteSale(
  data: unknown,
): Promise<ActionResult<void>> {
  try {
    const parsed = deleteSaleSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const { organizationId, saleId } = parsed.data

    const accessResult = await requireOrganizationAccess(organizationId)
    if (!accessResult.success) return accessResult

    const { session, membership, effectiveUserId } = accessResult.data

    if (!canPerformAction(membership.role, "CREATE_SALE")) {
      return { success: false, error: "Permission refusee" }
    }

    const existing = await prisma.sale.findFirst({
      where: { id: saleId, organizationId },
      select: lifecycleSelect(),
    })
    if (!existing) {
      return { success: false, error: "Vente introuvable" }
    }

    if (existing._count.payments > 0 || existing.paidFcfa > 0) {
      return {
        success: false,
        error: "Impossible de supprimer une vente avec encaissement",
      }
    }

    if (existing.invoiceId) {
      return {
        success: false,
        error: "Impossible de supprimer une vente deja facturee",
      }
    }

    const currentMovementPlan = buildCurrentMovementPlan(
      existing as SaleRecordForLifecycle,
    )
    if (!currentMovementPlan.success) return currentMovementPlan

    if (currentMovementPlan.data) {
      const reverseResult = await reverseSaleStockExit({
        organizationId,
        saleId,
        saleDate: existing.saleDate,
        notes: existing.notes,
        movement: currentMovementPlan.data,
        label: "Suppression vente",
      })

      if (!reverseResult.success) {
        return {
          success: false,
          error:
            `Suppression bloquee : impossible de reverser la sortie de stock liee. ${reverseResult.error}`,
        }
      }
    }

    try {
      await prisma.sale.delete({ where: { id: saleId } })
    } catch {
      if (currentMovementPlan.data) {
        await createSaleStockExit({
          organizationId,
          saleId,
          saleDate: existing.saleDate,
          notes: existing.notes,
          movement: currentMovementPlan.data,
          label: "Rollback suppression vente",
          source: "CORRECTION",
        })
      }

      return { success: false, error: "Impossible de supprimer la vente" }
    }

    await createAuditLog({
      userId: effectiveUserId,
      organizationId,
      actorUserId: session.actorUserId,
      effectiveUserId: session.effectiveUserId,
      impersonationSessionId: session.impersonationSessionId,
      action: AuditAction.DELETE,
      resourceType: "SALE",
      resourceId: saleId,
      before: {
        ...existing,
        stockImpact: parseSaleStockImpact(existing.notes),
      },
    })

    return { success: true, data: undefined }
  } catch (error) {
    if (error instanceof BusinessRuleError) {
      return { success: false, error: error.message }
    }

    return { success: false, error: "Impossible de supprimer la vente" }
  }
}
