"use server"

import { z } from "zod"
import prisma from "@/src/lib/prisma"
import {
  requireSession,
  requireMembership,
  requireModuleAccess,
  type ActionResult,
} from "@/src/lib/auth"
import { createAuditLog, AuditAction } from "@/src/lib/audit"
import { canPerformAction } from "@/src/lib/permissions"
import { requiredIdSchema } from "@/src/lib/validators"

export interface SupplierSummary {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  type: string | null
  notes: string | null
  createdAt: Date
  purchasesCount: number
  batchesCount: number
  totalPurchasedFcfa: number
  paidFcfa: number
  balanceFcfa: number
}

const listSchema = z.object({
  organizationId: requiredIdSchema,
  search: z.string().optional(),
  type: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(100),
})

const createSupplierSchema = z.object({
  organizationId: requiredIdSchema,
  name: z.string().min(1, "Le nom est requis").max(150),
  phone: z.string().max(30).optional().or(z.literal("")),
  email: z.string().email("Email invalide").max(150).optional().or(z.literal("")),
  address: z.string().max(300).optional().or(z.literal("")),
  type: z.enum(["POUSSIN", "ALIMENT", "MEDICAMENT", "AUTRE"]).optional(),
  notes: z.string().max(1000).optional().or(z.literal("")),
})

const deleteSupplierSchema = z.object({
  organizationId: requiredIdSchema,
  supplierId: requiredIdSchema,
})

export async function getSuppliers(
  data: unknown,
): Promise<ActionResult<SupplierSummary[]>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = listSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const { organizationId, search, type, limit } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult
    const moduleAccessResult = requireModuleAccess(membershipResult.data, "SUPPLIERS")
    if (!moduleAccessResult.success) return moduleAccessResult

    const suppliers = await prisma.supplier.findMany({
      where: {
        organizationId,
        ...(search ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        } : {}),
        ...(type ? { type } : {}),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        address: true,
        type: true,
        notes: true,
        createdAt: true,
        _count: {
          select: {
            purchases: true,
            batches: true,
          },
        },
      },
      orderBy: { name: "asc" },
      take: limit,
    })

    const purchasesBySupplierId = suppliers.length > 0
      ? await prisma.purchase.groupBy({
          by: ["supplierId"],
          where: {
            organizationId,
            supplierId: { in: suppliers.map((supplier) => supplier.id) },
          },
          _sum: {
            totalFcfa: true,
            paidFcfa: true,
          },
          _count: {
            _all: true,
          },
        })
      : []

    const purchasesMap = new Map(
      purchasesBySupplierId.flatMap((entry) => (
        entry.supplierId
          ? [[entry.supplierId, entry]]
          : []
      )),
    )

    return {
      success: true,
      data: suppliers.map((supplier) => {
        const purchaseAggregate = purchasesMap.get(supplier.id)
        const totalPurchasedFcfa = purchaseAggregate?._sum.totalFcfa ?? 0
        const paidFcfa = purchaseAggregate?._sum.paidFcfa ?? 0

        return {
          id: supplier.id,
          name: supplier.name,
          phone: supplier.phone,
          email: supplier.email,
          address: supplier.address,
          type: supplier.type,
          notes: supplier.notes,
          createdAt: supplier.createdAt,
          purchasesCount: purchaseAggregate?._count._all ?? supplier._count.purchases,
          batchesCount: supplier._count.batches,
          totalPurchasedFcfa,
          paidFcfa,
          balanceFcfa: totalPurchasedFcfa - paidFcfa,
        }
      }),
    }
  } catch {
    return { success: false, error: "Impossible de charger les fournisseurs" }
  }
}

export async function createSupplier(
  data: unknown,
): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = createSupplierSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Donnees invalides" }
    }

    const { organizationId, ...fields } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult
    const moduleAccessResult = requireModuleAccess(membershipResult.data, "SUPPLIERS")
    if (!moduleAccessResult.success) return moduleAccessResult

    if (!canPerformAction(membershipResult.data.role, "CREATE_PURCHASE")) {
      return { success: false, error: "Permission refusee" }
    }

    const supplier = await prisma.supplier.create({
      data: {
        organizationId,
        name: fields.name,
        phone: fields.phone || null,
        email: fields.email || null,
        address: fields.address || null,
        type: fields.type ?? null,
        notes: fields.notes || null,
      },
      select: { id: true, name: true },
    })

    await createAuditLog({
      userId: sessionResult.data.user.id,
      organizationId,
      action: AuditAction.CREATE,
      resourceType: "Supplier",
      resourceId: supplier.id,
      after: supplier,
    })

    return { success: true, data: supplier }
  } catch {
    return { success: false, error: "Impossible de creer le fournisseur" }
  }
}

export async function deleteSupplier(
  data: unknown,
): Promise<ActionResult<void>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = deleteSupplierSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const { organizationId, supplierId } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult
    const moduleAccessResult = requireModuleAccess(membershipResult.data, "SUPPLIERS")
    if (!moduleAccessResult.success) return moduleAccessResult

    if (!canPerformAction(membershipResult.data.role, "CREATE_PURCHASE")) {
      return { success: false, error: "Permission refusee" }
    }

    const existing = await prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            purchases: true,
            batches: true,
          },
        },
      },
    })

    if (!existing) {
      return { success: false, error: "Fournisseur introuvable" }
    }

    if (existing._count.purchases > 0 || existing._count.batches > 0) {
      return {
        success: false,
        error: "Ce fournisseur est deja lie a des achats ou a des lots. Suppression impossible.",
      }
    }

    await prisma.supplier.delete({ where: { id: supplierId } })

    await createAuditLog({
      userId: sessionResult.data.user.id,
      organizationId,
      action: AuditAction.DELETE,
      resourceType: "Supplier",
      resourceId: supplierId,
      before: existing,
    })

    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Impossible de supprimer le fournisseur" }
  }
}
