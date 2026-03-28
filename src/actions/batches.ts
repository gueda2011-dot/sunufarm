/**
 * SunuFarm — Server Actions : gestion des lots d'élevage
 *
 * Cœur métier du MVP. Chaque lot représente un cycle de production complet,
 * de l'entrée des sujets jusqu'à la vente ou l'abattage.
 *
 * Périmètre MVP :
 *   - Lister et consulter les lots d'une organisation
 *   - Créer un lot (numérotation auto SF-YYYY-NNN, atomique)
 *   - Modifier les champs non-immutables d'un lot actif
 *   - Clôturer un lot (fin normale de cycle de production)
 *   - Supprimer un lot vide créé par erreur
 *
 * Distinction fondamentale :
 *   closeBatch → fin normale d'un cycle de production (ACTIVE → CLOSED/SOLD/SLAUGHTERED)
 *   deleteBatch → annulation d'un lot créé par erreur, sans aucune donnée saisie
 *
 * Champs immuables après création :
 *   entryCount, entryDate, type, speciesId, organizationId, buildingId
 *   Ces champs définissent l'identité du lot et ne doivent jamais changer.
 *
 * Chaîne d'appartenance validée :
 *   organization → building → batch (via organizationId direct sur Batch)
 *   La ferme est résolue via building.farmId pour les checks canAccessFarm.
 */

"use server"

import { z } from "zod"
import prisma from "@/src/lib/prisma"
import {
  requireOrganizationModuleContext,
  type ActionResult,
} from "@/src/lib/auth"
import { createAuditLog, AuditAction } from "@/src/lib/audit"
import {
  canPerformAction,
  canAccessFarm,
  parseFarmPermissions,
  type FarmRight,
} from "@/src/lib/permissions"
import {
  requiredIdSchema,
  optionalIdSchema,
  positiveIntSchema,
  nonNegativeIntSchema,
  amountFcfaSchema,
  dateSchema,
  optionalDateSchema,
} from "@/src/lib/validators"
import { BatchType, BatchStatus } from "@/src/generated/prisma/client"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"

// ---------------------------------------------------------------------------
// Schémas Zod
// ---------------------------------------------------------------------------

const getBatchesSchema = z.object({
  organizationId: requiredIdSchema,
  status:         z.nativeEnum(BatchStatus).optional(),
  type:           z.nativeEnum(BatchType).optional(),
  farmId:         optionalIdSchema,
  buildingId:     optionalIdSchema,
  cursor:         optionalIdSchema,
  limit:          z.number().int().min(1).max(100).default(20),
})

const getBatchSchema = z.object({
  organizationId: requiredIdSchema,
  batchId:        requiredIdSchema,
})

const createBatchSchema = z.object({
  organizationId: requiredIdSchema,
  buildingId:     requiredIdSchema,
  type:           z.nativeEnum(BatchType),
  speciesId:      requiredIdSchema,
  breedId:        optionalIdSchema,
  entryDate:      dateSchema,
  entryCount:     positiveIntSchema,
  entryAgeDay:    nonNegativeIntSchema.default(0),
  entryWeightG:   positiveIntSchema.optional(),
  supplierId:     optionalIdSchema,
  unitCostFcfa:   amountFcfaSchema.default(0),
  totalCostFcfa:  amountFcfaSchema.default(0),
  notes:          z.string().max(1000).optional(),
})

const updateBatchSchema = z.object({
  organizationId: requiredIdSchema,
  batchId:        requiredIdSchema,
  // Champs modifiables uniquement — entryCount, entryDate, type, speciesId sont immuables
  breedId:        optionalIdSchema,
  supplierId:     optionalIdSchema,
  entryWeightG:   positiveIntSchema.optional(),
  unitCostFcfa:   amountFcfaSchema.optional(),
  totalCostFcfa:  amountFcfaSchema.optional(),
  notes:          z.string().max(1000).optional(),
})

const closeBatchSchema = z.object({
  organizationId: requiredIdSchema,
  batchId:        requiredIdSchema,
  closeStatus:    z.enum([
    BatchStatus.CLOSED,
    BatchStatus.SOLD,
    BatchStatus.SLAUGHTERED,
  ]),
  closeReason:    z.string().max(500).optional(),
  /** Date de clôture effective — par défaut : maintenant */
  closedAt:       optionalDateSchema,
})

const deleteBatchSchema = z.object({
  organizationId: requiredIdSchema,
  batchId:        requiredIdSchema,
})

// ---------------------------------------------------------------------------
// Types retournés
// ---------------------------------------------------------------------------

/** Résumé de lot pour les listes — inclut le contexte bâtiment/ferme */
export interface BatchSummary {
  id:             string
  organizationId: string
  buildingId:     string
  number:         string
  type:           BatchType
  status:         BatchStatus
  entryDate:      Date
  entryCount:     number
  entryAgeDay:    number
  unitCostFcfa:   number
  totalCostFcfa:  number
  closedAt:       Date | null
  createdAt:      Date
  breed: {
    id: string
    name: string
    code: string
  } | null
  building: {
    id:     string
    name:   string
    farmId: string
    farm: {
      id:   string
      name: string
    }
  }
  _count: {
    dailyRecords: number
  }
}

/** Détail complet d'un lot */
export interface BatchDetail extends BatchSummary {
  breedId:      string | null
  supplierId:   string | null
  entryWeightG: number | null
  closeReason:  string | null
  notes:        string | null
  updatedAt:    Date
  _count: {
    dailyRecords:  number
    eggRecords:    number
    weightRecords: number
    expenses:      number
    saleItems:     number
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

// ---------------------------------------------------------------------------
// Sélections Prisma partagées
// ---------------------------------------------------------------------------

const buildingWithFarmSelect = {
  id:     true,
  name:   true,
  farmId: true,
  farm: {
    select: { id: true, name: true },
  },
} as const

const batchSummarySelect = {
  id:             true,
  organizationId: true,
  buildingId:     true,
  number:         true,
  type:           true,
  status:         true,
  entryDate:      true,
  entryCount:     true,
  entryAgeDay:    true,
  unitCostFcfa:   true,
  totalCostFcfa:  true,
  closedAt:       true,
  createdAt:      true,
  breed: {
    select: {
      id: true,
      name: true,
      code: true,
    },
  },
  building: { select: buildingWithFarmSelect },
  _count: {
    select: { dailyRecords: true },
  },
} as const

const batchDetailSelect = {
  ...batchSummarySelect,
  breedId:      true,
  supplierId:   true,
  entryWeightG: true,
  closeReason:  true,
  notes:        true,
  updatedAt:    true,
  _count: {
    select: {
      dailyRecords:  true,
      eggRecords:    true,
      weightRecords: true,
      expenses:      true,
      saleItems:     true,
    },
  },
} as const

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

/**
 * Retourne un lot actif avec son farmId résolu, ou null.
 * Valide en une seule requête : batch appartient à l'org, n'est pas soft-deleted.
 * Le farmId (via building) est nécessaire pour canAccessFarm.
 */
async function findActiveBatch(batchId: string, organizationId: string) {
  return prisma.batch.findFirst({
    where: { id: batchId, organizationId, deletedAt: null },
    select: {
      id:          true,
      status:      true,
      buildingId:  true,
      building: { select: { farmId: true } },
    },
  })
}

/**
 * Retourne les IDs de fermes accessibles pour l'utilisateur, ou null si tout est accessible.
 *
 * null   → pas de filtre (SUPER_ADMIN, OWNER, MANAGER en lecture)
 * []     → aucune ferme accessible → résultat vide sans requête DB
 * [...]  → liste des farmIds autorisés
 */
function getAccessibleFarmIds(
  role: string,
  farmPermissions: unknown,
  right: FarmRight = "canRead",
): string[] | null {
  if (role === "SUPER_ADMIN" || role === "OWNER") return null
  if (role === "MANAGER" && right === "canRead")  return null

  const permissions = parseFarmPermissions(farmPermissions)
  return permissions
    .filter((p) => p[right] === true)
    .map((p) => p.farmId)
}

/**
 * Génère le prochain numéro de lot SF-YYYY-NNN pour l'organisation.
 * Doit être appelé à l'intérieur d'une $transaction pour garantir l'unicité.
 *
 * Format : SF-{année}-{séquence 3 chiffres min}
 * Limite théorique 3 chiffres : 999 lots/an/org — suffisant pour le MVP.
 * Au-delà, le numéro s'étend naturellement (SF-2026-1000) sans conflit.
 */
async function generateBatchNumber(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  organizationId: string,
): Promise<string> {
  const year    = new Date().getFullYear()
  const prefix  = `SF-${year}-`

  const lastBatch = await tx.batch.findFirst({
    where:   { organizationId, number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select:  { number: true },
  })

  const nextSeq = lastBatch
    ? parseInt(lastBatch.number.slice(prefix.length), 10) + 1
    : 1

  return `${prefix}${String(nextSeq).padStart(3, "0")}`
}

// ---------------------------------------------------------------------------
// 1. getBatches
// ---------------------------------------------------------------------------

/**
 * Retourne les lots actifs (non soft-deleted) d'une organisation.
 *
 * Les lots sont filtrés selon les fermes accessibles à l'utilisateur.
 * Si farmId ou buildingId est précisé, il est croisé avec les accès autorisés.
 * Pagination cursor-based sur l'id du lot.
 */
export async function getBatches(
  data: unknown,
): Promise<ActionResult<BatchSummary[]>> {
  try {
    const parsed = getBatchesSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, status, type, farmId, buildingId, cursor, limit } =
      parsed.data

    const accessResult = await requireOrganizationModuleContext(organizationId, "BATCHES")
    if (!accessResult.success) return accessResult

    const { role, farmPermissions } = accessResult.data.membership

    // Résoudre les fermes accessibles pour ce rôle
    const accessibleFarmIds = getAccessibleFarmIds(role, farmPermissions, "canRead")

    // Aucune ferme accessible → résultat vide immédiat
    if (accessibleFarmIds !== null && accessibleFarmIds.length === 0) {
      return { success: true, data: [] }
    }

    const batches = await prisma.batch.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(status     ? { status }                      : {}),
        ...(type       ? { type }                        : {}),
        ...(buildingId ? { buildingId }                  : {}),
        ...(farmId     ? { building: { farmId } }        : {}),
        // Filtre par fermes accessibles si la liste est restreinte
        ...(accessibleFarmIds !== null
          ? { building: { farmId: { in: accessibleFarmIds } } }
          : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select:  batchSummarySelect,
      orderBy: { entryDate: "desc" },
      take:    limit,
    })

    return { success: true, data: batches }
  } catch {
    return { success: false, error: "Impossible de récupérer les lots" }
  }
}

// ---------------------------------------------------------------------------
// 2. getBatch
// ---------------------------------------------------------------------------

/**
 * Retourne le détail complet d'un lot.
 * Vérifie l'accès en lecture à la ferme du lot.
 */
export async function getBatch(
  data: unknown,
): Promise<ActionResult<BatchDetail>> {
  try {
    const parsed = getBatchSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, batchId } = parsed.data

    const accessResult = await requireOrganizationModuleContext(organizationId, "BATCHES")
    if (!accessResult.success) return accessResult

    const { role, farmPermissions } = accessResult.data.membership

    const batch = await prisma.batch.findFirst({
      where:  { id: batchId, organizationId, deletedAt: null },
      select: batchDetailSelect,
    })

    if (!batch) {
      return { success: false, error: "Lot introuvable" }
    }

    if (!canAccessFarm(role, farmPermissions, batch.building.farmId, "canRead")) {
      return { success: false, error: "Accès refusé à ce lot" }
    }

    return { success: true, data: batch }
  } catch {
    return { success: false, error: "Impossible de récupérer le lot" }
  }
}

// ---------------------------------------------------------------------------
// 3. createBatch
// ---------------------------------------------------------------------------

/**
 * Crée un lot dans un bâtiment actif.
 *
 * Le numéro de lot SF-YYYY-NNN est généré automatiquement dans une $transaction
 * pour garantir l'unicité même en cas de créations simultanées.
 *
 * Requiert CREATE_BATCH + accès en écriture à la ferme du bâtiment.
 */
export async function createBatch(
  data: unknown,
): Promise<ActionResult<BatchDetail>> {
  try {
    const parsed = createBatchSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, buildingId, ...batchData } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "BATCHES")
    if (!accessResult.success) return accessResult
    const actorId = accessResult.data.session.user.id
    const { role, farmPermissions } = accessResult.data.membership

    if (!canPerformAction(role, "CREATE_BATCH")) {
      return { success: false, error: "Permission refusée" }
    }

    const subscription = await getOrganizationSubscription(organizationId)
    const activeBatchCount = await prisma.batch.count({
      where: {
        organizationId,
        deletedAt: null,
        status: BatchStatus.ACTIVE,
      },
    })

    if (activeBatchCount >= subscription.maxActiveBatches) {
      return {
        success: false,
        error: `Le plan ${subscription.label} est limite a ${subscription.maxActiveBatches} lot(s) actif(s). Passez au niveau superieur pour continuer.`,
      }
    }

    // Valider que le bâtiment appartient à l'organisation et n'est pas soft-deleted
    const building = await prisma.building.findFirst({
      where:  { id: buildingId, organizationId, deletedAt: null },
      select: { id: true, farmId: true },
    })
    if (!building) {
      return { success: false, error: "Bâtiment introuvable" }
    }

    if (!canAccessFarm(role, farmPermissions, building.farmId, "canWrite")) {
      return { success: false, error: "Accès en écriture refusé sur cette ferme" }
    }

    // Génération du numéro + création dans une seule transaction
    const batch = await prisma.$transaction(async (tx) => {
      const number = await generateBatchNumber(tx, organizationId)
      return tx.batch.create({
        data:   { organizationId, buildingId, number, ...batchData },
        select: batchDetailSelect,
      })
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.CREATE,
      resourceType:   "BATCH",
      resourceId:     batch.id,
      after:          { number: batch.number, buildingId, ...batchData },
    })

    return { success: true, data: batch }
  } catch {
    return { success: false, error: "Impossible de créer le lot" }
  }
}

// ---------------------------------------------------------------------------
// 4. updateBatch
// ---------------------------------------------------------------------------

/**
 * Modifie les champs non-immuables d'un lot actif.
 *
 * Champs IMMUABLES (refusés par le schéma Zod) :
 *   entryCount, entryDate, type, speciesId, buildingId, organizationId
 *
 * Requiert UPDATE_BATCH + accès en écriture à la ferme.
 * Refusé si le lot n'est pas ACTIVE.
 */
export async function updateBatch(
  data: unknown,
): Promise<ActionResult<BatchDetail>> {
  try {
    const parsed = updateBatchSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, batchId, ...updates } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "BATCHES")
    if (!accessResult.success) return accessResult
    const actorId = accessResult.data.session.user.id
    const { role, farmPermissions } = accessResult.data.membership

    if (!canPerformAction(role, "UPDATE_BATCH")) {
      return { success: false, error: "Permission refusée" }
    }

    const existing = await findActiveBatch(batchId, organizationId)
    if (!existing) {
      return { success: false, error: "Lot introuvable" }
    }

    if (existing.status !== BatchStatus.ACTIVE) {
      return { success: false, error: "Ce lot est clôturé et ne peut plus être modifié" }
    }

    if (!canAccessFarm(role, farmPermissions, existing.building.farmId, "canWrite")) {
      return { success: false, error: "Accès en écriture refusé sur cette ferme" }
    }

    const batch = await prisma.batch.update({
      where:  { id: batchId },
      data:   updates,
      select: batchDetailSelect,
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.UPDATE,
      resourceType:   "BATCH",
      resourceId:     batchId,
      before:         existing,
      after:          updates,
    })

    return { success: true, data: batch }
  } catch {
    return { success: false, error: "Impossible de mettre à jour le lot" }
  }
}

// ---------------------------------------------------------------------------
// 5. closeBatch
// ---------------------------------------------------------------------------

/**
 * Clôture un lot actif — fin normale d'un cycle de production.
 *
 * Transitions autorisées : ACTIVE → CLOSED | SOLD | SLAUGHTERED
 * Le statut terminal est immuable : un lot clôturé ne peut pas être réouvert.
 *
 * Convention :
 *   CLOSED      → lot terminé sans vente directe (abattage propre, déstockage)
 *   SOLD        → lot vendu en totalité à un acheteur
 *   SLAUGHTERED → lot abattu sur place (consommation, transformation)
 *
 * Requiert CLOSE_BATCH + accès en écriture à la ferme.
 */
export async function closeBatch(
  data: unknown,
): Promise<ActionResult<BatchDetail>> {
  try {
    const parsed = closeBatchSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, batchId, closeStatus, closeReason, closedAt } =
      parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "BATCHES")
    if (!accessResult.success) return accessResult
    const actorId = accessResult.data.session.user.id
    const { role, farmPermissions } = accessResult.data.membership

    if (!canPerformAction(role, "CLOSE_BATCH")) {
      return { success: false, error: "Permission refusée" }
    }

    const existing = await findActiveBatch(batchId, organizationId)
    if (!existing) {
      return { success: false, error: "Lot introuvable" }
    }

    if (existing.status !== BatchStatus.ACTIVE) {
      return {
        success: false,
        error: "Ce lot est déjà clôturé",
      }
    }

    if (!canAccessFarm(role, farmPermissions, existing.building.farmId, "canWrite")) {
      return { success: false, error: "Accès en écriture refusé sur cette ferme" }
    }

    const batch = await prisma.batch.update({
      where: { id: batchId },
      data:  {
        status:      closeStatus,
        closedAt:    closedAt ?? new Date(),
        closeReason: closeReason ?? null,
      },
      select: batchDetailSelect,
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.UPDATE,
      resourceType:   "BATCH",
      resourceId:     batchId,
      before:         { status: BatchStatus.ACTIVE },
      after:          { status: closeStatus, closeReason },
    })

    return { success: true, data: batch }
  } catch {
    return { success: false, error: "Impossible de clôturer le lot" }
  }
}

// ---------------------------------------------------------------------------
// 6. deleteBatch
// ---------------------------------------------------------------------------

/**
 * Supprime un lot vide créé par erreur (soft delete).
 *
 * IMPORTANT — Ce n'est pas le workflow normal de fin de lot.
 *   → Pour terminer un cycle de production, utiliser closeBatch().
 *   → deleteBatch est réservé à l'annulation d'un lot créé par erreur,
 *     avant toute saisie de données de production.
 *
 * Conditions requises (toutes) :
 *   1. Rôle DELETE_BATCH (SUPER_ADMIN ou OWNER uniquement)
 *   2. Lot ACTIVE (un lot clôturé ne se supprime pas)
 *   3. Aucun enregistrement lié : DailyRecord, EggProductionRecord,
 *      SaleItem ou Expense — si des données existent, utiliser closeBatch()
 *
 * Retourne { success: true, data: undefined } — conforme à ActionResult<void>.
 */
export async function deleteBatch(
  data: unknown,
): Promise<ActionResult<void>> {
  const parsed = deleteBatchSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: "Données invalides" }
  }

  const { organizationId, batchId } = parsed.data
  const accessResult = await requireOrganizationModuleContext(organizationId, "BATCHES")
  if (!accessResult.success) return accessResult
  const actorId = accessResult.data.session.user.id
  const { role, farmPermissions } = accessResult.data.membership

  if (!canPerformAction(role, "DELETE_BATCH")) {
    return { success: false, error: "Permission refusée" }
  }

  const existing = await findActiveBatch(batchId, organizationId)
  if (!existing) {
    return { success: false, error: "Lot introuvable" }
  }

  if (existing.status !== BatchStatus.ACTIVE) {
    return {
      success: false,
      error:   "Un lot clôturé ne peut pas être supprimé — ses données doivent être conservées",
    }
  }

  if (!canAccessFarm(role, farmPermissions, existing.building.farmId, "canWrite")) {
    return { success: false, error: "Accès en écriture refusé sur cette ferme" }
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Vérifier l'absence de tout enregistrement lié
      const [dailyCount, eggCount, saleCount, expenseCount] = await Promise.all([
        tx.dailyRecord.count({ where: { batchId } }),
        tx.eggProductionRecord.count({ where: { batchId } }),
        tx.saleItem.count({ where: { batchId } }),
        tx.expense.count({ where: { batchId } }),
      ])

      const totalLinked = dailyCount + eggCount + saleCount + expenseCount
      if (totalLinked > 0) {
        throw new BusinessRuleError(
          "Ce lot contient des données de production. Utilisez la clôture plutôt que la suppression.",
        )
      }

      await tx.batch.update({
        where: { id: batchId },
        data:  { deletedAt: new Date() },
      })
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.DELETE,
      resourceType:   "BATCH",
      resourceId:     batchId,
      before:         existing,
    })

    return { success: true, data: undefined }
  } catch (error) {
    if (error instanceof BusinessRuleError) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Impossible de supprimer le lot" }
  }
}
