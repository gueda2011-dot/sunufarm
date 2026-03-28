/**
 * SunuFarm — Server Actions : gestion des bâtiments / poulaillers
 *
 * Périmètre MVP :
 *   - Lister et consulter les bâtiments d'une ferme
 *   - Créer, modifier et supprimer un bâtiment (soft delete)
 *
 * Chaîne d'appartenance — règle stricte :
 *   Chaque opération valide la chaîne complète organization → farm → building
 *   via une seule requête Prisma incluant organizationId + farmId dans le where.
 *   Le modèle Building ayant organizationId en direct, aucune jointure n'est
 *   nécessaire pour garantir l'isolation multi-tenant.
 *
 * Permissions par ferme :
 *   Lecture   → canAccessFarm(..., "canRead")
 *   Écriture  → MANAGE_FARMS + canAccessFarm(..., "canWrite")
 *   Suppression → MANAGE_FARMS + canAccessFarm(..., "canDelete")
 *
 * Soft delete :
 *   deleteBuilding refuse la suppression si des lots actifs (BatchStatus.ACTIVE)
 *   existent dans le bâtiment. Si aucun lot actif, pose deletedAt dans une
 *   $transaction (vérification + suppression atomiques).
 */

"use server"

import { z } from "zod"
import prisma from "@/src/lib/prisma"
import {
  requireOrganizationModuleContext,
  type ActionResult,
} from "@/src/lib/auth"
import { createAuditLog, AuditAction } from "@/src/lib/audit"
import { canPerformAction, canAccessFarm } from "@/src/lib/permissions"
import { requiredIdSchema, positiveIntSchema } from "@/src/lib/validators"
import { BuildingType, BatchStatus } from "@/src/generated/prisma/client"

// ---------------------------------------------------------------------------
// Schémas Zod
// ---------------------------------------------------------------------------

const getBuildingsSchema = z.object({
  organizationId: requiredIdSchema,
  farmId:         requiredIdSchema,
  limit:          z.number().int().min(1).max(100).default(50),
})

const getBuildingSchema = z.object({
  organizationId: requiredIdSchema,
  farmId:         requiredIdSchema,
  buildingId:     requiredIdSchema,
})

const createBuildingSchema = z.object({
  organizationId:  requiredIdSchema,
  farmId:          requiredIdSchema,
  name:            z.string().min(1).max(100),
  code:            z.string().max(20).optional(),
  type:            z.nativeEnum(BuildingType).default(BuildingType.POULAILLER_FERME),
  capacity:        positiveIntSchema,
  surfaceM2:       z.number().positive().optional(),
  ventilationType: z.string().max(50).optional(),
})

const updateBuildingSchema = z.object({
  organizationId:  requiredIdSchema,
  farmId:          requiredIdSchema,
  buildingId:      requiredIdSchema,
  name:            z.string().min(1).max(100).optional(),
  code:            z.string().max(20).optional(),
  type:            z.nativeEnum(BuildingType).optional(),
  capacity:        positiveIntSchema.optional(),
  surfaceM2:       z.number().positive().optional(),
  ventilationType: z.string().max(50).optional(),
})

const deleteBuildingSchema = z.object({
  organizationId: requiredIdSchema,
  farmId:         requiredIdSchema,
  buildingId:     requiredIdSchema,
})

// ---------------------------------------------------------------------------
// Types retournés
// ---------------------------------------------------------------------------

export interface BuildingSummary {
  id:              string
  organizationId:  string
  farmId:          string
  name:            string
  code:            string | null
  type:            BuildingType
  capacity:        number
  surfaceM2:       number | null
  ventilationType: string | null
  createdAt:       Date
  /** Nombre de lots actifs (BatchStatus.ACTIVE) — pour affichage UI */
  _count: {
    batches: number
  }
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

// Sélection Prisma partagée
const buildingSummarySelect = {
  id:              true,
  organizationId:  true,
  farmId:          true,
  name:            true,
  code:            true,
  type:            true,
  capacity:        true,
  surfaceM2:       true,
  ventilationType: true,
  createdAt:       true,
  _count: {
    select: {
      batches: {
        where: { status: BatchStatus.ACTIVE }, // lots actifs uniquement
      },
    },
  },
} as const

// ---------------------------------------------------------------------------
// Helper interne : valider qu'une ferme appartient à l'organisation
// Retourne la ferme ou null si introuvable / soft-deleted / mauvaise org.
// ---------------------------------------------------------------------------

async function findActiveFarm(farmId: string, organizationId: string) {
  return prisma.farm.findFirst({
    where: { id: farmId, organizationId, deletedAt: null },
    select: { id: true },
  })
}

// ---------------------------------------------------------------------------
// Helper interne : valider la chaîne complète org → farm → building
// Retourne le bâtiment ou null si introuvable / mauvaise ferme / mauvaise org.
// ---------------------------------------------------------------------------

async function findActiveBuilding(
  buildingId: string,
  farmId: string,
  organizationId: string,
) {
  return prisma.building.findFirst({
    where: { id: buildingId, farmId, organizationId, deletedAt: null },
  })
}

// ---------------------------------------------------------------------------
// 1. getBuildings
// ---------------------------------------------------------------------------

/**
 * Retourne les bâtiments actifs d'une ferme.
 * Requiert l'accès en lecture à la ferme.
 */
export async function getBuildings(
  data: unknown,
): Promise<ActionResult<BuildingSummary[]>> {
  try {
    const parsed = getBuildingsSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, farmId, limit } = parsed.data

    const accessResult = await requireOrganizationModuleContext(organizationId, "FARMS")
    if (!accessResult.success) return accessResult
    const { role, farmPermissions } = accessResult.data.membership

    if (!canAccessFarm(role, farmPermissions, farmId, "canRead")) {
      return { success: false, error: "Accès refusé à cette ferme" }
    }

    // Valider que la ferme appartient à l'organisation
    const farm = await findActiveFarm(farmId, organizationId)
    if (!farm) {
      return { success: false, error: "Ferme introuvable" }
    }

    const buildings = await prisma.building.findMany({
      where:   { farmId, organizationId, deletedAt: null },
      select:  buildingSummarySelect,
      orderBy: { name: "asc" },
      take:    limit,
    })

    return { success: true, data: buildings }
  } catch {
    return { success: false, error: "Impossible de récupérer les bâtiments" }
  }
}

// ---------------------------------------------------------------------------
// 2. getBuilding
// ---------------------------------------------------------------------------

/**
 * Retourne le détail d'un bâtiment.
 * Valide la chaîne complète organization → farm → building.
 */
export async function getBuilding(
  data: unknown,
): Promise<ActionResult<BuildingSummary>> {
  try {
    const parsed = getBuildingSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, farmId, buildingId } = parsed.data

    const accessResult = await requireOrganizationModuleContext(organizationId, "FARMS")
    if (!accessResult.success) return accessResult
    const { role, farmPermissions } = accessResult.data.membership

    if (!canAccessFarm(role, farmPermissions, farmId, "canRead")) {
      return { success: false, error: "Accès refusé à cette ferme" }
    }

    const building = await prisma.building.findFirst({
      where:  { id: buildingId, farmId, organizationId, deletedAt: null },
      select: buildingSummarySelect,
    })

    if (!building) {
      return { success: false, error: "Bâtiment introuvable" }
    }

    return { success: true, data: building }
  } catch {
    return { success: false, error: "Impossible de récupérer le bâtiment" }
  }
}

// ---------------------------------------------------------------------------
// 3. createBuilding
// ---------------------------------------------------------------------------

/**
 * Crée un bâtiment dans une ferme.
 * Requiert MANAGE_FARMS + accès en écriture à la ferme.
 */
export async function createBuilding(
  data: unknown,
): Promise<ActionResult<BuildingSummary>> {
  try {
    const parsed = createBuildingSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, farmId, ...buildingData } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "FARMS")
    if (!accessResult.success) return accessResult
    const actorId = accessResult.data.session.user.id
    const { role, farmPermissions } = accessResult.data.membership

    if (!canPerformAction(role, "MANAGE_FARMS")) {
      return { success: false, error: "Permission refusée" }
    }

    if (!canAccessFarm(role, farmPermissions, farmId, "canWrite")) {
      return { success: false, error: "Accès en écriture refusé sur cette ferme" }
    }

    // Valider que la ferme appartient à l'organisation
    const farm = await findActiveFarm(farmId, organizationId)
    if (!farm) {
      return { success: false, error: "Ferme introuvable" }
    }

    const building = await prisma.building.create({
      data:   { organizationId, farmId, ...buildingData },
      select: buildingSummarySelect,
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.CREATE,
      resourceType:   "BUILDING",
      resourceId:     building.id,
      after:          buildingData,
    })

    return { success: true, data: building }
  } catch {
    return { success: false, error: "Impossible de créer le bâtiment" }
  }
}

// ---------------------------------------------------------------------------
// 4. updateBuilding
// ---------------------------------------------------------------------------

/**
 * Modifie un bâtiment.
 * Requiert MANAGE_FARMS + accès en écriture à la ferme.
 * Valide la chaîne complète organization → farm → building.
 */
export async function updateBuilding(
  data: unknown,
): Promise<ActionResult<BuildingSummary>> {
  try {
    const parsed = updateBuildingSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, farmId, buildingId, ...updates } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "FARMS")
    if (!accessResult.success) return accessResult
    const actorId = accessResult.data.session.user.id
    const { role, farmPermissions } = accessResult.data.membership

    if (!canPerformAction(role, "MANAGE_FARMS")) {
      return { success: false, error: "Permission refusée" }
    }

    if (!canAccessFarm(role, farmPermissions, farmId, "canWrite")) {
      return { success: false, error: "Accès en écriture refusé sur cette ferme" }
    }

    // Valider la chaîne org → farm → building
    const existing = await findActiveBuilding(buildingId, farmId, organizationId)
    if (!existing) {
      return { success: false, error: "Bâtiment introuvable" }
    }

    const building = await prisma.building.update({
      where:  { id: buildingId },
      data:   updates,
      select: buildingSummarySelect,
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.UPDATE,
      resourceType:   "BUILDING",
      resourceId:     buildingId,
      before:         existing,
      after:          updates,
    })

    return { success: true, data: building }
  } catch {
    return { success: false, error: "Impossible de mettre à jour le bâtiment" }
  }
}

// ---------------------------------------------------------------------------
// 5. deleteBuilding
// ---------------------------------------------------------------------------

/**
 * Supprime un bâtiment (soft delete).
 * Requiert MANAGE_FARMS + accès en suppression à la ferme.
 *
 * Refuse la suppression si au moins un lot actif (BatchStatus.ACTIVE) existe
 * dans ce bâtiment — les données de production en cours ne doivent pas être
 * orphelines.
 *
 * La vérification et le soft delete sont atomiques ($transaction).
 * Retourne { success: true, data: undefined } — conforme à ActionResult<void>.
 */
export async function deleteBuilding(
  data: unknown,
): Promise<ActionResult<void>> {
  const parsed = deleteBuildingSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: "Données invalides" }
  }

  const { organizationId, farmId, buildingId } = parsed.data
  const accessResult = await requireOrganizationModuleContext(organizationId, "FARMS")
  if (!accessResult.success) return accessResult
  const actorId = accessResult.data.session.user.id
  const { role, farmPermissions } = accessResult.data.membership

  if (!canPerformAction(role, "MANAGE_FARMS")) {
    return { success: false, error: "Permission refusée" }
  }

  if (!canAccessFarm(role, farmPermissions, farmId, "canDelete")) {
    return { success: false, error: "Accès en suppression refusé sur cette ferme" }
  }

  // Valider la chaîne org → farm → building avant la transaction
  const existing = await findActiveBuilding(buildingId, farmId, organizationId)
  if (!existing) {
    return { success: false, error: "Bâtiment introuvable" }
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Bloquer la suppression si des lots actifs existent dans ce bâtiment
      const activeBatchCount = await tx.batch.count({
        where: { buildingId, status: BatchStatus.ACTIVE },
      })
      if (activeBatchCount > 0) {
        throw new BusinessRuleError(
          `Impossible de supprimer le bâtiment : ${activeBatchCount} lot(s) actif(s) en cours`,
        )
      }

      await tx.building.update({
        where: { id: buildingId },
        data:  { deletedAt: new Date() },
      })
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.DELETE,
      resourceType:   "BUILDING",
      resourceId:     buildingId,
      before:         existing,
    })

    return { success: true, data: undefined }
  } catch (error) {
    if (error instanceof BusinessRuleError) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Impossible de supprimer le bâtiment" }
  }
}
