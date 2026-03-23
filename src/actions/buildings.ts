"use server"

import { z } from "zod"
import prisma from "@/src/lib/prisma"
import {
  requireOrganizationAccess,
  type ActionResult,
} from "@/src/lib/auth"
import { createAuditLog, AuditAction } from "@/src/lib/audit"
import { canPerformAction, canAccessFarm } from "@/src/lib/permissions"
import { requiredIdSchema, positiveIntSchema } from "@/src/lib/validators"
import { BuildingType, BatchStatus } from "@/src/generated/prisma/client"

const getBuildingsSchema = z.object({
  organizationId: requiredIdSchema,
  farmId: requiredIdSchema,
})

const getBuildingSchema = z.object({
  organizationId: requiredIdSchema,
  farmId: requiredIdSchema,
  buildingId: requiredIdSchema,
})

const createBuildingSchema = z.object({
  organizationId: requiredIdSchema,
  farmId: requiredIdSchema,
  name: z.string().min(1).max(100),
  code: z.string().max(20).optional(),
  type: z.nativeEnum(BuildingType).default(BuildingType.POULAILLER_FERME),
  capacity: positiveIntSchema,
  surfaceM2: z.number().positive().optional(),
  ventilationType: z.string().max(50).optional(),
})

const updateBuildingSchema = z.object({
  organizationId: requiredIdSchema,
  farmId: requiredIdSchema,
  buildingId: requiredIdSchema,
  name: z.string().min(1).max(100).optional(),
  code: z.string().max(20).optional(),
  type: z.nativeEnum(BuildingType).optional(),
  capacity: positiveIntSchema.optional(),
  surfaceM2: z.number().positive().optional(),
  ventilationType: z.string().max(50).optional(),
})

const deleteBuildingSchema = z.object({
  organizationId: requiredIdSchema,
  farmId: requiredIdSchema,
  buildingId: requiredIdSchema,
})

export interface BuildingSummary {
  id: string
  organizationId: string
  farmId: string
  name: string
  code: string | null
  type: BuildingType
  capacity: number
  surfaceM2: number | null
  ventilationType: string | null
  createdAt: Date
  _count: {
    batches: number
  }
}

class BusinessRuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BusinessRuleError"
  }
}

const buildingSummarySelect = {
  id: true,
  organizationId: true,
  farmId: true,
  name: true,
  code: true,
  type: true,
  capacity: true,
  surfaceM2: true,
  ventilationType: true,
  createdAt: true,
  _count: {
    select: {
      batches: {
        where: { status: BatchStatus.ACTIVE },
      },
    },
  },
} as const

async function findActiveFarm(farmId: string, organizationId: string) {
  return prisma.farm.findFirst({
    where: { id: farmId, organizationId, deletedAt: null },
    select: { id: true },
  })
}

async function findActiveBuilding(
  buildingId: string,
  farmId: string,
  organizationId: string,
) {
  return prisma.building.findFirst({
    where: { id: buildingId, farmId, organizationId, deletedAt: null },
  })
}

export async function getBuildings(
  data: unknown,
): Promise<ActionResult<BuildingSummary[]>> {
  try {
    const parsed = getBuildingsSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const { organizationId, farmId } = parsed.data
    const accessResult = await requireOrganizationAccess(organizationId)
    if (!accessResult.success) return accessResult

    const { role, farmPermissions } = accessResult.data.membership

    if (!canAccessFarm(role, farmPermissions, farmId, "canRead")) {
      return { success: false, error: "Acces refuse a cette ferme" }
    }

    const farm = await findActiveFarm(farmId, organizationId)
    if (!farm) {
      return { success: false, error: "Ferme introuvable" }
    }

    const buildings = await prisma.building.findMany({
      where: { farmId, organizationId, deletedAt: null },
      select: buildingSummarySelect,
      orderBy: { name: "asc" },
    })

    return { success: true, data: buildings }
  } catch {
    return { success: false, error: "Impossible de recuperer les batiments" }
  }
}

export async function getBuilding(
  data: unknown,
): Promise<ActionResult<BuildingSummary>> {
  try {
    const parsed = getBuildingSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const { organizationId, farmId, buildingId } = parsed.data
    const accessResult = await requireOrganizationAccess(organizationId)
    if (!accessResult.success) return accessResult

    const { role, farmPermissions } = accessResult.data.membership

    if (!canAccessFarm(role, farmPermissions, farmId, "canRead")) {
      return { success: false, error: "Acces refuse a cette ferme" }
    }

    const building = await prisma.building.findFirst({
      where: { id: buildingId, farmId, organizationId, deletedAt: null },
      select: buildingSummarySelect,
    })

    if (!building) {
      return { success: false, error: "Batiment introuvable" }
    }

    return { success: true, data: building }
  } catch {
    return { success: false, error: "Impossible de recuperer le batiment" }
  }
}

export async function createBuilding(
  data: unknown,
): Promise<ActionResult<BuildingSummary>> {
  try {
    const parsed = createBuildingSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const { organizationId, farmId, ...buildingData } = parsed.data
    const accessResult = await requireOrganizationAccess(organizationId)
    if (!accessResult.success) return accessResult

    const { session, membership, effectiveUserId } = accessResult.data
    const { role, farmPermissions } = membership

    if (!canPerformAction(role, "MANAGE_FARMS")) {
      return { success: false, error: "Permission refusee" }
    }

    if (!canAccessFarm(role, farmPermissions, farmId, "canWrite")) {
      return { success: false, error: "Acces en ecriture refuse sur cette ferme" }
    }

    const farm = await findActiveFarm(farmId, organizationId)
    if (!farm) {
      return { success: false, error: "Ferme introuvable" }
    }

    const building = await prisma.building.create({
      data: { organizationId, farmId, ...buildingData },
      select: buildingSummarySelect,
    })

    await createAuditLog({
      userId: effectiveUserId,
      organizationId,
      actorUserId: session.actorUserId,
      effectiveUserId: session.effectiveUserId,
      impersonationSessionId: session.impersonationSessionId,
      action: AuditAction.CREATE,
      resourceType: "BUILDING",
      resourceId: building.id,
      after: buildingData,
    })

    return { success: true, data: building }
  } catch {
    return { success: false, error: "Impossible de creer le batiment" }
  }
}

export async function updateBuilding(
  data: unknown,
): Promise<ActionResult<BuildingSummary>> {
  try {
    const parsed = updateBuildingSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const { organizationId, farmId, buildingId, ...updates } = parsed.data
    const accessResult = await requireOrganizationAccess(organizationId)
    if (!accessResult.success) return accessResult

    const { session, membership, effectiveUserId } = accessResult.data
    const { role, farmPermissions } = membership

    if (!canPerformAction(role, "MANAGE_FARMS")) {
      return { success: false, error: "Permission refusee" }
    }

    if (!canAccessFarm(role, farmPermissions, farmId, "canWrite")) {
      return { success: false, error: "Acces en ecriture refuse sur cette ferme" }
    }

    const existing = await findActiveBuilding(buildingId, farmId, organizationId)
    if (!existing) {
      return { success: false, error: "Batiment introuvable" }
    }

    const building = await prisma.building.update({
      where: { id: buildingId },
      data: updates,
      select: buildingSummarySelect,
    })

    await createAuditLog({
      userId: effectiveUserId,
      organizationId,
      actorUserId: session.actorUserId,
      effectiveUserId: session.effectiveUserId,
      impersonationSessionId: session.impersonationSessionId,
      action: AuditAction.UPDATE,
      resourceType: "BUILDING",
      resourceId: buildingId,
      before: existing,
      after: updates,
    })

    return { success: true, data: building }
  } catch {
    return { success: false, error: "Impossible de mettre a jour le batiment" }
  }
}

export async function deleteBuilding(
  data: unknown,
): Promise<ActionResult<void>> {
  const parsed = deleteBuildingSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: "Donnees invalides" }
  }

  const { organizationId, farmId, buildingId } = parsed.data
  const accessResult = await requireOrganizationAccess(organizationId)
  if (!accessResult.success) return accessResult

  const { session, membership, effectiveUserId } = accessResult.data
  const { role, farmPermissions } = membership

  if (!canPerformAction(role, "MANAGE_FARMS")) {
    return { success: false, error: "Permission refusee" }
  }

  if (!canAccessFarm(role, farmPermissions, farmId, "canDelete")) {
    return { success: false, error: "Acces en suppression refuse sur cette ferme" }
  }

  const existing = await findActiveBuilding(buildingId, farmId, organizationId)
  if (!existing) {
    return { success: false, error: "Batiment introuvable" }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const activeBatchCount = await tx.batch.count({
        where: { buildingId, status: BatchStatus.ACTIVE },
      })
      if (activeBatchCount > 0) {
        throw new BusinessRuleError(
          `Impossible de supprimer le batiment : ${activeBatchCount} lot(s) actif(s) en cours`,
        )
      }

      await tx.building.update({
        where: { id: buildingId },
        data: { deletedAt: new Date() },
      })
    })

    await createAuditLog({
      userId: effectiveUserId,
      organizationId,
      actorUserId: session.actorUserId,
      effectiveUserId: session.effectiveUserId,
      impersonationSessionId: session.impersonationSessionId,
      action: AuditAction.DELETE,
      resourceType: "BUILDING",
      resourceId: buildingId,
      before: existing,
    })

    return { success: true, data: undefined }
  } catch (error) {
    if (error instanceof BusinessRuleError) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Impossible de supprimer le batiment" }
  }
}
