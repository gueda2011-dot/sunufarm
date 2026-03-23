/**
 * SunuFarm — Server Actions : gestion des clients
 *
 * CRUD complet sur le modèle Customer avec agrégation des ventes.
 *
 * getCustomers : retourne la liste des clients avec le nombre de ventes,
 *   le chiffre d'affaires total et le montant encaissé (pour le calcul
 *   des créances).
 *
 * Suppression : hard delete uniquement si le client n'a aucune vente liée.
 *   Si des ventes existent → refus pour préserver l'historique financier.
 *
 * Permissions :
 *   Lecture   → tous les membres de l'organisation
 *   Mutations → OWNER, MANAGER, ACCOUNTANT
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
import { requiredIdSchema } from "@/src/lib/validators"

// ---------------------------------------------------------------------------
// Types retournés
// ---------------------------------------------------------------------------

export interface CustomerSummary {
  id:             string
  name:           string
  phone:          string | null
  email:          string | null
  address:        string | null
  type:           string | null
  notes:          string | null
  createdAt:      Date
  salesCount:     number
  totalFcfa:      number   // CA total toutes ventes
  paidFcfa:       number   // encaissé total
  balanceFcfa:    number   // créance = totalFcfa - paidFcfa
}

// ---------------------------------------------------------------------------
// Schémas Zod
// ---------------------------------------------------------------------------

const listSchema = z.object({
  organizationId: requiredIdSchema,
  search:         z.string().optional(),
  type:           z.string().optional(),
})

const createCustomerSchema = z.object({
  organizationId: requiredIdSchema,
  name:    z.string().min(1, "Le nom est requis").max(150),
  phone:   z.string().max(30).optional().or(z.literal("")),
  email:   z.string().email("Email invalide").max(150).optional().or(z.literal("")),
  address: z.string().max(300).optional().or(z.literal("")),
  type:    z.enum(["PROFESSIONNEL", "REVENDEUR", "PARTICULIER"]).optional(),
  notes:   z.string().max(1000).optional().or(z.literal("")),
})

const updateCustomerSchema = z.object({
  organizationId: requiredIdSchema,
  customerId:     requiredIdSchema,
  name:    z.string().min(1, "Le nom est requis").max(150).optional(),
  phone:   z.string().max(30).optional().or(z.literal("")),
  email:   z.string().email("Email invalide").max(150).optional().or(z.literal("")),
  address: z.string().max(300).optional().or(z.literal("")),
  type:    z.enum(["PROFESSIONNEL", "REVENDEUR", "PARTICULIER"]).optional(),
  notes:   z.string().max(1000).optional().or(z.literal("")),
})

const deleteCustomerSchema = z.object({
  organizationId: requiredIdSchema,
  customerId:     requiredIdSchema,
})

// ---------------------------------------------------------------------------
// getCustomers
// ---------------------------------------------------------------------------

export async function getCustomers(
  data: unknown,
): Promise<ActionResult<CustomerSummary[]>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = listSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, search, type } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult

    const customers = await prisma.customer.findMany({
      where: {
        organizationId,
        ...(search ? {
          OR: [
            { name:  { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        } : {}),
        ...(type ? { type } : {}),
      },
      include: {
        sales: {
          select: {
            totalFcfa: true,
            paidFcfa:  true,
          },
        },
      },
      orderBy: { name: "asc" },
    })

    const result: CustomerSummary[] = customers.map((c) => {
      const totalFcfa   = c.sales.reduce((s, sale) => s + sale.totalFcfa, 0)
      const paidFcfa    = c.sales.reduce((s, sale) => s + sale.paidFcfa,  0)
      return {
        id:          c.id,
        name:        c.name,
        phone:       c.phone,
        email:       c.email,
        address:     c.address,
        type:        c.type,
        notes:       c.notes,
        createdAt:   c.createdAt,
        salesCount:  c.sales.length,
        totalFcfa,
        paidFcfa,
        balanceFcfa: totalFcfa - paidFcfa,
      }
    })

    return { success: true, data: result }
  } catch {
    return { success: false, error: "Impossible de charger les clients" }
  }
}

// ---------------------------------------------------------------------------
// createCustomer
// ---------------------------------------------------------------------------

export async function createCustomer(
  data: unknown,
): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = createCustomerSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Données invalides" }
    }

    const { organizationId, ...fields } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult

    if (!canPerformAction(membershipResult.data.role, "CREATE_SALE")) {
      return { success: false, error: "Permission refusée" }
    }

    const customer = await prisma.customer.create({
      data: {
        organizationId,
        name:    fields.name,
        phone:   fields.phone   || null,
        email:   fields.email   || null,
        address: fields.address || null,
        type:    fields.type    ?? null,
        notes:   fields.notes   || null,
      },
      select: { id: true, name: true },
    })

    await createAuditLog({
      userId:         sessionResult.data.user.id,
      organizationId,
      action:         AuditAction.CREATE,
      resourceType:   "Customer",
      resourceId:     customer.id,
      after:          customer,
    })

    return { success: true, data: customer }
  } catch {
    return { success: false, error: "Impossible de créer le client" }
  }
}

// ---------------------------------------------------------------------------
// updateCustomer
// ---------------------------------------------------------------------------

export async function updateCustomer(
  data: unknown,
): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = updateCustomerSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Données invalides" }
    }

    const { organizationId, customerId, ...fields } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult

    if (!canPerformAction(membershipResult.data.role, "CREATE_SALE")) {
      return { success: false, error: "Permission refusée" }
    }

    const existing = await prisma.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { id: true },
    })
    if (!existing) {
      return { success: false, error: "Client introuvable" }
    }

    const customer = await prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(fields.name    !== undefined ? { name:    fields.name }         : {}),
        ...(fields.phone   !== undefined ? { phone:   fields.phone   || null } : {}),
        ...(fields.email   !== undefined ? { email:   fields.email   || null } : {}),
        ...(fields.address !== undefined ? { address: fields.address || null } : {}),
        ...(fields.type    !== undefined ? { type:    fields.type    ?? null }  : {}),
        ...(fields.notes   !== undefined ? { notes:   fields.notes   || null }  : {}),
      },
      select: { id: true, name: true },
    })

    await createAuditLog({
      userId:         sessionResult.data.user.id,
      organizationId,
      action:         AuditAction.UPDATE,
      resourceType:   "Customer",
      resourceId:     customer.id,
      after:          customer,
    })

    return { success: true, data: customer }
  } catch {
    return { success: false, error: "Impossible de modifier le client" }
  }
}

// ---------------------------------------------------------------------------
// deleteCustomer
// ---------------------------------------------------------------------------

export async function deleteCustomer(
  data: unknown,
): Promise<ActionResult<void>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = deleteCustomerSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, customerId } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult

    if (!canPerformAction(membershipResult.data.role, "CREATE_SALE")) {
      return { success: false, error: "Permission refusée" }
    }

    const existing = await prisma.customer.findFirst({
      where:  { id: customerId, organizationId },
      select: { id: true, name: true, _count: { select: { sales: true } } },
    })
    if (!existing) {
      return { success: false, error: "Client introuvable" }
    }

    if (existing._count.sales > 0) {
      return {
        success: false,
        error: `Ce client a ${existing._count.sales} vente(s) associée(s). Suppression impossible.`,
      }
    }

    await prisma.customer.delete({ where: { id: customerId } })

    await createAuditLog({
      userId:         sessionResult.data.user.id,
      organizationId,
      action:         AuditAction.DELETE,
      resourceType:   "Customer",
      resourceId:     customerId,
      before:         existing,
    })

    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Impossible de supprimer le client" }
  }
}
