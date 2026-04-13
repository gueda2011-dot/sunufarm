/**
 * SunuFarm — Server Actions : gestion des sacs d'aliment (FeedBagEvent)
 *
 * Ces actions implémentent le mode de saisie "par sacs" — l'éleveur déclare
 * l'ouverture et la fermeture d'un sac, le moteur reconstruit la consommation
 * journalière via l'algorithme CURVE_WEIGHTED (ou LINEAR en fallback).
 *
 * RÈGLE FONDAMENTALE :
 *   Un DailyRecord avec dataSource = MANUAL_KG n'est JAMAIS écrasé par une
 *   reconstruction de sac. La saisie manuelle prime toujours sur l'estimation.
 *
 * Idempotence :
 *   clientMutationId garantit la déduplication (mode offline) — si un sac
 *   avec le même clientMutationId existe déjà, l'action retourne l'existant.
 *
 * Pipeline d'une reconstruction :
 *   1. Charger la courbe ajustée (profil Sénégal + facteur ferme si ACTIVE)
 *   2. Appeler reconstructDailyFromBagEvent() → tableau DailyFeedEstimate[]
 *   3. Pour chaque jour :
 *        - Si DailyRecord MANUAL_KG existe → skip
 *        - Si DailyRecord ESTIMATED_FROM_BAG existe → update
 *        - Sinon → create
 */

"use server"

import { z } from "zod"
import prisma from "@/src/lib/prisma"
import {
  requireOrganizationModuleContext,
  type ActionResult,
} from "@/src/lib/auth"
import { actionSuccess } from "@/src/lib/action-result"
import {
  reconstructDailyFromBagEvent,
} from "@/src/lib/feed-reconstruction"
import type { DailyFeedEstimate } from "@/src/lib/feed-reference-core"
import { getAdjustedCurveForBatch } from "@/src/lib/feed-reference"
import { FeedMovementType } from "@/src/generated/prisma/client"

// =============================================================================
// Schémas Zod
// =============================================================================

const requiredIdSchema = z.string().cuid("ID invalide")

const createFeedBagEventSchema = z.object({
  organizationId: requiredIdSchema,
  batchId:        requiredIdSchema,
  feedStockId:    z.string().cuid().nullable().optional(),
  clientMutationId: z.string().max(128).optional(),

  bagWeightKg:  z.number().positive("Le poids du sac doit être positif"),
  startDate:    z.coerce.date(),
  startAgeDay:  z.number().int().nonnegative(),

  /** Si fourni, le sac est immédiatement clôturé et les DailyRecord générés */
  endDate:    z.coerce.date().optional(),
  endAgeDay:  z.number().int().nonnegative().optional(),

  notes: z.string().max(1000).optional(),
})

const closeFeedBagEventSchema = z.object({
  organizationId: requiredIdSchema,
  bagEventId:     requiredIdSchema,
  endDate:        z.coerce.date(),
  endAgeDay:      z.number().int().nonnegative(),
  notes:          z.string().max(1000).optional(),
})

const getFeedBagEventsSchema = z.object({
  organizationId: requiredIdSchema,
  batchId:        requiredIdSchema,
  includeOpen:    z.boolean().default(true),
})

const deleteFeedBagEventSchema = z.object({
  organizationId: requiredIdSchema,
  bagEventId:     requiredIdSchema,
})

// =============================================================================
// Types publics
// =============================================================================

export interface FeedBagEventSummary {
  id:               string
  batchId:          string
  feedStockId:      string | null
  bagWeightKg:      number
  startDate:        Date
  endDate:          Date | null
  startAgeDay:      number
  endAgeDay:        number | null
  estimationMethod: string
  curveVersion:     string | null
  notes:            string | null
  recordedById:     string | null
  createdAt:        Date
  updatedAt:        Date
  /** Nombre de DailyRecord générés depuis ce sac */
  generatedRecordCount: number
}

export interface CreateBagResult {
  bagEvent: FeedBagEventSummary
  /** Nombre de DailyRecord créés */
  createdCount: number
  /** Nombre de DailyRecord mis à jour (si sac fermé immédiatement) */
  updatedCount: number
  /** Nombre de DailyRecord ignorés (dataSource = MANUAL_KG) */
  skippedManualCount: number
}

// =============================================================================
// Helpers internes
// =============================================================================

/**
 * Charge le contexte d'un lot nécessaire pour la reconstruction.
 */
async function loadBatchContext(batchId: string, organizationId: string) {
  return prisma.batch.findFirst({
    where: { id: batchId, organizationId, deletedAt: null },
    select: {
      id:          true,
      type:        true,
      entryCount:  true,
      entryAgeDay: true,
      status:      true,
      breed:  { select: { code: true } },
      building: {
        select: {
          farmId: true,
          farm: { select: { id: true, senegalProfileCode: true } },
        },
      },
    },
  })
}

function buildBagFeedReference(bagEventId: string): string {
  return `feed-bag:${bagEventId}`
}

/**
 * Estime l'effectif vivant moyen sur une période (approximation simple).
 * On lit les DailyRecord de la période pour agréger les mortalités.
 */
async function estimateLivingBirds(
  batchId: string,
  entryCount: number,
  startDate: Date,
  endDate: Date
): Promise<number> {
  const records = await prisma.dailyRecord.findMany({
    where: {
      batchId,
      date: { gte: startDate, lte: endDate },
    },
    select: { mortality: true },
  })
  const totalMortality = records.reduce((sum, r) => sum + r.mortality, 0)
  return Math.max(1, entryCount - totalMortality)
}

/**
 * Applique un tableau de DailyFeedEstimate en base de données.
 *
 * Règles :
 *   - MANUAL_KG existant → skip (retourne dans skippedManualCount)
 *   - ESTIMATED_FROM_BAG existant → update si même sac, sinon skip
 *   - Absent → create
 *
 * @returns Compteurs { created, updated, skipped }
 */
async function applyDailyEstimates(
  estimates: DailyFeedEstimate[],
  batchId: string,
  organizationId: string,
  bagEventId: string,
  recordedById: string | null
): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0
  let updated = 0
  let skipped = 0

  for (const est of estimates) {
    const dateOnly = new Date(
      Date.UTC(
        est.date.getUTCFullYear(),
        est.date.getUTCMonth(),
        est.date.getUTCDate()
      )
    )

    // Vérifier si un DailyRecord existe pour ce lot + date
    const existing = await prisma.dailyRecord.findUnique({
      where: { batchId_date: { batchId, date: dateOnly } },
      select: {
        id:         true,
        dataSource: true,
        feedBagEventId: true,
      },
    })

    if (existing) {
      // RÈGLE FONDAMENTALE : MANUAL_KG n'est jamais écrasé
      if (existing.dataSource === "MANUAL_KG") {
        skipped++
        continue
      }

      // Update uniquement si le record appartient au même sac
      // (évite d'écraser une estimation d'un autre sac)
      if (existing.dataSource === "ESTIMATED_FROM_BAG" && existing.feedBagEventId === bagEventId) {
        await prisma.dailyRecord.update({
          where: { id: existing.id },
          data: {
            feedKg:               est.estimatedFeedKg,
            estimationConfidence: est.confidence,
            updatedAt:            new Date(),
          },
        })
        updated++
      } else {
        // Estimation d'un autre sac ou source inconnue → skip conservatif
        skipped++
      }
    } else {
      // Créer un nouveau DailyRecord estimé
      await prisma.dailyRecord.create({
        data: {
          organizationId,
          batchId,
          date:                 dateOnly,
          mortality:            0,
          feedKg:               est.estimatedFeedKg,
          dataSource:           "ESTIMATED_FROM_BAG",
          feedBagEventId:       bagEventId,
          estimationConfidence: est.confidence,
          recordedById,
        },
      })
      created++
    }
  }

  return { created, updated, skipped }
}

// =============================================================================
// Action : Créer un sac (avec ou sans clôture immédiate)
// =============================================================================

/**
 * Crée un événement sac et reconstruit optionnellement la consommation journalière.
 *
 * Si endDate et endAgeDay sont fournis → sac immédiatement clôturé + DailyRecord générés.
 * Sinon → sac ouvert, DailyRecord générés à la clôture via closeFeedBagEvent().
 */
export async function createFeedBagEvent(
  input: unknown
): Promise<ActionResult<CreateBagResult>> {
  const contextResult = await requireOrganizationModuleContext(
    (input as { organizationId?: string })?.organizationId ?? "",
    "DAILY"
  )
  if (!contextResult.success) return contextResult

  const parsed = createFeedBagEventSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: "Données invalides : " + parsed.error.issues.map((i) => i.message).join(", "),
    }
  }

  const data = parsed.data
  const { membership } = contextResult.data

  // Idempotence : si clientMutationId existe déjà, retourner l'existant
  if (data.clientMutationId) {
    const existing = await prisma.feedBagEvent.findUnique({
      where: { clientMutationId: data.clientMutationId },
      include: { _count: { select: { dailyRecords: true } } },
    })
    if (existing) {
      return actionSuccess({
        bagEvent: mapBagEvent(existing, existing._count.dailyRecords),
        createdCount: 0,
        updatedCount: 0,
        skippedManualCount: 0,
      })
    }
  }

  // Vérifier que le lot appartient à l'organisation et est actif
  const batch = await loadBatchContext(data.batchId, data.organizationId)
  if (!batch) {
    return { success: false, error: "Lot introuvable ou accès refusé." }
  }
  if (batch.status === "CLOSED") {
    return { success: false, error: "Impossible d'ajouter un sac à un lot clôturé." }
  }

  const isClosed = !!(data.endDate && data.endAgeDay !== undefined)

  const farmId = batch.building.farm?.id ?? batch.building.farmId

  // Créer le FeedBagEvent + mouvement de stock associé si un stock est sélectionné
  let bagEvent: Awaited<ReturnType<typeof prisma.feedBagEvent.create>>

  try {
    bagEvent = await prisma.$transaction(async (tx) => {
      let feedStockMeta: { id: string; quantityKg: number; feedTypeId: string; farmId: string } | null = null

      if (data.feedStockId) {
        feedStockMeta = await tx.feedStock.findFirst({
          where: { id: data.feedStockId, organizationId: data.organizationId },
          select: {
            id: true,
            quantityKg: true,
            feedTypeId: true,
            farmId: true,
          },
        })

        if (!feedStockMeta) {
          throw new Error("Stock aliment introuvable.")
        }

        if (feedStockMeta.farmId !== farmId) {
          throw new Error("Le stock aliment choisi doit appartenir à la même ferme que le lot.")
        }

        if (feedStockMeta.quantityKg < data.bagWeightKg) {
          throw new Error(
            `Stock insuffisant : ${feedStockMeta.quantityKg.toFixed(2)} kg disponibles, ${data.bagWeightKg.toFixed(2)} kg demandés.`,
          )
        }
      }

      const createdBagEvent = await tx.feedBagEvent.create({
        data: {
          organizationId:   data.organizationId,
          batchId:          data.batchId,
          feedStockId:      data.feedStockId ?? null,
          clientMutationId: data.clientMutationId ?? null,
          bagWeightKg:      data.bagWeightKg,
          startDate:        data.startDate,
          endDate:          data.endDate ?? null,
          startAgeDay:      data.startAgeDay,
          endAgeDay:        data.endAgeDay ?? null,
          estimationMethod: "CURVE_WEIGHTED",
          notes:            data.notes ?? null,
          recordedById:     membership.userId,
        },
        include: { _count: { select: { dailyRecords: true } } },
      })

      if (feedStockMeta) {
        await tx.feedStock.update({
          where: { id: feedStockMeta.id },
          data: { quantityKg: feedStockMeta.quantityKg - data.bagWeightKg },
        })

        await tx.feedMovement.create({
          data: {
            organizationId: data.organizationId,
            feedStockId: feedStockMeta.id,
            feedTypeId: feedStockMeta.feedTypeId,
            type: FeedMovementType.SORTIE,
            quantityKg: data.bagWeightKg,
            batchId: data.batchId,
            reference: buildBagFeedReference(createdBagEvent.id),
            notes: "Consommation enregistrée depuis le mode sac",
            recordedById: membership.userId,
            date: data.startDate,
          },
        })
      }

      return createdBagEvent
    })
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Impossible d'enregistrer le sac.",
    }
  }

  // Si sac non clôturé → pas de reconstruction maintenant
  if (!isClosed || data.endAgeDay === undefined || !data.endDate) {
    return actionSuccess({
      bagEvent: mapBagEvent(bagEvent, 0),
      createdCount: 0,
      updatedCount: 0,
      skippedManualCount: 0,
    })
  }

  // Reconstruire la consommation journalière
  const { created, updated, skipped } = await reconstructAndApply({
    bagEventId:      bagEvent.id,
    batchId:         data.batchId,
    organizationId:  data.organizationId,
    bagWeightKg:     data.bagWeightKg,
    startDate:       data.startDate,
    endDate:         data.endDate,
    startAgeDay:     data.startAgeDay,
    endAgeDay:       data.endAgeDay,
    entryCount:      batch.entryCount,
    breedCode:       batch.breed?.code ?? null,
    batchType:       batch.type as "CHAIR" | "PONDEUSE",
    farmId,
    recordedById:    membership.userId,
  })

  // Mettre à jour le curveVersion sur le sac si la reconstruction a utilisé une courbe
  // (fait en best-effort — pas bloquant)
  return actionSuccess({
    bagEvent: mapBagEvent(bagEvent, created + updated),
    createdCount: created,
    updatedCount: updated,
    skippedManualCount: skipped,
  })
}

// =============================================================================
// Action : Clôturer un sac ouvert
// =============================================================================

/**
 * Clôture un sac ouvert et génère les DailyRecord estimés pour la période.
 *
 * Idempotent : si le sac est déjà clôturé, retourne les données actuelles.
 */
export async function closeFeedBagEvent(
  input: unknown
): Promise<ActionResult<CreateBagResult>> {
  const contextResult = await requireOrganizationModuleContext(
    (input as { organizationId?: string })?.organizationId ?? "",
    "DAILY"
  )
  if (!contextResult.success) return contextResult

  const parsed = closeFeedBagEventSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: "Données invalides : " + parsed.error.issues.map((i) => i.message).join(", "),
    }
  }

  const data = parsed.data
  const { membership } = contextResult.data

  // Charger le sac
  const bagEvent = await prisma.feedBagEvent.findFirst({
    where: {
      id:             data.bagEventId,
      organizationId: data.organizationId,
    },
    include: {
      batch: {
        select: {
          type:        true,
          entryCount:  true,
          entryAgeDay: true,
          breed: { select: { code: true } },
          building: {
            select: {
              farmId: true,
              farm: { select: { id: true } },
            },
          },
        },
      },
      _count: { select: { dailyRecords: true } },
    },
  })

  if (!bagEvent) {
    return { success: false, error: "Sac introuvable ou accès refusé." }
  }

  // Si déjà clôturé → retourner l'état actuel (idempotent)
  if (bagEvent.endDate && bagEvent.endAgeDay !== null) {
    return actionSuccess({
      bagEvent: mapBagEvent(bagEvent, bagEvent._count.dailyRecords),
      createdCount: 0,
      updatedCount: 0,
      skippedManualCount: 0,
    })
  }

  // Mettre à jour le sac avec la date de clôture
  const updatedBag = await prisma.feedBagEvent.update({
    where: { id: data.bagEventId },
    data: {
      endDate:   data.endDate,
      endAgeDay: data.endAgeDay,
      notes:     data.notes ?? bagEvent.notes,
    },
    include: { _count: { select: { dailyRecords: true } } },
  })

  const farmId = bagEvent.batch.building.farm?.id ?? bagEvent.batch.building.farmId

  // Reconstruire la consommation journalière
  const { created, updated, skipped } = await reconstructAndApply({
    bagEventId:      bagEvent.id,
    batchId:         bagEvent.batchId,
    organizationId:  bagEvent.organizationId,
    bagWeightKg:     bagEvent.bagWeightKg,
    startDate:       bagEvent.startDate,
    endDate:         data.endDate,
    startAgeDay:     bagEvent.startAgeDay,
    endAgeDay:       data.endAgeDay,
    entryCount:      bagEvent.batch.entryCount,
    breedCode:       bagEvent.batch.breed?.code ?? null,
    batchType:       bagEvent.batch.type as "CHAIR" | "PONDEUSE",
    farmId,
    recordedById:    membership.userId,
  })

  return actionSuccess({
    bagEvent: mapBagEvent(updatedBag, created + updated),
    createdCount: created,
    updatedCount: updated,
    skippedManualCount: skipped,
  })
}

// =============================================================================
// Action : Lister les sacs d'un lot
// =============================================================================

export async function getFeedBagEvents(
  input: unknown
): Promise<ActionResult<FeedBagEventSummary[]>> {
  const contextResult = await requireOrganizationModuleContext(
    (input as { organizationId?: string })?.organizationId ?? "",
    "DAILY"
  )
  if (!contextResult.success) return contextResult

  const parsed = getFeedBagEventsSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: "Données invalides.",
    }
  }

  const data = parsed.data

  const bags = await prisma.feedBagEvent.findMany({
    where: {
      organizationId: data.organizationId,
      batchId:        data.batchId,
      ...(data.includeOpen ? {} : { endDate: { not: null } }),
    },
    orderBy: { startDate: "asc" },
    include: { _count: { select: { dailyRecords: true } } },
  })

  return actionSuccess(bags.map((b) => mapBagEvent(b, b._count.dailyRecords)))
}

// =============================================================================
// Action : Supprimer un sac (et ses DailyRecord ESTIMATED associés)
// =============================================================================

/**
 * Supprime un sac et les DailyRecord estimés qu'il a générés.
 * Les DailyRecord MANUAL_KG ne sont jamais supprimés.
 */
export async function deleteFeedBagEvent(
  input: unknown
): Promise<ActionResult<{ deletedRecordCount: number }>> {
  const contextResult = await requireOrganizationModuleContext(
    (input as { organizationId?: string })?.organizationId ?? "",
    "DAILY"
  )
  if (!contextResult.success) return contextResult

  const parsed = deleteFeedBagEventSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: "Données invalides." }
  }

  const data = parsed.data

  const bagEvent = await prisma.feedBagEvent.findFirst({
    where: {
      id:             data.bagEventId,
      organizationId: data.organizationId,
    },
    select: { id: true },
  })

  if (!bagEvent) {
    return { success: false, error: "Sac introuvable ou accès refusé." }
  }

  // Supprimer uniquement les DailyRecord ESTIMATED générés par ce sac
  const { count: deletedRecordCount } = await prisma.dailyRecord.deleteMany({
    where: {
      feedBagEventId: data.bagEventId,
      dataSource:     "ESTIMATED_FROM_BAG",
    },
  })

  await prisma.$transaction(async (tx) => {
    const movement = await tx.feedMovement.findFirst({
      where: {
        organizationId: data.organizationId,
        reference: buildBagFeedReference(data.bagEventId),
      },
      select: {
        id: true,
        quantityKg: true,
        feedStockId: true,
        feedStock: {
          select: {
            quantityKg: true,
          },
        },
      },
    })

    if (movement) {
      await tx.feedStock.update({
        where: { id: movement.feedStockId },
        data: { quantityKg: movement.feedStock.quantityKg + movement.quantityKg },
      })

      await tx.feedMovement.delete({
        where: { id: movement.id },
      })
    }

    await tx.feedBagEvent.delete({
      where: { id: data.bagEventId },
    })
  })

  return actionSuccess({ deletedRecordCount })
}

// =============================================================================
// Logique de reconstruction interne
// =============================================================================

interface ReconstructParams {
  bagEventId:     string
  batchId:        string
  organizationId: string
  bagWeightKg:    number
  startDate:      Date
  endDate:        Date
  startAgeDay:    number
  endAgeDay:      number
  entryCount:     number
  breedCode:      string | null
  batchType:      "CHAIR" | "PONDEUSE"
  farmId:         string
  recordedById:   string | null
}

async function reconstructAndApply(
  params: ReconstructParams
): Promise<{ created: number; updated: number; skipped: number }> {
  const {
    bagEventId, batchId, organizationId, bagWeightKg,
    startDate, endDate, startAgeDay, endAgeDay,
    entryCount, breedCode, batchType, farmId, recordedById,
  } = params

  // Effectif vivant estimé sur la période
  const livingBirdsEstimate = await estimateLivingBirds(
    batchId,
    entryCount,
    startDate,
    endDate
  )

  // Charger la courbe ajustée (profil Sénégal + facteur ferme si ACTIVE)
  const { curve, senegalProfileCode, farmFactors } = await getAdjustedCurveForBatch(
    prisma,
    {
      batchId,
      farmId,
      batchType,
      breedCode,
      startAgeDay,
      endAgeDay,
    }
  )

  // Reconstruire via le moteur
  const estimates = reconstructDailyFromBagEvent(
    {
      bagWeightKg,
      startDate,
      endDate,
      startAgeDay,
      endAgeDay,
      livingBirdsEstimate,
      breedCode:          breedCode ?? "UNKNOWN",
      senegalProfileCode,
      farmFactors,
    },
    curve
  )

  // Stocker la version de courbe utilisée (best-effort)
  const curveVersion = curve[0]?.version ?? null
  const estimationMethod =
    curve.length > 0 ? "CURVE_WEIGHTED" : "LINEAR"

  if (curveVersion) {
    await prisma.feedBagEvent.update({
      where: { id: bagEventId },
      data: {
        curveVersion,
        estimationMethod,
      },
    }).catch(() => {
      // best-effort — ne pas bloquer si la mise à jour échoue
    })
  }

  // Appliquer les estimations en base
  return applyDailyEstimates(
    estimates,
    batchId,
    organizationId,
    bagEventId,
    recordedById
  )
}

// =============================================================================
// Mapping vers le type public
// =============================================================================

function mapBagEvent(
  bag: {
    id:               string
    batchId:          string
    feedStockId:      string | null
    bagWeightKg:      number
    startDate:        Date
    endDate:          Date | null
    startAgeDay:      number
    endAgeDay:        number | null
    estimationMethod: string
    curveVersion:     string | null
    notes:            string | null
    recordedById:     string | null
    createdAt:        Date
    updatedAt:        Date
  },
  generatedRecordCount: number
): FeedBagEventSummary {
  return {
    id:                   bag.id,
    batchId:              bag.batchId,
    feedStockId:          bag.feedStockId,
    bagWeightKg:          bag.bagWeightKg,
    startDate:            bag.startDate,
    endDate:              bag.endDate,
    startAgeDay:          bag.startAgeDay,
    endAgeDay:            bag.endAgeDay,
    estimationMethod:     bag.estimationMethod,
    curveVersion:         bag.curveVersion,
    notes:                bag.notes,
    recordedById:         bag.recordedById,
    createdAt:            bag.createdAt,
    updatedAt:            bag.updatedAt,
    generatedRecordCount,
  }
}
