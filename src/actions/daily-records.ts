/**
 * SunuFarm — Server Actions : saisie journalière
 *
 * Écran prioritaire du MVP terrain — objectif : saisie complète en < 30 secondes.
 * Ce module est le plus sollicité en production. Garder la logique simple et robuste.
 *
 * Périmètre MVP :
 *   - Lister et consulter les saisies d'un lot
 *   - Créer une saisie journalière (1 seule par lot et par date)
 *   - Corriger une saisie existante (sous conditions)
 *
 * Décision : pas de suppression
 *   Supprimer une saisie crée un trou dans l'historique et fausse les KPI cumulés.
 *   Pour corriger une erreur → utiliser updateDailyRecord.
 *   MANAGER+ peut corriger même après verrouillage.
 *
 * Règle de verrouillage J+1 :
 *   Une saisie datée D est modifiable les jours D et D+1.
 *   Elle est verrouillée à partir de J+2 00:00:00 UTC.
 *   Exemple : saisie du 20 mars → verrouillée le 22 mars à 00:00 UTC.
 *
 *   Qui peut modifier après verrouillage ?
 *     SUPER_ADMIN, OWNER, MANAGER uniquement (hasMinimumRole MANAGER).
 *     TECHNICIAN et DATA_ENTRY doivent contacter un gestionnaire.
 *
 * Chaîne d'appartenance validée :
 *   DailyRecord → Batch (organizationId + deletedAt) → Building → farmId
 *   Le farmId est résolu en une seule requête pour canAccessFarm.
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
  optionalIdSchema,
  nonNegativeIntSchema,
  nonNegativeNumberSchema,
  dateSchema,
} from "@/src/lib/validators"
import {
  Prisma,
  UserRole,
  BatchStatus,
  FeedMovementType,
} from "@/src/generated/prisma/client"

// ---------------------------------------------------------------------------
// Schémas Zod
// ---------------------------------------------------------------------------

const getDailyRecordsSchema = z.object({
  organizationId: requiredIdSchema,
  batchId:        requiredIdSchema,
  /**
   * Cursor de pagination : date du dernier enregistrement reçu.
   * La page suivante retourne les saisies dont la date est strictement
   * antérieure à cursorDate (tri date desc).
   * Utiliser record.date de la dernière entrée reçue comme valeur du curseur.
   */
  cursorDate:     z.coerce.date().optional(),
  limit:          z.number().int().min(1).max(100).default(30),
})

const getDailyRecordSchema = z.object({
  organizationId: requiredIdSchema,
  batchId:        requiredIdSchema,
  dailyRecordId:  requiredIdSchema,
})

/** Détail d'une mortalité par motif — optionnel, à renseigner après la saisie rapide */
const mortalityDetailSchema = z.object({
  mortalityReasonId: optionalIdSchema,
  count:             nonNegativeIntSchema,
  notes:             z.string().max(500).optional(),
})

const createDailyRecordSchema = z.object({
  organizationId: requiredIdSchema,
  batchId:        requiredIdSchema,
  date:           dateSchema,

  // Champs principaux — écran terrain 30 secondes
  mortality:      nonNegativeIntSchema,
  feedKg:         nonNegativeNumberSchema,
  feedStockId:    optionalIdSchema,

  // Champs secondaires — optionnels, section "Ajouter détails"
  waterLiters:    nonNegativeNumberSchema.optional(),
  temperatureMin: z.number().optional(),
  temperatureMax: z.number().optional(),
  humidity:       z.number().min(0).max(100).optional(),
  avgWeightG:     z.number().int().positive().optional(),
  observations:   z.string().max(2000).optional(),

  /** Motifs de mortalité détaillés — optionnels, alerte si absents 3 jours consécutifs */
  mortalityDetails: z.array(mortalityDetailSchema).optional(),
})

const updateDailyRecordSchema = z.object({
  organizationId:  requiredIdSchema,
  batchId:         requiredIdSchema,
  dailyRecordId:   requiredIdSchema,

  // Tous les champs de saisie sont optionnels dans une mise à jour
  mortality:       nonNegativeIntSchema.optional(),
  feedKg:          nonNegativeNumberSchema.optional(),
  feedStockId:     z.string().cuid().nullable().optional(),
  waterLiters:     nonNegativeNumberSchema.optional(),
  temperatureMin:  z.number().optional(),
  temperatureMax:  z.number().optional(),
  humidity:        z.number().min(0).max(100).optional(),
  avgWeightG:      z.number().int().positive().optional(),
  observations:    z.string().max(2000).optional(),

  /**
   * Si fourni, remplace complètement les MortalityRecords existants.
   * Si absent, les MortalityRecords existants sont conservés tels quels.
   */
  mortalityDetails: z.array(mortalityDetailSchema).optional(),
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
  recordedById:   string | null
  lockedAt:       Date | null
  /** Calculé à la volée — indique si la saisie est verrouillée pour les rôles standard */
  isLocked:       boolean
  createdAt:      Date
  updatedAt:      Date
  mortalityRecords: MortalityDetail[]
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

/**
 * Retourne un lot actif avec son farmId résolu via building, ou null.
 * Valide : lot appartient à l'org, n'est pas soft-deleted.
 */
async function findBatchWithFarm(batchId: string, organizationId: string) {
  return prisma.batch.findFirst({
    where:  { id: batchId, organizationId, deletedAt: null },
    select: {
      id:       true,
      status:   true,
      building: { select: { farmId: true } },
    },
  })
}

/** Sélection Prisma partagée pour les détails de saisie */
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

/**
 * Détecte une violation de contrainte unique Prisma (P2002).
 * Utilisé pour intercepter la race condition résiduelle dans createDailyRecord :
 * deux requêtes simultanées peuvent toutes les deux passer la vérification manuelle
 * puis l'une d'elles échoue sur la contrainte @@unique([batchId, date]).
 */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  )
}

/** Ajoute le champ calculé isLocked à un enregistrement retourné par Prisma */
function withIsLocked<T extends { date: Date; lockedAt: Date | null }>(
  record: T,
): T & { isLocked: boolean } {
  return { ...record, isLocked: isDailyRecordLocked(record.date, record.lockedAt) }
}

// ---------------------------------------------------------------------------
// 1. getDailyRecords
// ---------------------------------------------------------------------------

/**
 * Retourne les saisies journalières d'un lot, triées par date décroissante.
 * Pagination cursor-based — défaut 30 enregistrements (1 mois).
 */
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
        // cursorDate = date du dernier record reçu → on prend les dates strictement antérieures
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

/**
 * Retourne le détail d'une saisie journalière.
 */
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

/**
 * Crée une saisie journalière pour un lot actif.
 *
 * Contrainte : une seule saisie par lot et par date (@@unique en base).
 * La vérification est effectuée en amont pour retourner un message explicite.
 *
 * Les mortalityDetails (motifs de mortalité) sont optionnels à la création
 * et peuvent être ajoutés via updateDailyRecord. Une alerte est générée
 * si aucun motif n'est renseigné pendant 3 jours consécutifs.
 *
 * Requiert CREATE_DAILY_RECORD + accès en écriture à la ferme.
 * Le lot doit être ACTIVE — impossible de saisir sur un lot clôturé.
 */
export async function createDailyRecord(
  data: unknown,
): Promise<ActionResult<DailyRecordDetail>> {
  try {
    const parsed = createDailyRecordSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const {
      organizationId,
      batchId,
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

    // Normaliser la date à minuit UTC pour la contrainte unique batchId/date
    const normalizedDate = toUtcDate(date)

    // Vérifier le doublon avant insertion (message clair > erreur Prisma P2002)
    const existing = await prisma.dailyRecord.findUnique({
      where: { batchId_date: { batchId, date: normalizedDate } },
      select: { id: true },
    })
    if (existing) {
      return {
        success: false,
        error:   "Une saisie existe déjà pour ce lot à cette date",
      }
    }

    // Créer la saisie + les détails de mortalité dans une transaction
    let record: Prisma.DailyRecordGetPayload<{ select: typeof dailyRecordDetailSelect }>
    try {
      record = await prisma.$transaction(async (tx) => {
      const created = await tx.dailyRecord.create({
        data: {
          organizationId,
          batchId,
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
      after:          { batchId, date: normalizedDate, feedStockId, ...recordData },
    })

    const [enrichedRecord] = await enrichRecordsWithFeedStock(organizationId, [record])
    return { success: true, data: enrichedRecord }
  } catch (error) {
    // Race condition résiduelle : deux saisies simultanées pour le même lot/date
    if (isUniqueConstraintError(error)) {
      return { success: false, error: "Une saisie existe déjà pour ce lot à cette date" }
    }
    return { success: false, error: "Impossible d'enregistrer la saisie" }
  }
}

// ---------------------------------------------------------------------------
// 4. updateDailyRecord
// ---------------------------------------------------------------------------

/**
 * Corrige une saisie journalière existante.
 *
 * Règle de verrouillage (voir en-tête du module) :
 *   - Saisie déverrouillée → tout membre avec UPDATE_DAILY_RECORD peut corriger
 *   - Saisie verrouillée  → MANAGER+ uniquement (hasMinimumRole MANAGER)
 *
 * mortalityDetails :
 *   - Si fourni → remplace complètement les motifs de mortalité existants
 *   - Si absent → les motifs existants sont conservés sans modification
 *
 * recordedById est conservé (auteur original) — l'auteur de la correction
 * est tracé dans l'audit log.
 */
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

    // Récupérer la saisie avec le contexte batch/ferme en une requête
    const existing = await prisma.dailyRecord.findFirst({
      where:  { id: dailyRecordId, batchId, organizationId },
      select: {
        ...dailyRecordDetailSelect,
        batch: {
          select: {
            status:   true,
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

    // Règle lot clôturé :
    //   - Lot ACTIVE  → correction autorisée selon les règles de verrouillage ci-dessous
    //   - Lot clôturé → MANAGER+ uniquement, quelle que soit la date de la saisie
    //     Cas d'usage : erreur découverte après clôture du lot (ex. mortalité mal saisie)
    //     DATA_ENTRY et TECHNICIAN ne peuvent pas modifier les données d'un lot terminé
    if (
      existing.batch.status !== BatchStatus.ACTIVE &&
      !hasMinimumRole(role, UserRole.MANAGER)
    ) {
      return {
        success: false,
        error:   "Ce lot est clôturé. Seul un gestionnaire peut corriger les saisies d'un lot terminé.",
      }
    }

    // Vérification du verrouillage
    const locked = isDailyRecordLocked(existing.date, existing.lockedAt)
    if (locked && !hasMinimumRole(role, UserRole.MANAGER)) {
      return {
        success: false,
        error:   "Cette saisie est verrouillée. Contactez un gestionnaire pour la corriger.",
      }
    }

    // Mise à jour de la saisie + remplacement optionnel des mortalityDetails
    let updated: Prisma.DailyRecordGetPayload<{ select: typeof dailyRecordDetailSelect }>
    try {
      updated = await prisma.$transaction(async (tx) => {
      const record = await tx.dailyRecord.update({
        where:  { id: dailyRecordId },
        data:   updates,
        select: dailyRecordDetailSelect,
      })

      // Remplacement complet des motifs si fournis
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

        // Recharger avec les nouveaux mortalityRecords
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
      // Granularité : les champs scalaires modifiés + mortalityDetails si remplacés.
      // Les mortalityDetails non fournis (undefined) ne figurent pas dans after —
      // leur absence signifie "non modifiés", ce qui est fidèle à l'intention.
      after: {
        ...updates,
        ...(feedStockId !== undefined ? { feedStockId } : {}),
        ...(mortalityDetails !== undefined ? { mortalityDetails } : {}),
      },
    })

    const [enrichedRecord] = await enrichRecordsWithFeedStock(organizationId, [updated])
    return { success: true, data: enrichedRecord }
  } catch {
    return { success: false, error: "Impossible de mettre à jour la saisie" }
  }
}
