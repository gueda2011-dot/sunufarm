"use server"

import { z } from "zod"
import prisma from "@/src/lib/prisma"
import { createAuditLog, AuditAction } from "@/src/lib/audit"
import { requireSession, type ActionResult } from "@/src/lib/auth"

const PURCHASE_ITEM_REFERENCE_PREFIX = "purchase-item:"

type OrphanKind = "FEED_PURCHASE_ORPHAN" | "MEDICINE_PURCHASE_ORPHAN"

export interface StockOrphanIssue {
  id: string
  kind: OrphanKind
  organizationId: string
  organizationName: string
  stockId: string
  stockName: string
  movementId: string
  movementDate: Date
  reference: string
  quantity: number
  unit: string
  totalFcfa: number | null
  currentStockQuantity: number
  movementCount: number
  linkedUsageCount: number
  safeToResolve: boolean
  resolutionHint: string
}

const resolveStockOrphanSchema = z.object({
  kind: z.enum(["FEED_PURCHASE_ORPHAN", "MEDICINE_PURCHASE_ORPHAN"]),
  movementId: z.string().cuid(),
})

async function requireSuperAdminUser() {
  const sessionResult = await requireSession()
  if (!sessionResult.success) return sessionResult

  const superAdminMembership = await prisma.userOrganization.findFirst({
    where: {
      userId: sessionResult.data.user.id,
      role: "SUPER_ADMIN",
    },
    select: {
      userId: true,
    },
  })

  if (!superAdminMembership) {
    return { success: false, error: "Permission refusee" } as const
  }

  return {
    success: true as const,
    data: {
      userId: sessionResult.data.user.id,
    },
  }
}

export async function getStockOrphanIssues(): Promise<ActionResult<StockOrphanIssue[]>> {
  try {
    const accessResult = await requireSuperAdminUser()
    if (!accessResult.success) return accessResult

    const [feedMovements, medicineMovements] = await Promise.all([
      prisma.feedMovement.findMany({
        where: {
          reference: { startsWith: PURCHASE_ITEM_REFERENCE_PREFIX },
        },
        select: {
          id: true,
          organizationId: true,
          reference: true,
          quantityKg: true,
          totalFcfa: true,
          date: true,
          feedStockId: true,
          feedStock: {
            select: {
              id: true,
              name: true,
              quantityKg: true,
              _count: { select: { movements: true } },
            },
          },
        },
      }),
      prisma.medicineMovement.findMany({
        where: {
          reference: { startsWith: PURCHASE_ITEM_REFERENCE_PREFIX },
        },
        select: {
          id: true,
          organizationId: true,
          reference: true,
          quantity: true,
          totalFcfa: true,
          date: true,
          medicineStockId: true,
          medicineStock: {
            select: {
              id: true,
              name: true,
              unit: true,
              quantityOnHand: true,
              _count: {
                select: {
                  movements: true,
                  vaccinationRecords: true,
                  treatmentRecords: true,
                },
              },
            },
          },
        },
      }),
    ])

    const purchaseItemIds = [
      ...feedMovements.map((movement) => movement.reference?.slice(PURCHASE_ITEM_REFERENCE_PREFIX.length) ?? ""),
      ...medicineMovements.map((movement) => movement.reference?.slice(PURCHASE_ITEM_REFERENCE_PREFIX.length) ?? ""),
    ].filter(Boolean)

    const existingPurchaseItems = purchaseItemIds.length === 0
      ? []
      : await prisma.purchaseItem.findMany({
          where: { id: { in: purchaseItemIds } },
          select: { id: true },
        })

    const existingPurchaseItemIds = new Set(existingPurchaseItems.map((item) => item.id))
    const organizationIds = Array.from(new Set([
      ...feedMovements.map((movement) => movement.organizationId),
      ...medicineMovements.map((movement) => movement.organizationId),
    ]))
    const organizations = organizationIds.length === 0
      ? []
      : await prisma.organization.findMany({
          where: { id: { in: organizationIds } },
          select: { id: true, name: true },
        })
    const organizationNames = new Map(
      organizations.map((organization) => [organization.id, organization.name]),
    )

    const feedIssues: StockOrphanIssue[] = feedMovements
      .filter((movement) => {
        const purchaseItemId = movement.reference?.slice(PURCHASE_ITEM_REFERENCE_PREFIX.length)
        return !!purchaseItemId && !existingPurchaseItemIds.has(purchaseItemId)
      })
      .map((movement) => {
        const safeToResolve =
          movement.feedStock.quantityKg === movement.quantityKg &&
          movement.feedStock._count.movements === 1

        return {
          id: `feed:${movement.id}`,
          kind: "FEED_PURCHASE_ORPHAN",
          organizationId: movement.organizationId,
          organizationName: organizationNames.get(movement.organizationId) ?? movement.organizationId,
          stockId: movement.feedStockId,
          stockName: movement.feedStock.name,
          movementId: movement.id,
          movementDate: movement.date,
          reference: movement.reference ?? "",
          quantity: movement.quantityKg,
          unit: "kg",
          totalFcfa: movement.totalFcfa,
          currentStockQuantity: movement.feedStock.quantityKg,
          movementCount: movement.feedStock._count.movements,
          linkedUsageCount: 0,
          safeToResolve,
          resolutionHint: safeToResolve
            ? "Correction automatique possible: supprimer le mouvement orphelin et l'article de stock."
            : "Cas non automatique: le stock a d'autres mouvements ou une quantite differente.",
        }
      })

    const medicineIssues: StockOrphanIssue[] = medicineMovements
      .filter((movement) => {
        const purchaseItemId = movement.reference?.slice(PURCHASE_ITEM_REFERENCE_PREFIX.length)
        return !!purchaseItemId && !existingPurchaseItemIds.has(purchaseItemId)
      })
      .map((movement) => {
        const linkedUsageCount =
          movement.medicineStock._count.vaccinationRecords +
          movement.medicineStock._count.treatmentRecords
        const safeToResolve =
          movement.medicineStock.quantityOnHand === movement.quantity &&
          movement.medicineStock._count.movements === 1 &&
          linkedUsageCount === 0

        return {
          id: `medicine:${movement.id}`,
          kind: "MEDICINE_PURCHASE_ORPHAN",
          organizationId: movement.organizationId,
          organizationName: organizationNames.get(movement.organizationId) ?? movement.organizationId,
          stockId: movement.medicineStockId,
          stockName: movement.medicineStock.name,
          movementId: movement.id,
          movementDate: movement.date,
          reference: movement.reference ?? "",
          quantity: movement.quantity,
          unit: movement.medicineStock.unit,
          totalFcfa: movement.totalFcfa,
          currentStockQuantity: movement.medicineStock.quantityOnHand,
          movementCount: movement.medicineStock._count.movements,
          linkedUsageCount,
          safeToResolve,
          resolutionHint: safeToResolve
            ? "Correction automatique possible: supprimer le mouvement orphelin et l'article de stock."
            : "Cas non automatique: le stock a deja d'autres mouvements ou a ete utilise en sante.",
        }
      })

    const issues = [...feedIssues, ...medicineIssues].sort(
      (a, b) => b.movementDate.getTime() - a.movementDate.getTime(),
    )

    return { success: true, data: issues }
  } catch {
    return { success: false, error: "Impossible d'analyser l'integrite du stock" }
  }
}

export async function resolveStockOrphanIssue(
  input: unknown,
): Promise<ActionResult<{ movementId: string; stockId: string }>> {
  try {
    const parsed = resolveStockOrphanSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const accessResult = await requireSuperAdminUser()
    if (!accessResult.success) return accessResult

    const { kind, movementId } = parsed.data

    if (kind === "FEED_PURCHASE_ORPHAN") {
      const movement = await prisma.feedMovement.findUnique({
        where: { id: movementId },
        select: {
          id: true,
          organizationId: true,
          reference: true,
          quantityKg: true,
          feedStockId: true,
          feedStock: {
            select: {
              id: true,
              name: true,
              quantityKg: true,
              _count: { select: { movements: true } },
            },
          },
        },
      })

      if (!movement || !movement.reference?.startsWith(PURCHASE_ITEM_REFERENCE_PREFIX)) {
        return { success: false, error: "Mouvement introuvable" }
      }

      const purchaseItemId = movement.reference.slice(PURCHASE_ITEM_REFERENCE_PREFIX.length)
      const purchaseItem = await prisma.purchaseItem.findUnique({
        where: { id: purchaseItemId },
        select: { id: true },
      })
      if (purchaseItem) {
        return { success: false, error: "Ce mouvement n'est plus orphelin" }
      }

      const safeToResolve =
        movement.feedStock.quantityKg === movement.quantityKg &&
        movement.feedStock._count.movements === 1
      if (!safeToResolve) {
        return { success: false, error: "Ce cas demande une correction manuelle plus avancee" }
      }

      await prisma.$transaction(async (tx) => {
        await tx.feedMovement.delete({ where: { id: movement.id } })
        await tx.feedStock.delete({ where: { id: movement.feedStockId } })
      })

      await createAuditLog({
        userId: accessResult.data.userId,
        organizationId: movement.organizationId,
        action: AuditAction.DELETE,
        resourceType: "ADMIN_STOCK_REPAIR",
        resourceId: movement.id,
        before: {
          kind,
          movementId: movement.id,
          stockId: movement.feedStockId,
          stockName: movement.feedStock.name,
          quantityKg: movement.quantityKg,
          reference: movement.reference,
        },
      })

      return { success: true, data: { movementId: movement.id, stockId: movement.feedStockId } }
    }

    const movement = await prisma.medicineMovement.findUnique({
      where: { id: movementId },
      select: {
        id: true,
        organizationId: true,
        reference: true,
        quantity: true,
        medicineStockId: true,
        medicineStock: {
          select: {
            id: true,
            name: true,
            quantityOnHand: true,
            unit: true,
            _count: {
              select: {
                movements: true,
                vaccinationRecords: true,
                treatmentRecords: true,
              },
            },
          },
        },
      },
    })

    if (!movement || !movement.reference?.startsWith(PURCHASE_ITEM_REFERENCE_PREFIX)) {
      return { success: false, error: "Mouvement introuvable" }
    }

    const purchaseItemId = movement.reference.slice(PURCHASE_ITEM_REFERENCE_PREFIX.length)
    const purchaseItem = await prisma.purchaseItem.findUnique({
      where: { id: purchaseItemId },
      select: { id: true },
    })
    if (purchaseItem) {
      return { success: false, error: "Ce mouvement n'est plus orphelin" }
    }

    const linkedUsageCount =
      movement.medicineStock._count.vaccinationRecords +
      movement.medicineStock._count.treatmentRecords
    const safeToResolve =
      movement.medicineStock.quantityOnHand === movement.quantity &&
      movement.medicineStock._count.movements === 1 &&
      linkedUsageCount === 0
    if (!safeToResolve) {
      return { success: false, error: "Ce cas demande une correction manuelle plus avancee" }
    }

    await prisma.$transaction(async (tx) => {
      await tx.medicineMovement.delete({ where: { id: movement.id } })
      await tx.medicineStock.delete({ where: { id: movement.medicineStockId } })
    })

    await createAuditLog({
      userId: accessResult.data.userId,
      organizationId: movement.organizationId,
      action: AuditAction.DELETE,
      resourceType: "ADMIN_STOCK_REPAIR",
      resourceId: movement.id,
      before: {
        kind,
        movementId: movement.id,
        stockId: movement.medicineStockId,
        stockName: movement.medicineStock.name,
        quantity: movement.quantity,
        unit: movement.medicineStock.unit,
        reference: movement.reference,
      },
    })

    return { success: true, data: { movementId: movement.id, stockId: movement.medicineStockId } }
  } catch {
    return { success: false, error: "Impossible de corriger cet orphelin de stock" }
  }
}
