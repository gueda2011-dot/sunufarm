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
  requireSession,
  requireMembership,
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
import { buildBatchNotesWithVaccinationPlan } from "@/src/lib/vaccination-planning"
import { ensurePoultryReferenceData } from "@/src/lib/poultry-reference-data"
import { isMissingSchemaFeatureError } from "@/src/lib/prisma-schema-guard"
import {
  buildVaccinationPlanItemsFromTemplate,
  buildVaccinationPlanNameFromTemplate,
  getTemplateProductionTypeForBatchType,
  inferPoultrySpeciesFromSpeciesCode,
  isStrainCompatibleWithBatchType,
} from "@/src/lib/poultry-reference"

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
  poultryStrainId: optionalIdSchema,
  vaccinationPlanTemplateId: optionalIdSchema,
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
  poultryStrainId: z.string().cuid().nullable().optional(),
  supplierId:     optionalIdSchema,
  entryWeightG:   positiveIntSchema.optional(),
  unitCostFcfa:   amountFcfaSchema.optional(),
  totalCostFcfa:  amountFcfaSchema.optional(),
  notes:          z.string().max(1000).optional(),
})

// Statuts autorisés à la clôture — ACTIVE n'est pas une destination
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
  poultryStrain: {
    id: string
    name: string
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

function isBatchReferenceSchemaUnavailable(error: unknown): boolean {
  return isMissingSchemaFeatureError(error) || isMissingSchemaFeatureError(error, [
    "PoultryStrain",
    "VaccinationPlanTemplate",
    "poultryStrain",
    "poultryStrainId",
  ])
}

function withLegacyPoultryStrain<T extends object>(
  batch: T,
): T & { poultryStrain: null } {
  return {
    ...batch,
    poultryStrain: null,
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
  poultryStrain: {
    select: {
      id: true,
      name: true,
    },
  },
  building: { select: buildingWithFarmSelect },
  _count: {
    select: { dailyRecords: true },
  },
} as const

const batchSummarySelectLegacy = {
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

const batchDetailSelectLegacy = {
  ...batchSummarySelectLegacy,
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
      type:        true,
      buildingId:  true,
      speciesId:   true,
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

async function validatePoultryStrainForBatch(args: {
  poultryStrainId: string | null
  speciesId: string
  batchType: BatchType
}) {
  const { poultryStrainId, speciesId, batchType } = args

  if (!poultryStrainId) {
    return { success: true as const, data: null }
  }

  const [species, strain] = await Promise.all([
    prisma.species.findUnique({
      where: { id: speciesId },
      select: { id: true, code: true, name: true },
    }),
    prisma.poultryStrain.findFirst({
      where: { id: poultryStrainId, isActive: true },
      select: {
        id: true,
        name: true,
        species: true,
        productionType: true,
      },
    }),
  ])

  if (!species) {
    return { success: false as const, error: "Espece introuvable" }
  }

  if (!strain) {
    return { success: false as const, error: "Souche avicole introuvable ou inactive" }
  }

  const inferredSpecies = inferPoultrySpeciesFromSpeciesCode(species.code)
  if (!inferredSpecies || inferredSpecies !== strain.species) {
    return {
      success: false as const,
      error: "La souche selectionnee n'est pas compatible avec l'espece du lot",
    }
  }

  if (!isStrainCompatibleWithBatchType(strain.productionType, batchType)) {
    return {
      success: false as const,
      error: "La souche selectionnee n'est pas compatible avec le type de lot",
    }
  }

  return { success: true as const, data: strain }
}

async function validateVaccinationPlanTemplateForBatch(args: {
  vaccinationPlanTemplateId: string | null
  batchType: BatchType
}) {
  const { vaccinationPlanTemplateId, batchType } = args

  if (!vaccinationPlanTemplateId) {
    return { success: true as const, data: null }
  }

  const expectedProductionType = getTemplateProductionTypeForBatchType(batchType)
  if (!expectedProductionType) {
    return {
      success: false as const,
      error:
        "Aucun template vaccinal par defaut n'est prevu pour ce type de lot",
    }
  }

  const template = await prisma.vaccinationPlanTemplate.findFirst({
    where: {
      id: vaccinationPlanTemplateId,
      isActive: true,
      productionType: expectedProductionType,
    },
    select: {
      id: true,
      name: true,
      productionType: true,
      items: {
        orderBy: { dayOfAge: "asc" },
        select: {
          dayOfAge: true,
          vaccineName: true,
          disease: true,
          notes: true,
        },
      },
    },
  })

  if (!template) {
    return {
      success: false as const,
      error: "Template vaccinal introuvable ou incompatible avec ce lot",
    }
  }

  return { success: true as const, data: template }
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
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = getBatchesSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, status, type, farmId, buildingId, cursor, limit } =
      parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult

    const { role, farmPermissions } = membershipResult.data

    // Résoudre les fermes accessibles pour ce rôle
    const accessibleFarmIds = getAccessibleFarmIds(role, farmPermissions, "canRead")

    // Aucune ferme accessible → résultat vide immédiat
    if (accessibleFarmIds !== null && accessibleFarmIds.length === 0) {
      return { success: true, data: [] }
    }

    const where = {
      organizationId,
      deletedAt: null,
      ...(status     ? { status }                      : {}),
      ...(type       ? { type }                        : {}),
      ...(buildingId ? { buildingId }                  : {}),
      ...(farmId     ? { building: { farmId } }        : {}),
      ...(accessibleFarmIds !== null
        ? { building: { farmId: { in: accessibleFarmIds } } }
        : {}),
      ...(cursor ? { id: { gt: cursor } } : {}),
    }

    let batches: BatchSummary[]
    try {
      batches = await prisma.batch.findMany({
        where,
        select:  batchSummarySelect,
        orderBy: { entryDate: "desc" },
        take:    limit,
      })
    } catch (error) {
      if (!isBatchReferenceSchemaUnavailable(error)) {
        throw error
      }

      const legacyBatches = await prisma.batch.findMany({
        where,
        select:  batchSummarySelectLegacy,
        orderBy: { entryDate: "desc" },
        take:    limit,
      })

      batches = legacyBatches.map((batch) => withLegacyPoultryStrain(batch))
    }

    return { success: true, data: batches }
  } catch (error) {
    console.error("[getBatches] unexpected error", error)

    if (error instanceof Error && error.message) {
      return {
        success: false,
        error: `Impossible de recuperer les lots. ${error.message}`,
      }
    }

    return { success: false, error: "Impossible de recuperer les lots" }
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
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = getBatchSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, batchId } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult

    const { role, farmPermissions } = membershipResult.data

    let batch: BatchDetail | null = null
    try {
      batch = await prisma.batch.findFirst({
        where:  { id: batchId, organizationId, deletedAt: null },
        select: batchDetailSelect,
      })
    } catch (error) {
      if (!isBatchReferenceSchemaUnavailable(error)) {
        throw error
      }

      const legacyBatch = await prisma.batch.findFirst({
        where:  { id: batchId, organizationId, deletedAt: null },
        select: batchDetailSelectLegacy,
      })

      batch = legacyBatch ? withLegacyPoultryStrain(legacyBatch) : null
    }

    if (!batch) {
      return { success: false, error: "Lot introuvable" }
    }

    if (!canAccessFarm(role, farmPermissions, batch.building.farmId, "canRead")) {
      return { success: false, error: "Accès refusé à ce lot" }
    }

    return { success: true, data: batch }
  } catch (error) {
    console.error("[getBatch] unexpected error", error)

    if (error instanceof Error && error.message) {
      return {
        success: false,
        error: `Impossible de recuperer le lot. ${error.message}`,
      }
    }

    return { success: false, error: "Impossible de recuperer le lot" }
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
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = createBatchSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const {
      organizationId,
      buildingId,
      poultryStrainId,
      vaccinationPlanTemplateId,
      ...batchData
    } = parsed.data
    const actorId = sessionResult.data.user.id

    await ensurePoultryReferenceData()

    const membershipResult = await requireMembership(actorId, organizationId)
    if (!membershipResult.success) return membershipResult

    const { role, farmPermissions } = membershipResult.data

    if (!canPerformAction(role, "CREATE_BATCH")) {
      return { success: false, error: "Permission refusée" }
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

    let strainValidation: Awaited<ReturnType<typeof validatePoultryStrainForBatch>>
    let templateValidation: Awaited<
      ReturnType<typeof validateVaccinationPlanTemplateForBatch>
    >
    try {
      ;[strainValidation, templateValidation] = await Promise.all([
        validatePoultryStrainForBatch({
          poultryStrainId: poultryStrainId ?? null,
          speciesId: batchData.speciesId,
          batchType: batchData.type,
        }),
        validateVaccinationPlanTemplateForBatch({
          vaccinationPlanTemplateId: vaccinationPlanTemplateId ?? null,
          batchType: batchData.type,
        }),
      ])
    } catch (error) {
      if (!isBatchReferenceSchemaUnavailable(error)) {
        throw error
      }

      return {
        success: false,
        error:
          "La base de donnees n'est pas encore migree pour les souches avicoles et les templates vaccinaux.",
      }
    }

    if (!strainValidation.success) {
      return { success: false, error: strainValidation.error }
    }

    if (!templateValidation.success) {
      return { success: false, error: templateValidation.error }
    }

    const selectedTemplate = templateValidation.data

    let batch: BatchDetail
    try {
      batch = await prisma.$transaction(async (tx) => {
        const number = await generateBatchNumber(tx, organizationId)
        const createdBatch = await tx.batch.create({
          data:   {
            organizationId,
            buildingId,
            number,
            poultryStrainId: poultryStrainId ?? null,
            ...batchData,
          },
          select: batchDetailSelect,
        })

        if (!selectedTemplate) {
          return createdBatch
        }

        const generatedPlan = await tx.vaccinationPlan.create({
          data: {
            organizationId,
            name: buildVaccinationPlanNameFromTemplate(
              selectedTemplate.name,
              number,
            ),
            batchType: batchData.type,
            items: {
              create: buildVaccinationPlanItemsFromTemplate(selectedTemplate.items),
            },
          },
          select: { id: true },
        })

        return tx.batch.update({
          where: { id: createdBatch.id },
          data: {
            notes: buildBatchNotesWithVaccinationPlan(
              { planId: generatedPlan.id },
              createdBatch.notes,
            ),
          },
          select: batchDetailSelect,
        })
      })
    } catch (error) {
      if (!isBatchReferenceSchemaUnavailable(error)) {
        throw error
      }

      if (poultryStrainId || vaccinationPlanTemplateId) {
        return {
          success: false,
          error:
            "La base de donnees n'est pas encore migree pour les souches avicoles et les templates vaccinaux.",
        }
      }

      const legacyBatch = await prisma.$transaction(async (tx) => {
        const number = await generateBatchNumber(tx, organizationId)
        return tx.batch.create({
          data: {
            organizationId,
            buildingId,
            number,
            ...batchData,
          },
          select: batchDetailSelectLegacy,
        })
      })

      batch = withLegacyPoultryStrain(legacyBatch)
    }

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.CREATE,
      resourceType:   "BATCH",
      resourceId:     batch.id,
      after:          {
        number: batch.number,
        buildingId,
        poultryStrainId: poultryStrainId ?? null,
        vaccinationPlanTemplateId: vaccinationPlanTemplateId ?? null,
        ...batchData,
      },
    })

    return { success: true, data: batch }
  } catch (error) {
    console.error("[createBatch] unexpected error", error)

    if (error instanceof Error && error.message) {
      return {
        success: false,
        error: `Impossible de creer le lot. ${error.message}`,
      }
    }

    return { success: false, error: "Impossible de creer le lot" }
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
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = updateBatchSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, batchId, ...updates } = parsed.data
    const actorId = sessionResult.data.user.id

    const membershipResult = await requireMembership(actorId, organizationId)
    if (!membershipResult.success) return membershipResult

    const { role, farmPermissions } = membershipResult.data

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

    if (updates.poultryStrainId !== undefined) {
      let strainValidation: Awaited<ReturnType<typeof validatePoultryStrainForBatch>>
      try {
        strainValidation = await validatePoultryStrainForBatch({
          poultryStrainId: updates.poultryStrainId,
          speciesId: existing.speciesId,
          batchType: existing.type,
        })
      } catch (error) {
        if (!isBatchReferenceSchemaUnavailable(error)) {
          throw error
        }

        return {
          success: false,
          error:
            "La base de donnees n'est pas encore migree pour enregistrer une souche avicole sur les lots.",
        }
      }

      if (!strainValidation.success) {
        return { success: false, error: strainValidation.error }
      }
    }

    let batch: BatchDetail
    try {
      batch = await prisma.batch.update({
        where:  { id: batchId },
        data:   updates,
        select: batchDetailSelect,
      })
    } catch (error) {
      if (!isBatchReferenceSchemaUnavailable(error)) {
        throw error
      }

      if (updates.poultryStrainId !== undefined) {
        return {
          success: false,
          error:
            "La base de donnees n'est pas encore migree pour enregistrer une souche avicole sur les lots.",
        }
      }

      const legacyBatch = await prisma.batch.update({
        where: { id: batchId },
        data: {
          breedId: updates.breedId,
          supplierId: updates.supplierId,
          entryWeightG: updates.entryWeightG,
          unitCostFcfa: updates.unitCostFcfa,
          totalCostFcfa: updates.totalCostFcfa,
          notes: updates.notes,
        },
        select: batchDetailSelectLegacy,
      })

      batch = withLegacyPoultryStrain(legacyBatch)
    }

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
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = closeBatchSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, batchId, closeStatus, closeReason, closedAt } =
      parsed.data
    const actorId = sessionResult.data.user.id

    const membershipResult = await requireMembership(actorId, organizationId)
    if (!membershipResult.success) return membershipResult

    const { role, farmPermissions } = membershipResult.data

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

    let batch: BatchDetail
    try {
      batch = await prisma.batch.update({
        where: { id: batchId },
        data:  {
          status:      closeStatus,
          closedAt:    closedAt ?? new Date(),
          closeReason: closeReason ?? null,
        },
        select: batchDetailSelect,
      })
    } catch (error) {
      if (!isBatchReferenceSchemaUnavailable(error)) {
        throw error
      }

      const legacyBatch = await prisma.batch.update({
        where: { id: batchId },
        data:  {
          status:      closeStatus,
          closedAt:    closedAt ?? new Date(),
          closeReason: closeReason ?? null,
        },
        select: batchDetailSelectLegacy,
      })

      batch = withLegacyPoultryStrain(legacyBatch)
    }

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
  const sessionResult = await requireSession()
  if (!sessionResult.success) return sessionResult

  const parsed = deleteBatchSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: "Données invalides" }
  }

  const { organizationId, batchId } = parsed.data
  const actorId = sessionResult.data.user.id

  const membershipResult = await requireMembership(actorId, organizationId)
  if (!membershipResult.success) return membershipResult

  const { role, farmPermissions } = membershipResult.data

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
