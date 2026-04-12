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
  nonNegativeIntSchema,
  dateSchema,
  optionalDateSchema,
} from "@/src/lib/validators"
import { BatchType, BatchStatus, UserRole } from "@/src/generated/prisma/client"

// ---------------------------------------------------------------------------
// Schémas Zod
// ---------------------------------------------------------------------------

const getEggRecordsSchema = z.object({
  organizationId: requiredIdSchema,
  batchId:        optionalIdSchema,
  fromDate:       optionalDateSchema,
  toDate:         optionalDateSchema,
  cursor:         optionalIdSchema,
  limit:          z.number().int().min(1).max(100).default(30),
})

const createEggRecordSchema = z.object({
  organizationId:  requiredIdSchema,
  batchId:         requiredIdSchema,
  date:            dateSchema,
  totalEggs:       nonNegativeIntSchema,
  sellableEggs:    nonNegativeIntSchema,
  brokenEggs:      nonNegativeIntSchema.default(0),
  dirtyEggs:       nonNegativeIntSchema.default(0),
  smallEggs:       nonNegativeIntSchema.default(0),
  passageCount:    z.number().int().min(1).max(10).default(1),
  observations:    z.string().max(1000).optional(),
  clientMutationId: z.string().trim().min(1).max(100).optional(),
})

const updateEggRecordSchema = z.object({
  organizationId: requiredIdSchema,
  recordId:       requiredIdSchema,
  totalEggs:      nonNegativeIntSchema.optional(),
  sellableEggs:   nonNegativeIntSchema.optional(),
  brokenEggs:     nonNegativeIntSchema.optional(),
  dirtyEggs:      nonNegativeIntSchema.optional(),
  smallEggs:      nonNegativeIntSchema.optional(),
  passageCount:   z.number().int().min(1).max(10).optional(),
  observations:   z.string().max(1000).optional(),
})

const deleteEggRecordSchema = z.object({
  organizationId: requiredIdSchema,
  recordId:       requiredIdSchema,
})

// ---------------------------------------------------------------------------
// Types retournés
// ---------------------------------------------------------------------------

export interface EggRecordSummary {
  id:             string
  organizationId: string
  batchId:        string
  date:           Date
  totalEggs:      number
  sellableEggs:   number
  brokenEggs:     number
  dirtyEggs:      number
  smallEggs:      number
  passageCount:   number
  observations:   string | null
  createdAt:      Date
  batch: {
    id:     string
    number: string
    building: {
      id:   string
      name: string
      farm: { id: string; name: string }
    }
  }
}

// ---------------------------------------------------------------------------
// Sélections Prisma
// ---------------------------------------------------------------------------

const eggRecordSelect = {
  id:             true,
  organizationId: true,
  batchId:        true,
  date:           true,
  totalEggs:      true,
  sellableEggs:   true,
  brokenEggs:     true,
  dirtyEggs:      true,
  smallEggs:      true,
  passageCount:   true,
  observations:   true,
  createdAt:      true,
  batch: {
    select: {
      id:     true,
      number: true,
      building: {
        select: {
          id:   true,
          name: true,
          farm: { select: { id: true, name: true } },
        },
      },
    },
  },
} as const

// ---------------------------------------------------------------------------
// 1. getEggRecords
// ---------------------------------------------------------------------------

export async function getEggRecords(
  data: unknown,
): Promise<ActionResult<EggRecordSummary[]>> {
  try {
    const parsed = getEggRecordsSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: "Données invalides" }

    const { organizationId, batchId, fromDate, toDate, cursor, limit } =
      parsed.data

    const accessResult = await requireOrganizationModuleContext(organizationId, "EGGS")
    if (!accessResult.success) return accessResult

    const records = await prisma.eggProductionRecord.findMany({
      where: {
        organizationId,
        ...(batchId ? { batchId } : {}),
        ...(fromDate || toDate
          ? {
              date: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate   ? { lte: toDate }   : {}),
              },
            }
          : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select:  eggRecordSelect,
      orderBy: { date: "desc" },
      take:    limit,
    })

    return { success: true, data: records }
  } catch {
    return { success: false, error: "Impossible de récupérer les records d'œufs" }
  }
}

// ---------------------------------------------------------------------------
// 2. createEggRecord
// ---------------------------------------------------------------------------

export async function createEggRecord(
  data: unknown,
): Promise<ActionResult<EggRecordSummary>> {
  try {
    const parsed = createEggRecordSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: "Données invalides" }

    const { organizationId, batchId, clientMutationId, ...recordData } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "EGGS")
    if (!accessResult.success) return accessResult
    const actorId = accessResult.data.session.user.id
    const roleResult = requireRole(
      accessResult.data.membership,
      [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER, UserRole.TECHNICIAN, UserRole.DATA_ENTRY],
      "Permission refusée",
    )
    if (!roleResult.success) return roleResult

    // Idempotence : si clientMutationId déjà connu, retourner le record existant
    if (clientMutationId) {
      const existingByMutation = await prisma.eggProductionRecord.findUnique({
        where: { clientMutationId },
        select: eggRecordSelect,
      })
      if (existingByMutation) return { success: true, data: existingByMutation }
    }

    // Valider que le lot appartient à l'org, est actif, et est de type PONDEUSE
    const batch = await prisma.batch.findFirst({
      where: { id: batchId, organizationId, deletedAt: null },
      select: { id: true, status: true, type: true },
    })

    if (!batch) return { success: false, error: "Lot introuvable" }
    if (batch.status !== BatchStatus.ACTIVE) {
      return { success: false, error: "Ce lot est clôturé" }
    }
    if (batch.type !== BatchType.PONDEUSE) {
      return {
        success: false,
        error: "Les records d'œufs ne s'appliquent qu'aux lots pondeuses",
      }
    }

    const record = await prisma.eggProductionRecord.create({
      data: {
        organizationId,
        batchId,
        recordedById: actorId,
        clientMutationId: clientMutationId ?? null,
        ...recordData,
      },
      select: eggRecordSelect,
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.CREATE,
      resourceType:   "EGG_RECORD",
      resourceId:     record.id,
      after:          { batchId, ...recordData },
    })

    return { success: true, data: record }
  } catch (error) {
    // Violation de la contrainte unique (batchId, date)
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return {
        success: false,
        error: "Un record d'œufs existe déjà pour ce lot et cette date",
      }
    }
    return { success: false, error: "Impossible de créer le record d'œufs" }
  }
}

// ---------------------------------------------------------------------------
// 3. updateEggRecord
// ---------------------------------------------------------------------------

export async function updateEggRecord(
  data: unknown,
): Promise<ActionResult<EggRecordSummary>> {
  try {
    const parsed = updateEggRecordSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: "Données invalides" }

    const { organizationId, recordId, ...updates } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "EGGS")
    if (!accessResult.success) return accessResult
    const actorId = accessResult.data.session.user.id
    const roleResult = requireRole(
      accessResult.data.membership,
      [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER, UserRole.TECHNICIAN, UserRole.DATA_ENTRY],
      "Permission refusée",
    )
    if (!roleResult.success) return roleResult

    const existing = await prisma.eggProductionRecord.findFirst({
      where: { id: recordId, organizationId },
    })
    if (!existing) return { success: false, error: "Record introuvable" }

    const record = await prisma.eggProductionRecord.update({
      where:  { id: recordId },
      data:   updates,
      select: eggRecordSelect,
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.UPDATE,
      resourceType:   "EGG_RECORD",
      resourceId:     recordId,
      before:         existing,
      after:          updates,
    })

    return { success: true, data: record }
  } catch {
    return { success: false, error: "Impossible de modifier le record d'œufs" }
  }
}

// ---------------------------------------------------------------------------
// 4. deleteEggRecord
// ---------------------------------------------------------------------------

export async function deleteEggRecord(
  data: unknown,
): Promise<ActionResult<void>> {
  const parsed = deleteEggRecordSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: "Données invalides" }

  const { organizationId, recordId } = parsed.data
  const accessResult = await requireOrganizationModuleContext(organizationId, "EGGS")
  if (!accessResult.success) return accessResult
  const actorId = accessResult.data.session.user.id
  const roleResult = requireRole(
    accessResult.data.membership,
    [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER, UserRole.TECHNICIAN, UserRole.DATA_ENTRY],
    "Permission refusée",
  )
  if (!roleResult.success) return roleResult

  const existing = await prisma.eggProductionRecord.findFirst({
    where: { id: recordId, organizationId },
  })
  if (!existing) return { success: false, error: "Record introuvable" }

  try {
    await prisma.eggProductionRecord.delete({ where: { id: recordId } })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.DELETE,
      resourceType:   "EGG_RECORD",
      resourceId:     recordId,
      before:         existing,
    })

    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Impossible de supprimer le record" }
  }
}
