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

    const { organizationId, search, type } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult

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
      include: {
        purchases: {
          select: {
            totalFcfa: true,
            paidFcfa: true,
          },
        },
        _count: {
          select: {
            purchases: true,
            batches: true,
          },
        },
      },
      orderBy: { name: "asc" },
    })

    return {
      success: true,
      data: suppliers.map((supplier) => {
        const totalPurchasedFcfa = supplier.purchases.reduce((sum, purchase) => sum + purchase.totalFcfa, 0)
        const paidFcfa = supplier.purchases.reduce((sum, purchase) => sum + purchase.paidFcfa, 0)

        return {
          id: supplier.id,
          name: supplier.name,
          phone: supplier.phone,
          email: supplier.email,
          address: supplier.address,
          type: supplier.type,
          notes: supplier.notes,
          createdAt: supplier.createdAt,
          purchasesCount: supplier._count.purchases,
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
