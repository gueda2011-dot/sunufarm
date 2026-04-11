/**
 * SunuFarm — Server Actions : saisie journalière
 *
 * Écran prioritaire du MVP terrain — objectif : saisie complète en < 30 secondes.
 * Ce module est le plus sollicité en production. Garder la logique simple et robuste.
 */

"use server"

import { z } from "zod"
import prisma from "@/src/lib/prisma"
import {
  requireOrganizationModuleContext,
  type ActionResult,
} from "@/src/lib/auth"
import { createAuditLog, AuditAction } from "@/src/lib/audit"
import { isDailyRecordLocked, toUtcDate } from "@/src/lib/daily-record-rules"
import {
  canPerformAction,
  canAccessFarm,
  hasMinimumRole,
} from "@/src/lib/permissions"
import {
  requiredIdSchema,
  nonNegativeIntSchema,
  nonNegativeNumberSchema,
} from "@/src/lib/validators"
import {
  createDailyRecordSchema,
  dailyMortalityDetailSchema,
  flattenZodFieldErrors,
  buildInvalidInputMessage,
} from "@/src/lib/daily-record-validation"
import { invalidInput } from "@/src/lib/action-result"
import {
  Prisma,
  UserRole,
  BatchStatus,
  FeedMovementType,
  NotificationType,
} from "@/src/generated/prisma/client"
import { sendPushNotificationToUser } from "@/src/lib/push-notifications"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { hasPlanFeature } from "@/src/lib/subscriptions"

// ---------------------------------------------------------------------------
// Schémas Zod
// ---------------------------------------------------------------------------

const getDailyRecordsSchema = z.object({
  organizationId: requiredIdSchema,
  batchId:        requiredIdSchema,
  cursorDate:     z.coerce.date().optional(),
  limit:          z.number().int().min(1).max(100).default(30),
})

const getDailyRecordSchema = z.object({
  organizationId: requiredIdSchema,
  batchId:        requiredIdSchema,
  dailyRecordId:  requiredIdSchema,
})

const updateDailyRecordSchema = z.object({
  organizationId:  requiredIdSchema,
  batchId:         requiredIdSchema,
  dailyRecordId:   requiredIdSchema,
  mortality:       nonNegativeIntSchema.optional(),
  feedKg:          nonNegativeNumberSchema.optional(),
  feedStockId:     z.string().cuid().nullable().optional(),
  waterLiters:     nonNegativeNumberSchema.optional(),
  temperatureMin:  z.number().optional(),
  temperatureMax:  z.number().optional(),
  humidity:        z.number().min(0).max(100).optional(),
  avgWeightG:      z.number().int().positive().optional(),
  observations:    z.string().max(2000).optional(),
  audioRecordUrl:  z.string().url().max(1000).optional().nullable(),
  mortalityDetails: z.array(dailyMortalityDetailSchema).optional(),
})

// ---------------------------------------------------------------------------
// Types retournés
// ---------------------------------------------------------------------------

export interface MortalityDetail {
  id:                string
  mortalityReasonId: string | null
  count:             number
  notes:             string | null
}

export interface DailyRecordDetail {
  id:             string
  organizationId: string
  batchId:        string
  date:           Date
  mortality:      number
  feedKg:         number
  feedStockId:    string | null
  feedStockName:  string | null
  waterLiters:    number | null
  temperatureMin: number | null
  temperatureMax: number | null
  humidity:       number | null
  avgWeightG:     number | null
  observations:   string | null
  audioRecordUrl: string | null
  recordedById:   string | null
  lockedAt:       Date | null
  isLocked:       boolean
  createdAt:      Date
  updatedAt:      Date
  mortalityRecords: MortalityDetail[]
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

async function findBatchWithFarm(batchId: string, organizationId: string) {
  return prisma.batch.findFirst({
    where:  { id: batchId, organizationId, deletedAt: null },
    select: {
      id:       true,
      number:   true,
      status:   true,
      entryCount: true,
      building: { select: { farmId: true } },
    },
  })
}

const dailyRecordDetailSelect = {
  id:             true,
  organizationId: true,
  batchId:        true,
  date:           true,
  mortality:      true,
  feedKg:         true,
  waterLiters:    true,
  temperatureMin: true,
  temperatureMax: true,
  humidity:       true,
  avgWeightG:     true,
  observations:   true,
  audioRecordUrl: true,
  recordedById:   true,
  lockedAt:       true,
  createdAt:      true,
  updatedAt:      true,
  mortalityRecords: {
    select: {
      id:                true,
      mortalityReasonId: true,
      count:             true,
      notes:             true,
    },
  },
} as const

class BusinessRuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BusinessRuleError"
  }
}

function buildDailyFeedReference(recordId: string): string {
  return `daily-record:${recordId}`
}

async function enrichRecordsWithFeedStock(
  organizationId: string,
  records: Array<Prisma.DailyRecordGetPayload<{ select: typeof dailyRecordDetailSelect }>>,
): Promise<DailyRecordDetail[]> {
  if (records.length === 0) return []

  const referenceByRecordId = new Map(
    records.map((record) => [buildDailyFeedReference(record.id), record.id]),
  )

  const movements = await prisma.feedMovement.findMany({
    where: {
      organizationId,
      reference: { in: Array.from(referenceByRecordId.keys()) },
    },
    select: {
      reference: true,
      feedStockId: true,
      feedStock: { select: { name: true } },
    },
  })

  const feedStockByRecordId = new Map(
    movements.flatMap((movement) =>
      movement.reference
        ? [[referenceByRecordId.get(movement.reference) ?? "", movement]]
        : [],
    ),
  )

  return records.map((record) => {
    const feedMovement = feedStockByRecordId.get(record.id)

    return withIsLocked({
      ...record,
      feedStockId: feedMovement?.feedStockId ?? null,
      feedStockName: feedMovement?.feedStock.name ?? null,
    })
  })
}

async function syncDailyFeedMovement(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string
    actorId: string
    batchId: string
    farmId: string
    recordId: string
    date: Date
    feedKg: number
    feedStockId?: string | null
  },
): Promise<void> {
  const {
    organizationId,
    actorId,
    batchId,
    farmId,
    recordId,
    date,
    feedKg,
    feedStockId,
  } = params

  const reference = buildDailyFeedReference(recordId)
  const existingMovement = await tx.feedMovement.findFirst({
    where: { organizationId, reference },
    select: {
      id: true,
      feedStockId: true,
      quantityKg: true,
      feedStock: {
        select: {
          id: true,
          farmId: true,
          feedTypeId: true,
          quantityKg: true,
        },
      },
    },
  })

  const desiredQuantity = feedKg
  const desiredStockId =
    feedStockId === undefined
      ? existingMovement?.feedStockId ?? null
      : feedStockId

  if (desiredQuantity > 0 && !desiredStockId) {
    throw new BusinessRuleError(
      "Choisissez le stock aliment qui a servi a cette distribution",
    )
  }

  if (desiredQuantity <= 0 || !desiredStockId) {
    if (!existingMovement) return

    await tx.feedStock.update({
      where: { id: existingMovement.feedStockId },
      data: { quantityKg: existingMovement.feedStock.quantityKg + existingMovement.quantityKg },
    })
    await tx.feedMovement.delete({ where: { id: existingMovement.id } })
    return
  }

  const targetStock = await tx.feedStock.findFirst({
    where: { id: desiredStockId, organizationId },
    select: {
      id: true,
      farmId: true,
      feedTypeId: true,
      quantityKg: true,
    },
  })

  if (!targetStock) {
    throw new BusinessRuleError("Stock aliment introuvable")
  }

  if (targetStock.farmId !== farmId) {
    throw new BusinessRuleError(
      "Le stock aliment choisi doit appartenir a la meme ferme que le lot",
    )
  }

  if (!existingMovement) {
    const newQuantityKg = targetStock.quantityKg - desiredQuantity
    if (newQuantityKg < 0) {
      throw new BusinessRuleError(
        `Stock insuffisant : ${targetStock.quantityKg.toFixed(2)} kg disponibles, ${desiredQuantity.toFixed(2)} kg demandes`,
      )
    }

    await tx.feedStock.update({
      where: { id: targetStock.id },
      data: { quantityKg: newQuantityKg },
    })
    await tx.feedMovement.create({
      data: {
        organizationId,
        feedStockId: targetStock.id,
        feedTypeId: targetStock.feedTypeId,
        type: FeedMovementType.SORTIE,
        quantityKg: desiredQuantity,
        batchId,
        reference,
        notes: "Consommation enregistree depuis la saisie journaliere",
        recordedById: actorId,
        date,
      },
    })
    return
  }

  if (existingMovement.feedStockId === targetStock.id) {
    const delta = desiredQuantity - existingMovement.quantityKg
    const newQuantityKg = targetStock.quantityKg - delta
    if (newQuantityKg < 0) {
      throw new BusinessRuleError(
        `Stock insuffisant : ${targetStock.quantityKg.toFixed(2)} kg disponibles, ${delta.toFixed(2)} kg supplementaires demandes`,
      )
    }

    await tx.feedStock.update({
      where: { id: targetStock.id },
      data: { quantityKg: newQuantityKg },
    })
    await tx.feedMovement.update({
      where: { id: existingMovement.id },
      data: {
        quantityKg: desiredQuantity,
        date,
        batchId,
        notes: "Consommation enregistree depuis la saisie journaliere",
      },
    })
    return
  }

  const replenishedQuantity = existingMovement.feedStock.quantityKg + existingMovement.quantityKg
  const newTargetQuantity = targetStock.quantityKg - desiredQuantity

  if (newTargetQuantity < 0) {
    throw new BusinessRuleError(
      `Stock insuffisant : ${targetStock.quantityKg.toFixed(2)} kg disponibles, ${desiredQuantity.toFixed(2)} kg demandes`,
    )
  }

  await tx.feedStock.update({
    where: { id: existingMovement.feedStockId },
    data: { quantityKg: replenishedQuantity },
  })
  await tx.feedStock.update({
    where: { id: targetStock.id },
    data: { quantityKg: newTargetQuantity },
  })
  await tx.feedMovement.update({
    where: { id: existingMovement.id },
    data: {
      feedStockId: targetStock.id,
      feedTypeId: targetStock.feedTypeId,
      quantityKg: desiredQuantity,
      date,
      batchId,
      notes: "Consommation enregistree depuis la saisie journaliere",
    },
  })
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  )
}

function withIsLocked<T extends { date: Date; lockedAt: Date | null }>(
  record: T,
): T & { isLocked: boolean } {
  return { ...record, isLocked: isDailyRecordLocked(record.date, record.lockedAt) }
}

// ---------------------------------------------------------------------------
// 1. getDailyRecords
// ---------------------------------------------------------------------------

export async function getDailyRecords(
  data: unknown,
): Promise<ActionResult<DailyRecordDetail[]>> {
  try {
    const parsed = getDailyRecordsSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, batchId, cursorDate, limit } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "DAILY")
    if (!accessResult.success) return accessResult

    const { role, farmPermissions } = accessResult.data.membership
    const batch = await findBatchWithFarm(batchId, organizationId)
    if (!batch) {
      return { success: false, error: "Lot introuvable" }
    }

    if (!canAccessFarm(role, farmPermissions, batch.building.farmId, "canRead")) {
      return { success: false, error: "Accès refusé à ce lot" }
    }

    const records = await prisma.dailyRecord.findMany({
      where:   {
        batchId,
        organizationId,
        ...(cursorDate ? { date: { lt: cursorDate } } : {}),
      },
      select:  dailyRecordDetailSelect,
      orderBy: { date: "desc" },
      take:    limit,
    })

    return { success: true, data: await enrichRecordsWithFeedStock(organizationId, records) }
  } catch {
    return { success: false, error: "Impossible de récupérer les saisies" }
  }
}

// ---------------------------------------------------------------------------
// 2. getDailyRecord
// ---------------------------------------------------------------------------

export async function getDailyRecord(
  data: unknown,
): Promise<ActionResult<DailyRecordDetail>> {
  try {
    const parsed = getDailyRecordSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, batchId, dailyRecordId } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "DAILY")
    if (!accessResult.success) return accessResult

    const { role, farmPermissions } = accessResult.data.membership
    const batch = await findBatchWithFarm(batchId, organizationId)
    if (!batch) {
      return { success: false, error: "Lot introuvable" }
    }

    if (!canAccessFarm(role, farmPermissions, batch.building.farmId, "canRead")) {
      return { success: false, error: "Accès refusé à ce lot" }
    }

    const record = await prisma.dailyRecord.findFirst({
      where:  { id: dailyRecordId, batchId, organizationId },
      select: dailyRecordDetailSelect,
    })

    if (!record) {
      return { success: false, error: "Saisie introuvable" }
    }

    const [enrichedRecord] = await enrichRecordsWithFeedStock(organizationId, [record])
    return { success: true, data: enrichedRecord }
  } catch {
    return { success: false, error: "Impossible de récupérer la saisie" }
  }
}

// ---------------------------------------------------------------------------
// 3. createDailyRecord
// ---------------------------------------------------------------------------

export async function createDailyRecord(
  data: unknown,
): Promise<ActionResult<DailyRecordDetail>> {
  try {
    const parsed = createDailyRecordSchema.safeParse(data)
    if (!parsed.success) {
      const fieldErrors = flattenZodFieldErrors(parsed.error)
      return invalidInput(buildInvalidInputMessage(fieldErrors), fieldErrors)
    }

    const {
      organizationId,
      batchId,
      clientMutationId,
      date,
      feedStockId,
      mortalityDetails,
      ...recordData
    } = parsed.data

    const accessResult = await requireOrganizationModuleContext(organizationId, "DAILY")
    if (!accessResult.success) return accessResult
    const actorId = accessResult.data.session.user.id
    const { role, farmPermissions } = accessResult.data.membership

    if (!canPerformAction(role, "CREATE_DAILY_RECORD")) {
      return { success: false, error: "Permission refusée" }
    }

    const batch = await findBatchWithFarm(batchId, organizationId)
    if (!batch) {
      return { success: false, error: "Lot introuvable" }
    }

    if (batch.status !== BatchStatus.ACTIVE) {
      return { success: false, error: "Impossible de saisir sur un lot clôturé" }
    }

    if (!canAccessFarm(role, farmPermissions, batch.building.farmId, "canWrite")) {
      return { success: false, error: "Accès en écriture refusé sur cette ferme" }
    }

    if (clientMutationId) {
      const existingByMutation = await prisma.dailyRecord.findFirst({
        where: { organizationId, clientMutationId },
        select: dailyRecordDetailSelect,
      })
      if (existingByMutation) {
        const [enrichedExistingRecord] = await enrichRecordsWithFeedStock(organizationId, [existingByMutation])
        return { success: true, data: enrichedExistingRecord }
      }
    }

    const normalizedDate = toUtcDate(date)
    const existing = await prisma.dailyRecord.findUnique({
      where: { batchId_date: { batchId, date: normalizedDate } },
      select: { id: true },
    })
    if (existing) {
      return { success: false, error: "Une saisie existe déjà pour ce lot à cette date" }
    }

    let record: Prisma.DailyRecordGetPayload<{ select: typeof dailyRecordDetailSelect }>
    try {
      record = await prisma.$transaction(async (tx) => {
        const created = await tx.dailyRecord.create({
          data: {
            organizationId,
            batchId,
            clientMutationId: clientMutationId ?? null,
            date:         normalizedDate,
            recordedById: actorId,
            ...recordData,
          },
          select: dailyRecordDetailSelect,
        })

        if (mortalityDetails?.length) {
          await tx.mortalityRecord.createMany({
            data: mortalityDetails.map((d) => ({
              dailyRecordId:     created.id,
              mortalityReasonId: d.mortalityReasonId ?? null,
              count:             d.count,
              notes:             d.notes ?? null,
            })),
          })
        }

        await syncDailyFeedMovement(tx, {
          organizationId,
          actorId,
          batchId,
          farmId: batch.building.farmId,
          recordId: created.id,
          date: normalizedDate,
          feedKg: recordData.feedKg,
          feedStockId,
        })

        return tx.dailyRecord.findUniqueOrThrow({
          where:  { id: created.id },
          select: dailyRecordDetailSelect,
        })
      })
    } catch (error) {
      if (error instanceof BusinessRuleError) {
        return { success: false, error: error.message }
      }
      throw error
    }

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.CREATE,
      resourceType:   "DAILY_RECORD",
      resourceId:     record.id,
      after:          { clientMutationId, batchId, date: normalizedDate, feedStockId, ...recordData },
    })

    const [enrichedRecord] = await enrichRecordsWithFeedStock(organizationId, [record])

    // --- Alerte Mortalité Critique (Audit Priorité 2%) ---
    const subscription = await getOrganizationSubscription(organizationId)
    const canSeeAlerts = hasPlanFeature(subscription.plan, "ALERTS")

    if (canSeeAlerts) {
      try {
        const mortalityRate = recordData.mortality / batch.entryCount
        if (mortalityRate >= 0.02) {
          const targetMembers = await prisma.userOrganization.findMany({
            where: {
              organizationId,
              role: { in: [UserRole.OWNER, UserRole.MANAGER] },
              user: { deletedAt: null },
            },
            select: { userId: true },
          })

          for (const member of targetMembers) {
            const notification = await prisma.notification.create({
              data: {
                organizationId,
                userId:       member.userId,
                type:         NotificationType.MORTALITE_ELEVEE,
                title:        "Alerte Mortalite Critique !",
                message:      `Mortalite elevee detectee sur le lot ${batch.number} : ${recordData.mortality} sujets (${(mortalityRate * 100).toFixed(1)}%).`,
                resourceType: "DAILY_RECORD",
                resourceId:   record.id,
              },
            })

            sendPushNotificationToUser({
              organizationId,
              userId: member.userId,
              message: {
                organizationId,
                title: notification.title,
                body:  notification.message,
                notificationId: notification.id,
                resourceType: notification.resourceType,
                resourceId: notification.resourceId,
              },
            }).catch(() => {})
          }
        }
      } catch (pushError) {
        console.error("Failed to send immediate mortality alert", pushError)
      }
    }

    return { success: true, data: enrichedRecord }
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { success: false, error: "Une saisie existe déjà pour ce lot à cette date" }
    }
    return { success: false, error: "Impossible d'enregistrer la saisie" }
  }
}

// ---------------------------------------------------------------------------
// 4. updateDailyRecord
// ---------------------------------------------------------------------------

export async function updateDailyRecord(
  data: unknown,
): Promise<ActionResult<DailyRecordDetail>> {
  try {
    const parsed = updateDailyRecordSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const {
      organizationId,
      batchId,
      dailyRecordId,
      feedStockId,
      mortalityDetails,
      ...updates
    } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "DAILY")
    if (!accessResult.success) return accessResult
    const actorId = accessResult.data.session.user.id
    const { role, farmPermissions } = accessResult.data.membership

    if (!canPerformAction(role, "UPDATE_DAILY_RECORD")) {
      return { success: false, error: "Permission refusée" }
    }

    const existing = await prisma.dailyRecord.findFirst({
      where:  { id: dailyRecordId, batchId, organizationId },
      select: {
        ...dailyRecordDetailSelect,
        batch: {
          select: {
            number:   true,
            status:   true,
            entryCount: true,
            building: { select: { farmId: true } },
          },
        },
      },
    })

    if (!existing) {
      return { success: false, error: "Saisie introuvable" }
    }

    if (!canAccessFarm(role, farmPermissions, existing.batch.building.farmId, "canWrite")) {
      return { success: false, error: "Accès en écriture refusé sur cette ferme" }
    }

    if (existing.batch.status !== BatchStatus.ACTIVE && !hasMinimumRole(role, UserRole.MANAGER)) {
      return {
        success: false,
        error:   "Ce lot est clôturé. Seul un gestionnaire peut corriger les saisies d'un lot terminé.",
      }
    }

    const locked = isDailyRecordLocked(existing.date, existing.lockedAt)
    if (locked && !hasMinimumRole(role, UserRole.MANAGER)) {
      return {
        success: false,
        error:   "Cette saisie est verrouillée. Contactez un gestionnaire pour la corriger.",
      }
    }

    let updated: Prisma.DailyRecordGetPayload<{ select: typeof dailyRecordDetailSelect }>
    try {
      updated = await prisma.$transaction(async (tx) => {
        const record = await tx.dailyRecord.update({
          where:  { id: dailyRecordId },
          data:   updates,
          select: dailyRecordDetailSelect,
        })

        if (mortalityDetails !== undefined) {
          await tx.mortalityRecord.deleteMany({ where: { dailyRecordId } })
          if (mortalityDetails.length > 0) {
            await tx.mortalityRecord.createMany({
              data: mortalityDetails.map((d) => ({
                dailyRecordId,
                mortalityReasonId: d.mortalityReasonId ?? null,
                count:             d.count,
                notes:             d.notes ?? null,
              })),
            })
          }

          await syncDailyFeedMovement(tx, {
            organizationId,
            actorId,
            batchId,
            farmId: existing.batch.building.farmId,
            recordId: dailyRecordId,
            date: existing.date,
            feedKg: updates.feedKg ?? existing.feedKg,
            feedStockId,
          })

          return tx.dailyRecord.findUniqueOrThrow({
            where:  { id: dailyRecordId },
            select: dailyRecordDetailSelect,
          })
        }

        await syncDailyFeedMovement(tx, {
          organizationId,
          actorId,
          batchId,
          farmId: existing.batch.building.farmId,
          recordId: dailyRecordId,
          date: existing.date,
          feedKg: updates.feedKg ?? existing.feedKg,
          feedStockId: feedStockId ?? undefined,
        })

        return record
      })
    } catch (error) {
      if (error instanceof BusinessRuleError) {
        return { success: false, error: error.message }
      }
      throw error
    }

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.UPDATE,
      resourceType:   "DAILY_RECORD",
      resourceId:     dailyRecordId,
      before:         existing,
      after: {
        ...updates,
        ...(feedStockId !== undefined ? { feedStockId } : {}),
        ...(mortalityDetails !== undefined ? { mortalityDetails } : {}),
      },
    })

    const [enrichedRecord] = await enrichRecordsWithFeedStock(organizationId, [updated])

    // --- Alerte Mortalité Critique ---
    const subscription = await getOrganizationSubscription(organizationId)
    const canSeeAlerts = hasPlanFeature(subscription.plan, "ALERTS")

    if (canSeeAlerts) {
      try {
        const mortality = updates.mortality ?? existing.mortality
      const mortalityRate = mortality / existing.batch.entryCount
      if (mortalityRate >= 0.02) {
        const targetMembers = await prisma.userOrganization.findMany({
          where: {
            organizationId,
            role: { in: [UserRole.OWNER, UserRole.MANAGER] },
            user: { deletedAt: null },
          },
          select: { userId: true },
        })

        for (const member of targetMembers) {
          const notification = await prisma.notification.create({
            data: {
              organizationId,
              userId:       member.userId,
              type:         NotificationType.MORTALITE_ELEVEE,
              title:        "Alerte Mortalite Critique !",
              message:      `Mortalite elevee detectee (Correction) sur le lot ${existing.batch.number} : ${mortality} sujets (${(mortalityRate * 100).toFixed(1)}%).`,
              resourceType: "DAILY_RECORD",
              resourceId:   updated.id,
            },
          })

          sendPushNotificationToUser({
            organizationId,
            userId: member.userId,
            message: {
              organizationId,
              title: notification.title,
              body:  notification.message,
              notificationId: notification.id,
              resourceType: notification.resourceType,
              resourceId: notification.resourceId,
            },
          }).catch(() => {})
        }
      }
      } catch (pushError) {
        console.error("Failed to send immediate mortality alert on update", pushError)
      }
    }

    return { success: true, data: enrichedRecord }
  } catch {
    return { success: false, error: "Impossible de mettre à jour la saisie" }
  }
}


