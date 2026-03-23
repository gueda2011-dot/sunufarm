"use server"

import { z } from "zod"
import prisma from "@/src/lib/prisma"
import {
  requireOrganizationAccess,
  type ActionResult,
} from "@/src/lib/auth"
import { createAuditLog, AuditAction } from "@/src/lib/audit"
import {
  canPerformAction,
  canAccessFarm,
} from "@/src/lib/permissions"
import { requiredIdSchema, positiveIntSchema } from "@/src/lib/validators"
import { BatchStatus } from "@/src/generated/prisma/client"

const getFarmsSchema = z.object({
  organizationId: requiredIdSchema,
})

const getFarmSchema = z.object({
  organizationId: requiredIdSchema,
  farmId: requiredIdSchema,
})

const createFarmSchema = z.object({
  organizationId: requiredIdSchema,
  name: z.string().min(1).max(100),
  code: z.string().max(20).optional(),
  address: z.string().max(255).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  totalCapacity: positiveIntSchema.optional(),
})

const updateFarmSchema = z.object({
  organizationId: requiredIdSchema,
  farmId: requiredIdSchema,
  name: z.string().min(1).max(100).optional(),
  code: z.string().max(20).optional(),
  address: z.string().max(255).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  totalCapacity: positiveIntSchema.optional(),
})

const deleteFarmSchema = z.object({
  organizationId: requiredIdSchema,
  farmId: requiredIdSchema,
})

export interface FarmSummary {
  id: string
  organizationId: string
  name: string
  code: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  totalCapacity: number | null
  createdAt: Date
  _count: {
    buildings: number
  }
}

export interface FarmWithBuildings extends FarmSummary {
  buildings: Array<{
    id: string
    name: string
    code: string | null
    type: string
    capacity: number
    surfaceM2: number | null
    ventilationType: string | null
    createdAt: Date
  }>
}

class BusinessRuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BusinessRuleError"
  }
}

const farmSummarySelect = {
  id: true,
  organizationId: true,
  name: true,
  code: true,
  address: true,
  latitude: true,
  longitude: true,
  totalCapacity: true,
  createdAt: true,
  _count: {
    select: {
      buildings: {
        where: { deletedAt: null },
      },
    },
  },
} as const

const activeBuildingSelect = {
  id: true,
  name: true,
  code: true,
  type: true,
  capacity: true,
  surfaceM2: true,
  ventilationType: true,
  createdAt: true,
} as const

export async function getFarms(
  data: unknown,
): Promise<ActionResult<FarmSummary[]>> {
  try {
    const parsed = getFarmsSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const { organizationId } = parsed.data
    const accessResult = await requireOrganizationAccess(organizationId)
    if (!accessResult.success) return accessResult

    const { role, farmPermissions } = accessResult.data.membership

    const farms = await prisma.farm.findMany({
      where: { organizationId, deletedAt: null },
      select: farmSummarySelect,
      orderBy: { name: "asc" },
    })

    const accessible = farms.filter((farm) =>
      canAccessFarm(role, farmPermissions, farm.id, "canRead"),
    )

    return { success: true, data: accessible }
  } catch {
    return { success: false, error: "Impossible de recuperer les fermes" }
  }
}

export async function getFarm(
  data: unknown,
): Promise<ActionResult<FarmWithBuildings>> {
  try {
    const parsed = getFarmSchema.safeParse(data)
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

    const farm = await prisma.farm.findFirst({
      where: { id: farmId, organizationId, deletedAt: null },
      select: {
        ...farmSummarySelect,
        buildings: {
          where: { deletedAt: null },
          select: activeBuildingSelect,
          orderBy: { name: "asc" },
        },
      },
    })

    if (!farm) {
      return { success: false, error: "Ferme introuvable" }
    }

    return { success: true, data: farm }
  } catch {
    return { success: false, error: "Impossible de recuperer la ferme" }
  }
}

export async function createFarm(
  data: unknown,
): Promise<ActionResult<FarmSummary>> {
  try {
    const parsed = createFarmSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const { organizationId, ...farmData } = parsed.data
    const accessResult = await requireOrganizationAccess(organizationId)
    if (!accessResult.success) return accessResult

    const { session, membership, effectiveUserId } = accessResult.data

    if (!canPerformAction(membership.role, "MANAGE_FARMS")) {
      return { success: false, error: "Permission refusee" }
    }

    const farm = await prisma.farm.create({
      data: { organizationId, ...farmData },
      select: farmSummarySelect,
    })

    await createAuditLog({
      userId: effectiveUserId,
      organizationId,
      actorUserId: session.actorUserId,
      effectiveUserId: session.effectiveUserId,
      impersonationSessionId: session.impersonationSessionId,
      action: AuditAction.CREATE,
      resourceType: "FARM",
      resourceId: farm.id,
      after: farmData,
    })

    return { success: true, data: farm }
  } catch {
    return { success: false, error: "Impossible de creer la ferme" }
  }
}

export async function updateFarm(
  data: unknown,
): Promise<ActionResult<FarmSummary>> {
  try {
    const parsed = updateFarmSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const { organizationId, farmId, ...updates } = parsed.data
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

    const existing = await prisma.farm.findFirst({
      where: { id: farmId, organizationId, deletedAt: null },
    })
    if (!existing) {
      return { success: false, error: "Ferme introuvable" }
    }

    const farm = await prisma.farm.update({
      where: { id: farmId },
      data: updates,
      select: farmSummarySelect,
    })

    await createAuditLog({
      userId: effectiveUserId,
      organizationId,
      actorUserId: session.actorUserId,
      effectiveUserId: session.effectiveUserId,
      impersonationSessionId: session.impersonationSessionId,
      action: AuditAction.UPDATE,
      resourceType: "FARM",
      resourceId: farmId,
      before: existing,
      after: updates,
    })

    return { success: true, data: farm }
  } catch {
    return { success: false, error: "Impossible de mettre a jour la ferme" }
  }
}

export async function deleteFarm(
  data: unknown,
): Promise<ActionResult<void>> {
  const parsed = deleteFarmSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: "Donnees invalides" }
  }

  const { organizationId, farmId } = parsed.data
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

  const existing = await prisma.farm.findFirst({
    where: { id: farmId, organizationId, deletedAt: null },
  })
  if (!existing) {
    return { success: false, error: "Ferme introuvable" }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const activeBatchCount = await tx.batch.count({
        where: {
          building: { farmId },
          status: BatchStatus.ACTIVE,
        },
      })
      if (activeBatchCount > 0) {
        throw new BusinessRuleError(
          `Impossible de supprimer la ferme : ${activeBatchCount} lot(s) actif(s) en cours`,
        )
      }

      const now = new Date()

      await tx.building.updateMany({
        where: { farmId, deletedAt: null },
        data: { deletedAt: now },
      })

      await tx.farm.update({
        where: { id: farmId },
        data: { deletedAt: now },
      })
    })

    await createAuditLog({
      userId: effectiveUserId,
      organizationId,
      actorUserId: session.actorUserId,
      effectiveUserId: session.effectiveUserId,
      impersonationSessionId: session.impersonationSessionId,
      action: AuditAction.DELETE,
      resourceType: "FARM",
      resourceId: farmId,
      before: existing,
    })

    return { success: true, data: undefined }
  } catch (error) {
    if (error instanceof BusinessRuleError) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Impossible de supprimer la ferme" }
  }
}
