/**
 * SunuFarm — Server Actions : gestion des fermes
 *
 * Périmètre MVP :
 *   - Lister les fermes accessibles d'une organisation
 *   - Consulter le détail d'une ferme avec ses bâtiments
 *   - Créer, modifier et supprimer une ferme
 *
 * Hors périmètre (V2) :
 *   - Gestion des équipements
 *   - Carte interactive (géolocalisation)
 *   - Statistiques agrégées par ferme
 *
 * Contrôle d'accès par ferme :
 *   SUPER_ADMIN, OWNER  → accès total à toutes les fermes
 *   MANAGER             → lecture libre, écriture selon farmPermissions
 *   Autres rôles        → selon les entrées JSON farmPermissions uniquement
 *   (Voir canAccessFarm dans src/lib/permissions.ts)
 *
 * Soft delete :
 *   deleteFarm n'efface rien en base — pose deletedAt sur la ferme ET
 *   sur tous ses bâtiments dans une $transaction.
 *   Pré-condition : aucun lot actif (BatchStatus.ACTIVE) dans la ferme.
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
import {
  canPerformAction,
  canAccessFarm,
  parseFarmPermissions,
} from "@/src/lib/permissions"
import { requiredIdSchema, positiveIntSchema } from "@/src/lib/validators"
import { BatchStatus } from "@/src/generated/prisma/client"

// ---------------------------------------------------------------------------
// Schémas Zod
// ---------------------------------------------------------------------------

const getFarmsSchema = z.object({
  organizationId: requiredIdSchema,
})

const getFarmSchema = z.object({
  organizationId: requiredIdSchema,
  farmId:         requiredIdSchema,
})

const createFarmSchema = z.object({
  organizationId: requiredIdSchema,
  name:           z.string().min(1).max(100),
  code:           z.string().max(20).optional(),
  address:        z.string().max(255).optional(),
  latitude:       z.number().min(-90).max(90).optional(),
  longitude:      z.number().min(-180).max(180).optional(),
  totalCapacity:  positiveIntSchema.optional(),
})

const updateFarmSchema = z.object({
  organizationId: requiredIdSchema,
  farmId:         requiredIdSchema,
  name:           z.string().min(1).max(100).optional(),
  code:           z.string().max(20).optional(),
  address:        z.string().max(255).optional(),
  latitude:       z.number().min(-90).max(90).optional(),
  longitude:      z.number().min(-180).max(180).optional(),
  totalCapacity:  positiveIntSchema.optional(),
})

const deleteFarmSchema = z.object({
  organizationId: requiredIdSchema,
  farmId:         requiredIdSchema,
})

// ---------------------------------------------------------------------------
// Types retournés
// ---------------------------------------------------------------------------

export interface FarmSummary {
  id:            string
  organizationId: string
  name:          string
  code:          string | null
  address:       string | null
  latitude:      number | null
  longitude:     number | null
  totalCapacity: number | null
  createdAt:     Date
  _count: {
    buildings: number
  }
}

export interface FarmWithBuildings extends FarmSummary {
  buildings: Array<{
    id:             string
    name:           string
    code:           string | null
    type:           string
    capacity:       number
    surfaceM2:      number | null
    ventilationType: string | null
    createdAt:      Date
  }>
}

// ---------------------------------------------------------------------------
// Erreur métier interne (même pattern que organizations.ts)
// ---------------------------------------------------------------------------

class BusinessRuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BusinessRuleError"
  }
}

// Sélection Prisma partagée pour les résumés de ferme
const farmSummarySelect = {
  id:            true,
  organizationId: true,
  name:          true,
  code:          true,
  address:       true,
  latitude:      true,
  longitude:     true,
  totalCapacity: true,
  createdAt:     true,
  _count: {
    select: {
      buildings: {
        where: { deletedAt: null }, // uniquement les bâtiments actifs
      },
    },
  },
} as const

// Sélection des bâtiments actifs (non soft-deleted)
const activeBuildingSelect = {
  id:              true,
  name:            true,
  code:            true,
  type:            true,
  capacity:        true,
  surfaceM2:       true,
  ventilationType: true,
  createdAt:       true,
} as const

// ---------------------------------------------------------------------------
// 1. getFarms
// ---------------------------------------------------------------------------

/**
 * Retourne les fermes actives de l'organisation accessibles à l'utilisateur.
 *
 * Toutes les fermes actives sont chargées depuis la base, puis filtrées
 * en mémoire selon les droits de l'utilisateur (canAccessFarm).
 * Ce filtre en mémoire est acceptable au MVP (max ~10 fermes par organisation).
 */
export async function getFarms(
  data: unknown,
): Promise<ActionResult<FarmSummary[]>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = getFarmsSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult

    const { role, farmPermissions } = membershipResult.data

    const farms = await prisma.farm.findMany({
      where:   { organizationId, deletedAt: null },
      select:  farmSummarySelect,
      orderBy: { name: "asc" },
    })

    // Filtrer selon les droits de lecture par ferme
    const accessible = farms.filter((farm) =>
      canAccessFarm(role, farmPermissions, farm.id, "canRead"),
    )

    return { success: true, data: accessible }
  } catch {
    return { success: false, error: "Impossible de récupérer les fermes" }
  }
}

// ---------------------------------------------------------------------------
// 2. getFarm
// ---------------------------------------------------------------------------

/**
 * Retourne le détail d'une ferme avec ses bâtiments actifs.
 * Vérifie l'accès en lecture à la ferme spécifique.
 */
export async function getFarm(
  data: unknown,
): Promise<ActionResult<FarmWithBuildings>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = getFarmSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, farmId } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult

    const { role, farmPermissions } = membershipResult.data

    if (!canAccessFarm(role, farmPermissions, farmId, "canRead")) {
      return { success: false, error: "Accès refusé à cette ferme" }
    }

    const farm = await prisma.farm.findFirst({
      where:  { id: farmId, organizationId, deletedAt: null },
      select: {
        ...farmSummarySelect,
        buildings: {
          where:   { deletedAt: null },
          select:  activeBuildingSelect,
          orderBy: { name: "asc" },
        },
      },
    })

    if (!farm) {
      return { success: false, error: "Ferme introuvable" }
    }

    return { success: true, data: farm }
  } catch {
    return { success: false, error: "Impossible de récupérer la ferme" }
  }
}

// ---------------------------------------------------------------------------
// 3. createFarm
// ---------------------------------------------------------------------------

/**
 * Crée une nouvelle ferme dans l'organisation.
 * Requiert la permission MANAGE_FARMS (OWNER, MANAGER, SUPER_ADMIN).
 */
export async function createFarm(
  data: unknown,
): Promise<ActionResult<FarmSummary>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = createFarmSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, ...farmData } = parsed.data
    const actorId = sessionResult.data.user.id

    const membershipResult = await requireMembership(actorId, organizationId)
    if (!membershipResult.success) return membershipResult

    if (!canPerformAction(membershipResult.data.role, "MANAGE_FARMS")) {
      return { success: false, error: "Permission refusée" }
    }

    const farm = await prisma.farm.create({
      data:   { organizationId, ...farmData },
      select: farmSummarySelect,
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.CREATE,
      resourceType:   "FARM",
      resourceId:     farm.id,
      after:          farmData,
    })

    return { success: true, data: farm }
  } catch {
    return { success: false, error: "Impossible de créer la ferme" }
  }
}

// ---------------------------------------------------------------------------
// 4. updateFarm
// ---------------------------------------------------------------------------

/**
 * Modifie les informations d'une ferme.
 * Requiert la permission MANAGE_FARMS ET l'accès en écriture à la ferme.
 */
export async function updateFarm(
  data: unknown,
): Promise<ActionResult<FarmSummary>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = updateFarmSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, farmId, ...updates } = parsed.data
    const actorId = sessionResult.data.user.id

    const membershipResult = await requireMembership(actorId, organizationId)
    if (!membershipResult.success) return membershipResult

    const { role, farmPermissions } = membershipResult.data

    if (!canPerformAction(role, "MANAGE_FARMS")) {
      return { success: false, error: "Permission refusée" }
    }

    if (!canAccessFarm(role, farmPermissions, farmId, "canWrite")) {
      return { success: false, error: "Accès en écriture refusé sur cette ferme" }
    }

    // Vérifier l'existence avant la mise à jour (message d'erreur précis)
    const existing = await prisma.farm.findFirst({
      where: { id: farmId, organizationId, deletedAt: null },
    })
    if (!existing) {
      return { success: false, error: "Ferme introuvable" }
    }

    const farm = await prisma.farm.update({
      where:  { id: farmId },
      data:   updates,
      select: farmSummarySelect,
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.UPDATE,
      resourceType:   "FARM",
      resourceId:     farmId,
      before:         existing,
      after:          updates,
    })

    return { success: true, data: farm }
  } catch {
    return { success: false, error: "Impossible de mettre à jour la ferme" }
  }
}

// ---------------------------------------------------------------------------
// 5. deleteFarm
// ---------------------------------------------------------------------------

/**
 * Supprime une ferme (soft delete) avec tous ses bâtiments.
 *
 * Requiert la permission MANAGE_FARMS ET l'accès en suppression à la ferme.
 *
 * Pré-condition : aucun lot actif (BatchStatus.ACTIVE) ne doit être rattaché
 * à un bâtiment de cette ferme. Si des lots actifs existent, la suppression
 * est refusée pour préserver l'intégrité des données de production en cours.
 *
 * La suppression est atomique (via $transaction) :
 *   1. Vérification lots actifs
 *   2. Soft delete de tous les bâtiments actifs
 *   3. Soft delete de la ferme
 */
export async function deleteFarm(
  data: unknown,
): Promise<ActionResult<void>> {
  const sessionResult = await requireSession()
  if (!sessionResult.success) return sessionResult

  const parsed = deleteFarmSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: "Données invalides" }
  }

  const { organizationId, farmId } = parsed.data
  const actorId = sessionResult.data.user.id

  const membershipResult = await requireMembership(actorId, organizationId)
  if (!membershipResult.success) return membershipResult

  const { role, farmPermissions } = membershipResult.data

  if (!canPerformAction(role, "MANAGE_FARMS")) {
    return { success: false, error: "Permission refusée" }
  }

  if (!canAccessFarm(role, farmPermissions, farmId, "canDelete")) {
    return { success: false, error: "Accès en suppression refusé sur cette ferme" }
  }

  // Récupérer la ferme avant la transaction pour l'audit et les vérifications
  const existing = await prisma.farm.findFirst({
    where: { id: farmId, organizationId, deletedAt: null },
  })
  if (!existing) {
    return { success: false, error: "Ferme introuvable" }
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Bloquer la suppression si des lots actifs existent dans la ferme
      const activeBatchCount = await tx.batch.count({
        where: {
          building: { farmId },
          status:   BatchStatus.ACTIVE,
        },
      })
      if (activeBatchCount > 0) {
        throw new BusinessRuleError(
          `Impossible de supprimer la ferme : ${activeBatchCount} lot(s) actif(s) en cours`,
        )
      }

      const now = new Date()

      // Soft delete de tous les bâtiments actifs de la ferme
      await tx.building.updateMany({
        where: { farmId, deletedAt: null },
        data:  { deletedAt: now },
      })

      // Soft delete de la ferme
      await tx.farm.update({
        where: { id: farmId },
        data:  { deletedAt: now },
      })
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.DELETE,
      resourceType:   "FARM",
      resourceId:     farmId,
      before:         existing,
    })

    return { success: true, data: undefined }
  } catch (error) {
    if (error instanceof BusinessRuleError) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Impossible de supprimer la ferme" }
  }
}
