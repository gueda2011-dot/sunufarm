/**
 * SunuFarm — Server Actions : gestion des ventes
 *
 * Les ventes sont la composante revenu de la rentabilité par lot.
 * Ce module complète la couche financière avec expenses.ts.
 *
 * Architecture Sale / SaleItem :
 *   Sale      → entête de vente (organisation, client, date, total, paiement)
 *   SaleItem  → lignes de vente, chacune optionnellement liée à un lot (batchId)
 *
 *   Une vente n'est pas rattachée directement à un lot — c'est la ligne (SaleItem)
 *   qui porte le lien. Cela permet des ventes groupées (plusieurs lots) et des
 *   ventes sans lot précis (fientes d'une ferme en général).
 *
 * totalFcfa :
 *   Toujours calculé côté serveur : SUM(ROUND(quantity × unitPriceFcfa)).
 *   Jamais accepté du client — incohérence impossible.
 *
 * paidFcfa :
 *   Mis à jour directement sur Sale pour le MVP.
 *   Le modèle Payment (relation Payment[]) est géré en V2.
 *
 * Suppression (hard delete) :
 *   Autorisée uniquement si paidFcfa = 0 et invoiceId = null.
 *   La cascade onDelete: Cascade sur SaleItem supprime les lignes automatiquement.
 *
 * Périmètre MVP :
 *   - Lister et consulter les ventes d'une organisation
 *   - Créer une vente avec ses lignes (en une seule action)
 *   - Corriger une vente (header + remplacement optionnel des lignes)
 *   - Supprimer une vente vierge de paiement
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
import { SaleProductType, UserRole } from "@/src/generated/prisma/client"

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const clientMutationIdSchema = z.string().trim().min(1).max(100)

/** Unités de vente supportées au MVP */
const SALE_UNITS = ["KG", "PIECE", "PLATEAU", "CAISSE"] as const

// ---------------------------------------------------------------------------
// Schémas Zod
// ---------------------------------------------------------------------------

/** Ligne de vente — schéma commun à la création et au remplacement */
const saleItemInputSchema = z.object({
  /** Lot source optionnel — absent pour les ventes de fientes ou ventes génériques */
  batchId:       optionalIdSchema,
  description:   z.string().min(1).max(255),
  /** Float : 12.5 kg, 300 pièces, 25.5 plateaux */
  quantity:      z.number().positive(),
  unit:          z.enum(SALE_UNITS),
  /** Prix unitaire en FCFA — entier strict */
  unitPriceFcfa: positiveIntSchema,
})

const getSalesSchema = z.object({
  organizationId: requiredIdSchema,
  customerId:     optionalIdSchema,
  productType:    z.nativeEnum(SaleProductType).optional(),
  fromDate:       optionalDateSchema,
  toDate:         optionalDateSchema,
  /**
   * Cursor de pagination : saleDate de la dernière vente reçue.
   * La page suivante retourne les ventes dont saleDate est strictement antérieure.
   */
  cursorDate:     z.coerce.date().optional(),
  limit:          z.number().int().min(1).max(100).default(20),
})

const getSaleSchema = z.object({
  organizationId: requiredIdSchema,
  saleId:         requiredIdSchema,
})

const createSaleSchema = z.object({
  organizationId: requiredIdSchema,
  clientMutationId: clientMutationIdSchema.optional(),
  customerId:     optionalIdSchema,
  saleDate:       dateSchema,
  productType:    z.nativeEnum(SaleProductType),
  notes:          z.string().max(1000).optional(),
  /** Au moins une ligne de vente obligatoire */
  items:          z.array(saleItemInputSchema).min(1),
})

const updateSaleSchema = z.object({
  organizationId: requiredIdSchema,
  saleId:         requiredIdSchema,
  customerId:     optionalIdSchema,
  saleDate:       optionalDateSchema,
  /**
   * Montant encaissé en FCFA.
   * Doit être ≤ totalFcfa de la vente.
   * MVP : mise à jour directe (pas de modèle Payment).
   */
  paidFcfa:       z.number().int().nonnegative().optional(),
  notes:          z.string().max(1000).optional(),
  /**
   * Si fourni, remplace TOUTES les lignes existantes et recalcule totalFcfa.
   * Si absent, les lignes existantes sont conservées.
   */
  items:          z.array(saleItemInputSchema).min(1).optional(),
})

const deleteSaleSchema = z.object({
  organizationId: requiredIdSchema,
  saleId:         requiredIdSchema,
})

// ---------------------------------------------------------------------------
// Types retournés
// ---------------------------------------------------------------------------

export interface SaleItemSummary {
  id:            string
  batchId:       string | null
  description:   string
  quantity:      number
  unit:          string
  unitPriceFcfa: number
  totalFcfa:     number
}

export interface SaleSummary {
  id:             string
  organizationId: string
  customerId:     string | null
  invoiceId:      string | null
  saleDate:       Date
  productType:    SaleProductType
  totalFcfa:      number
  paidFcfa:       number
  createdAt:      Date
  customer: {
    id:    string
    name:  string
    phone: string | null
  } | null
  items: SaleItemSummary[]
}

export interface SaleDetail extends SaleSummary {
  notes:       string | null
  createdById: string | null
  updatedAt:   Date
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

const saleItemSelect = {
  id:            true,
  batchId:       true,
  description:   true,
  quantity:      true,
  unit:          true,
  unitPriceFcfa: true,
  totalFcfa:     true,
} as const

const saleSummarySelect = {
  id:             true,
  organizationId: true,
  customerId:     true,
  invoiceId:      true,
  saleDate:       true,
  productType:    true,
  totalFcfa:      true,
  paidFcfa:       true,
  createdAt:      true,
  customer: {
    select: { id: true, name: true, phone: true },
  },
  items: { select: saleItemSelect },
} as const

const saleDetailSelect = {
  ...saleSummarySelect,
  notes:       true,
  createdById: true,
  updatedAt:   true,
} as const

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

/**
 * Calcule le totalFcfa d'une ligne : ROUND(quantity × unitPriceFcfa).
 * Résultat toujours entier — cohérent avec le type Int du schéma Prisma.
 */
function computeItemTotal(quantity: number, unitPriceFcfa: number): number {
  return Math.round(quantity * unitPriceFcfa)
}

/**
 * Calcule le totalFcfa d'une vente depuis ses lignes.
 * Appelé systématiquement côté serveur — jamais lu depuis le client.
 */
function computeSaleTotal(
  items: Array<{ quantity: number; unitPriceFcfa: number }>,
): number {
  return items.reduce((sum, item) => sum + computeItemTotal(item.quantity, item.unitPriceFcfa), 0)
}

/**
 * Valide que tous les batchIds des lignes appartiennent à l'organisation.
 * Retourne null si tout est valide, ou un message d'erreur.
 */
async function validateItemBatchIds(
  items: Array<{ batchId?: string | null }>,
  organizationId: string,
): Promise<string | null> {
  const batchIds = [
    ...new Set(items.map((i) => i.batchId).filter((id): id is string => !!id)),
  ]
  if (batchIds.length === 0) return null

  const validBatches = await prisma.batch.findMany({
    where:  { id: { in: batchIds }, organizationId, deletedAt: null },
    select: { id: true },
  })

  if (validBatches.length !== batchIds.length) {
    return "Un ou plusieurs lots référencés sont introuvables ou appartiennent à une autre organisation"
  }
  return null
}

// ---------------------------------------------------------------------------
// 1. getSales
// ---------------------------------------------------------------------------

/**
 * Retourne les ventes d'une organisation avec filtres optionnels.
 *
 * Filtres cumulables :
 *   customerId   → ventes d'un client spécifique
 *   productType  → par type de produit (POULET_VIF, OEUF, FIENTE)
 *   fromDate / toDate → plage de dates sur saleDate (inclusive)
 *
 * Pagination cursor-based sur saleDate desc.
 * Requiert VIEW_FINANCES.
 */
export async function getSales(
  data: unknown,
): Promise<ActionResult<SaleSummary[]>> {
  try {
    const parsed = getSalesSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
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

    const accessResult = await requireOrganizationModuleContext(organizationId, "SALES")
    if (!accessResult.success) return accessResult
    const roleResult = requireRole(
      accessResult.data.membership,
      [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT],
      "Accès aux données financières refusé",
    )
    if (!roleResult.success) return roleResult

    const sales = await prisma.sale.findMany({
      where: {
        organizationId,
        ...(customerId   ? { customerId }   : {}),
        ...(productType  ? { productType }  : {}),
        ...(fromDate || toDate
          ? {
              saleDate: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate   ? { lte: toDate }   : {}),
              },
            }
          : {}),
        ...(cursorDate ? { saleDate: { lt: cursorDate } } : {}),
      },
      select:  saleSummarySelect,
      orderBy: { saleDate: "desc" },
      take:    limit,
    })

    return { success: true, data: sales }
  } catch {
    return { success: false, error: "Impossible de récupérer les ventes" }
  }
}

// ---------------------------------------------------------------------------
// 2. getSale
// ---------------------------------------------------------------------------

/**
 * Retourne le détail complet d'une vente avec ses lignes.
 * Requiert VIEW_FINANCES.
 */
export async function getSale(
  data: unknown,
): Promise<ActionResult<SaleDetail>> {
  try {
    const parsed = getSaleSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, saleId } = parsed.data

    const accessResult = await requireOrganizationModuleContext(organizationId, "SALES")
    if (!accessResult.success) return accessResult
    const roleResult = requireRole(
      accessResult.data.membership,
      [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT],
      "Accès aux données financières refusé",
    )
    if (!roleResult.success) return roleResult

    const sale = await prisma.sale.findFirst({
      where:  { id: saleId, organizationId },
      select: saleDetailSelect,
    })

    if (!sale) {
      return { success: false, error: "Vente introuvable" }
    }

    return { success: true, data: sale }
  } catch {
    return { success: false, error: "Impossible de récupérer la vente" }
  }
}

// ---------------------------------------------------------------------------
// 3. createSale
// ---------------------------------------------------------------------------

/**
 * Crée une vente avec ses lignes en une seule opération atomique.
 *
 * totalFcfa est calculé côté serveur depuis les lignes — jamais transmis par le client.
 * Si customerId est fourni, il doit appartenir à l'organisation.
 * Si une ligne a un batchId, le lot doit appartenir à l'organisation et ne pas être supprimé.
 *
 * Requiert CREATE_SALE.
 */
export async function createSale(
  data: unknown,
): Promise<ActionResult<SaleDetail>> {
  try {
    const parsed = createSaleSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, clientMutationId, customerId, items, ...saleData } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "SALES")
    if (!accessResult.success) return accessResult
    const actorId = accessResult.data.session.user.id
    const roleResult = requireRole(
      accessResult.data.membership,
      [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER],
      "Permission refusée",
    )
    if (!roleResult.success) return roleResult

    if (clientMutationId) {
      const existingSale = await prisma.sale.findFirst({
        where: { organizationId, clientMutationId },
        select: saleDetailSelect,
      })
      if (existingSale) {
        return { success: true, data: existingSale }
      }
    }

    // Valider le client si fourni
    if (customerId) {
      const customer = await prisma.customer.findFirst({
        where:  { id: customerId, organizationId },
        select: { id: true },
      })
      if (!customer) {
        return { success: false, error: "Client introuvable" }
      }
    }

    // Valider les lots référencés dans les lignes
    const batchError = await validateItemBatchIds(items, organizationId)
    if (batchError) {
      return { success: false, error: batchError }
    }

    // Calculer le total depuis les lignes
    const totalFcfa = computeSaleTotal(items)

    // Créer la vente + lignes dans une transaction
    const sale = await prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          organizationId,
          clientMutationId: clientMutationId ?? null,
          customerId:  customerId ?? null,
          totalFcfa,
          createdById: actorId,
          ...saleData,
          items: {
            create: items.map((item) => ({
              batchId:       item.batchId ?? null,
              description:   item.description,
              quantity:      item.quantity,
              unit:          item.unit,
              unitPriceFcfa: item.unitPriceFcfa,
              totalFcfa:     computeItemTotal(item.quantity, item.unitPriceFcfa),
            })),
          },
        },
        select: saleDetailSelect,
      })
      return created
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.CREATE,
      resourceType:   "SALE",
      resourceId:     sale.id,
      after:          { clientMutationId, customerId, totalFcfa, itemCount: items.length, ...saleData },
    })

    return { success: true, data: sale }
  } catch {
    return { success: false, error: "Impossible de créer la vente" }
  }
}

// ---------------------------------------------------------------------------
// 4. updateSale
// ---------------------------------------------------------------------------

/**
 * Corrige une vente existante.
 *
 * Si items est fourni → remplace TOUTES les lignes et recalcule totalFcfa.
 * Si items est absent → seul le header est mis à jour, totalFcfa inchangé.
 *
 * paidFcfa doit être ≤ totalFcfa final de la vente.
 *
 * Requiert CREATE_SALE.
 */
export async function updateSale(
  data: unknown,
): Promise<ActionResult<SaleDetail>> {
  try {
    const parsed = updateSaleSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, saleId, items, paidFcfa, ...headerUpdates } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "SALES")
    if (!accessResult.success) return accessResult
    const actorId = accessResult.data.session.user.id
    const roleResult = requireRole(
      accessResult.data.membership,
      [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER],
      "Permission refusée",
    )
    if (!roleResult.success) return roleResult

    const existing = await prisma.sale.findFirst({
      where:  { id: saleId, organizationId },
      select: { ...saleDetailSelect, paidFcfa: true, totalFcfa: true },
    })
    if (!existing) {
      return { success: false, error: "Vente introuvable" }
    }

    // Valider le nouveau client si fourni
    if (headerUpdates.customerId) {
      const customer = await prisma.customer.findFirst({
        where:  { id: headerUpdates.customerId, organizationId },
        select: { id: true },
      })
      if (!customer) {
        return { success: false, error: "Client introuvable" }
      }
    }

    // Valider les lots si les lignes sont remplacées
    if (items) {
      const batchError = await validateItemBatchIds(items, organizationId)
      if (batchError) {
        return { success: false, error: batchError }
      }
    }

    // Calculer le nouveau totalFcfa
    const newTotalFcfa = items ? computeSaleTotal(items) : existing.totalFcfa

    // Valider paidFcfa ≤ totalFcfa
    const finalPaidFcfa = paidFcfa ?? existing.paidFcfa
    if (finalPaidFcfa > newTotalFcfa) {
      return {
        success: false,
        error:   `Le montant encaissé (${finalPaidFcfa} FCFA) dépasse le total de la vente (${newTotalFcfa} FCFA)`,
      }
    }

    const sale = await prisma.$transaction(async (tx) => {
      if (items) {
        // Remplacement complet des lignes
        await tx.saleItem.deleteMany({ where: { saleId } })
        await tx.saleItem.createMany({
          data: items.map((item) => ({
            saleId,
            batchId:       item.batchId ?? null,
            description:   item.description,
            quantity:      item.quantity,
            unit:          item.unit,
            unitPriceFcfa: item.unitPriceFcfa,
            totalFcfa:     computeItemTotal(item.quantity, item.unitPriceFcfa),
          })),
        })
      }

      return tx.sale.update({
        where:  { id: saleId },
        data:   {
          ...headerUpdates,
          paidFcfa:  finalPaidFcfa,
          totalFcfa: newTotalFcfa,
        },
        select: saleDetailSelect,
      })
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.UPDATE,
      resourceType:   "SALE",
      resourceId:     saleId,
      before:         existing,
      after: {
        ...headerUpdates,
        paidFcfa: finalPaidFcfa,
        totalFcfa: newTotalFcfa,
        ...(items ? { itemCount: items.length } : {}),
      },
    })

    return { success: true, data: sale }
  } catch {
    return { success: false, error: "Impossible de mettre à jour la vente" }
  }
}

// ---------------------------------------------------------------------------
// 5. deleteSale
// ---------------------------------------------------------------------------

/**
 * Supprime définitivement une vente et ses lignes (hard delete).
 * Les SaleItems sont supprimés par cascade (onDelete: Cascade en base).
 *
 * Conditions requises (les deux) :
 *   paidFcfa = 0     → aucun paiement enregistré
 *   invoiceId = null → aucune facture émise
 *
 * Si l'une des deux conditions n'est pas remplie, la suppression est refusée.
 * La correction d'une vente partielle doit passer par updateSale.
 *
 * Retourne { success: true, data: undefined } — conforme à ActionResult<void>.
 * Requiert CREATE_SALE.
 */
export async function deleteSale(
  data: unknown,
): Promise<ActionResult<void>> {
  const parsed = deleteSaleSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: "Données invalides" }
  }

  const { organizationId, saleId } = parsed.data
  const accessResult = await requireOrganizationModuleContext(organizationId, "SALES")
  if (!accessResult.success) return accessResult
  const actorId = accessResult.data.session.user.id
  const roleResult = requireRole(
    accessResult.data.membership,
    [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER],
    "Permission refusée",
  )
  if (!roleResult.success) return roleResult

  const existing = await prisma.sale.findFirst({
    where:  { id: saleId, organizationId },
    select: saleDetailSelect,
  })
  if (!existing) {
    return { success: false, error: "Vente introuvable" }
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (existing.paidFcfa > 0) {
        throw new BusinessRuleError(
          `Impossible de supprimer cette vente : ${existing.paidFcfa.toLocaleString("fr-SN")} FCFA ont déjà été encaissés`,
        )
      }
      if (existing.invoiceId) {
        throw new BusinessRuleError(
          "Impossible de supprimer cette vente : une facture a déjà été émise",
        )
      }

      await tx.sale.delete({ where: { id: saleId } })
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.DELETE,
      resourceType:   "SALE",
      resourceId:     saleId,
      before:         existing,
    })

    return { success: true, data: undefined }
  } catch (error) {
    if (error instanceof BusinessRuleError) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Impossible de supprimer la vente" }
  }
}
