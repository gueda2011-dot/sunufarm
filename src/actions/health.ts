/**
 * SunuFarm — Server Actions : module santé animale
 *
 * Périmètre MVP :
 *   1. Plans vaccinaux (VaccinationPlan + VaccinationPlanItem) — templates réutilisables
 *   2. Vaccinations réalisées (VaccinationRecord) — événements sur un lot
 *   3. Traitements médicamenteux (TreatmentRecord) — traitements sur un lot
 *
 * Incidents sanitaires :
 *   Aucun modèle HealthIncident n'existe dans le schéma.
 *   Pour le MVP, les incidents sont documentés via le champ `indication`
 *   d'un TreatmentRecord ou `notes` d'un VaccinationRecord. Modèle dédié prévu en V2.
 *
 * Ajustement 1 — Permissions de lecture des plans vaccinaux :
 *   Les VaccinationPlan sont des templates organisationnels, pas des données ferme.
 *   Leur lecture ne dépend pas d'un accès ferme spécifique.
 *   requireMembership suffit : tout membre actif de l'organisation peut consulter
 *   les plans vaccinaux pour les appliquer à ses lots.
 *
 * Ajustement 2 — Garde sur countVaccinated / countTreated :
 *   MVP : vérification que countVaccinated|countTreated <= batch.entryCount (effectif initial).
 *   Limite documentée : le calcul de l'effectif vivant réel (entryCount - SUM mortalities)
 *   nécessiterait une agrégation coûteuse non mise en place au MVP. entryCount est utilisé
 *   comme borne supérieure. Une valeur supérieure à entryCount est toujours absurde.
 *
 * Ajustement 3 — batchAgeDay et date antérieure à l'entrée du lot :
 *   Si la date de l'événement (vaccination ou traitement) est antérieure à batch.entryDate,
 *   la création est refusée avec une erreur explicite. Il n'y a pas de clamp à 0 —
 *   une vaccination avant l'entrée du lot n'a pas de sens métier.
 *
 * Ajustement 4 — Pas de suppression (historique médical conservé) :
 *   Aucune fonction deleteVaccination ni deleteTreatment n'est exposée.
 *   L'historique médical d'un lot est immuable et ne peut qu'être corrigé via update.
 *   Raison : contrairement aux mouvements de stock, les enregistrements santé sont des
 *   événements unitaires sans effet de cumul — update est suffisant pour corriger une erreur.
 *
 * Permissions :
 *   Plans vaccinaux (lecture)  → requireMembership uniquement (templates organisationnels)
 *   Plans vaccinaux (écriture) → MANAGE_FARMS
 *   Vaccinations / Traitements (lecture)  → canAccessFarm(farmId, "canRead")
 *   Vaccinations / Traitements (écriture) → CREATE_VACCINATION / CREATE_TREATMENT
 *                                           + canAccessFarm(farmId, "canWrite")
 *
 * Chaîne d'appartenance :
 *   Organization → Building → Batch → VaccinationRecord / TreatmentRecord
 *   La farmId est obtenue via batch.building.farmId — utilisée pour canAccessFarm.
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
  hasMinimumRole,
  parseFarmPermissions,
} from "@/src/lib/permissions"
import {
  requiredIdSchema,
  optionalIdSchema,
  positiveIntSchema,
  optionalDateSchema,
  dateSchema,
} from "@/src/lib/validators"
import {
  BatchStatus,
  BatchType,
  UserRole,
} from "@/src/generated/prisma/client"

// ---------------------------------------------------------------------------
// Schémas Zod — Plans vaccinaux
// ---------------------------------------------------------------------------

/**
 * Item d'un plan vaccinal : une étape à un âge donné.
 * Partagé entre createVaccinationPlanSchema et updateVaccinationPlanSchema.
 */
const vaccinationPlanItemSchema = z.object({
  dayOfAge:    positiveIntSchema,
  vaccineName: z.string().min(1).max(150),
  route:       z.string().max(50).optional(),
  dose:        z.string().max(100).optional(),
  notes:       z.string().max(1000).optional(),
})

const getVaccinationPlansSchema = z.object({
  organizationId: requiredIdSchema,
  batchType:      z.nativeEnum(BatchType).optional(),
  limit:          z.number().int().min(1).max(100).default(50),
})

const createVaccinationPlanSchema = z.object({
  organizationId: requiredIdSchema,
  name:           z.string().min(1).max(150),
  batchType:      z.nativeEnum(BatchType),
  /** Au moins une étape vaccinale requise */
  items:          z.array(vaccinationPlanItemSchema).min(1),
})

const updateVaccinationPlanSchema = z.object({
  organizationId: requiredIdSchema,
  planId:         requiredIdSchema,
  name:           z.string().min(1).max(150).optional(),
  /**
   * false = archivage du plan sans suppression.
   * Les lots ayant suivi ce plan conservent leur historique.
   */
  isActive:       z.boolean().optional(),
  /**
   * Si fourni, remplacement complet des items (deleteMany + createMany).
   * undefined = items existants conservés.
   */
  items:          z.array(vaccinationPlanItemSchema).min(1).optional(),
})

// ---------------------------------------------------------------------------
// Schémas Zod — Vaccinations réalisées
// ---------------------------------------------------------------------------

const getVaccinationsSchema = z.object({
  organizationId: requiredIdSchema,
  batchId:        optionalIdSchema,
  fromDate:       optionalDateSchema,
  toDate:         optionalDateSchema,
  cursorDate:     z.coerce.date().optional(),
  limit:          z.number().int().min(1).max(100).default(20),
})

const getVaccinationSchema = z.object({
  organizationId: requiredIdSchema,
  vaccinationId:  requiredIdSchema,
})

const createVaccinationSchema = z.object({
  organizationId:  requiredIdSchema,
  batchId:         requiredIdSchema,
  date:            dateSchema,
  // batchAgeDay : calculé côté serveur depuis batch.entryDate et batch.entryAgeDay
  vaccineName:     z.string().min(1).max(150),
  route:           z.string().max(50).optional(),
  dose:            z.string().max(100).optional(),
  /**
   * Nombre de sujets vaccinés.
   * Garde MVP : doit être <= batch.entryCount (effectif initial).
   * Limite documentée : l'effectif vivant réel n'est pas calculé au MVP.
   */
  countVaccinated: positiveIntSchema,
  medicineStockId: optionalIdSchema,
  notes:           z.string().max(1000).optional(),
})

const updateVaccinationSchema = z.object({
  organizationId:  requiredIdSchema,
  vaccinationId:   requiredIdSchema,
  // batchId et date sont immuables — ils définissent l'événement
  vaccineName:     z.string().min(1).max(150).optional(),
  route:           z.string().max(50).optional(),
  dose:            z.string().max(100).optional(),
  countVaccinated: positiveIntSchema.optional(),
  medicineStockId: z.string().cuid().nullable().optional(),
  notes:           z.string().max(1000).optional(),
})

// ---------------------------------------------------------------------------
// Schémas Zod — Traitements
// ---------------------------------------------------------------------------

const getTreatmentsSchema = z.object({
  organizationId: requiredIdSchema,
  batchId:        optionalIdSchema,
  fromDate:       optionalDateSchema,
  toDate:         optionalDateSchema,
  cursorDate:     z.coerce.date().optional(),
  limit:          z.number().int().min(1).max(100).default(20),
})

const getTreatmentSchema = z.object({
  organizationId: requiredIdSchema,
  treatmentId:    requiredIdSchema,
})

const createTreatmentSchema = z
  .object({
    organizationId:  requiredIdSchema,
    batchId:         requiredIdSchema,
    startDate:       dateSchema,
    endDate:         optionalDateSchema,
    medicineName:    z.string().min(1).max(150),
    dose:            z.string().max(100).optional(),
    durationDays:    positiveIntSchema.optional(),
    /**
     * Nombre de sujets traités.
     * null (champ absent) = traitement appliqué à l'intégralité du lot.
     * Garde MVP : si fourni, doit être <= batch.entryCount.
     */
    countTreated:    positiveIntSchema.optional(),
    medicineStockId: optionalIdSchema,
    indication:      z.string().max(255).optional(),
    notes:           z.string().max(1000).optional(),
  })
  .refine(
    (d) => !d.endDate || d.endDate >= d.startDate,
    {
      message: "La date de fin doit être postérieure ou égale à la date de début",
      path:    ["endDate"],
    },
  )

const updateTreatmentSchema = z.object({
  organizationId:  requiredIdSchema,
  treatmentId:     requiredIdSchema,
  // batchId et startDate sont immuables
  /**
   * Fermeture du traitement : renseigner endDate quand le traitement se termine.
   * Cohérence endDate >= startDate vérifiée côté serveur après chargement du record.
   */
  endDate:         z.coerce.date().nullable().optional(),
  dose:            z.string().max(100).optional(),
  durationDays:    positiveIntSchema.optional(),
  countTreated:    positiveIntSchema.optional(),
  medicineStockId: z.string().cuid().nullable().optional(),
  indication:      z.string().max(255).optional(),
  notes:           z.string().max(1000).optional(),
})

// ---------------------------------------------------------------------------
// Types retournés
// ---------------------------------------------------------------------------

export interface VaccinationPlanItemSummary {
  id:                string
  vaccinationPlanId: string
  dayOfAge:          number
  vaccineName:       string
  route:             string | null
  dose:              string | null
  notes:             string | null
}

export interface VaccinationPlanSummary {
  id:             string
  organizationId: string
  name:           string
  batchType:      BatchType
  isActive:       boolean
  createdAt:      Date
  updatedAt:      Date
  items:          VaccinationPlanItemSummary[]
}

export interface VaccinationSummary {
  id:              string
  organizationId:  string
  batchId:         string
  date:            Date
  batchAgeDay:     number
  vaccineName:     string
  route:           string | null
  dose:            string | null
  countVaccinated: number
  medicineStockId: string | null
  notes:           string | null
  recordedById:    string | null
  createdAt:       Date
  updatedAt:       Date
}

export interface TreatmentSummary {
  id:              string
  organizationId:  string
  batchId:         string
  startDate:       Date
  endDate:         Date | null
  medicineName:    string
  dose:            string | null
  durationDays:    number | null
  countTreated:    number | null
  medicineStockId: string | null
  indication:      string | null
  notes:           string | null
  recordedById:    string | null
  createdAt:       Date
  updatedAt:       Date
}

// ---------------------------------------------------------------------------
// Sélections Prisma partagées
// ---------------------------------------------------------------------------

const vaccinationPlanItemSelect = {
  id:                true,
  vaccinationPlanId: true,
  dayOfAge:          true,
  vaccineName:       true,
  route:             true,
  dose:              true,
  notes:             true,
} as const

const vaccinationPlanSelect = {
  id:             true,
  organizationId: true,
  name:           true,
  batchType:      true,
  isActive:       true,
  createdAt:      true,
  updatedAt:      true,
  items: {
    select:  vaccinationPlanItemSelect,
    orderBy: { dayOfAge: "asc" as const },
  },
} as const

const vaccinationSelect = {
  id:              true,
  organizationId:  true,
  batchId:         true,
  date:            true,
  batchAgeDay:     true,
  vaccineName:     true,
  route:           true,
  dose:            true,
  countVaccinated: true,
  medicineStockId: true,
  notes:           true,
  recordedById:    true,
  createdAt:       true,
  updatedAt:       true,
} as const

const treatmentSelect = {
  id:              true,
  organizationId:  true,
  batchId:         true,
  startDate:       true,
  endDate:         true,
  medicineName:    true,
  dose:            true,
  durationDays:    true,
  countTreated:    true,
  medicineStockId: true,
  indication:      true,
  notes:           true,
  recordedById:    true,
  createdAt:       true,
  updatedAt:       true,
} as const

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

/**
 * Différence en jours entiers (date-only, heure ignorée).
 * Positif si laterDate > earlierDate.
 */
function dateDiffInDays(laterDate: Date, earlierDate: Date): number {
  const later   = Date.UTC(laterDate.getFullYear(),   laterDate.getMonth(),   laterDate.getDate())
  const earlier = Date.UTC(earlierDate.getFullYear(), earlierDate.getMonth(), earlierDate.getDate())
  return Math.round((later - earlier) / (1000 * 60 * 60 * 24))
}

/**
 * Calcule l'âge du lot en jours à la date d'un événement santé.
 *
 * Retourne l'âge calculé (>= 0), ou une erreur si la date est antérieure
 * à la date d'entrée du lot.
 *
 * Refus explicite (pas de clamp) : une vaccination ou un traitement avant
 * l'entrée du lot n'a pas de sens métier. La correction s'effectue via update.
 */
function computeBatchAgeDay(
  eventDate: Date,
  batch:     { entryDate: Date; entryAgeDay: number },
): { ageDay: number } | { error: string } {
  const diff = dateDiffInDays(eventDate, batch.entryDate)
  if (diff < 0) {
    return {
      error:
        "La date de l'événement est antérieure à la date d'entrée du lot — " +
        "vérifiez la date saisie",
    }
  }
  return { ageDay: batch.entryAgeDay + diff }
}

/**
 * Charge un lot pour les opérations santé.
 * Retourne le statut, les données nécessaires au calcul de batchAgeDay,
 * l'effectif initial et la farmId via building.
 */
async function findBatchForHealth(batchId: string, organizationId: string) {
  return prisma.batch.findFirst({
    where: { id: batchId, organizationId, deletedAt: null },
    select: {
      id:           true,
      status:       true,
      entryDate:    true,
      entryAgeDay:  true,
      entryCount:   true,
      building: { select: { farmId: true } },
    },
  })
}

/**
 * Résout le scope fermes accessible pour les lectures santé sans batchId.
 *
 * - MANAGE_FARMS (SUPER_ADMIN, OWNER, MANAGER) → "all" : vue org complète
 * - Autres rôles (VET, TECHNICIAN…) → fermes où canRead est explicite
 *
 * NB : VIEW_FINANCES n'est pas utilisé ici car il exclut les rôles VET/TECHNICIAN
 * qui ont pourtant besoin d'accéder à l'historique santé de leurs fermes.
 */
function resolveHealthFarmReadScope(
  role:            UserRole,
  farmPermissions: unknown,
): "all" | string[] {
  if (canPerformAction(role, "MANAGE_FARMS")) return "all"
  const perms = parseFarmPermissions(farmPermissions)
  return perms.filter((p) => p.canRead).map((p) => p.farmId)
}

// ---------------------------------------------------------------------------
// 1. getVaccinationPlans
// ---------------------------------------------------------------------------

/**
 * Retourne les plans vaccinaux d'une organisation.
 *
 * Permissions — templates organisationnels (Ajustement 1) :
 *   Les plans vaccinaux sont des ressources partagées au niveau de l'organisation.
 *   Leur lecture ne dépend pas d'un accès ferme spécifique : tout membre actif
 *   peut consulter les plans pour les appliquer à ses lots.
 *   requireMembership suffit — aucun canAccessFarm n'est requis ici.
 *
 * isActive:true par défaut — les plans archivés sont filtrés côté serveur.
 */
export async function getVaccinationPlans(
  data: unknown,
): Promise<ActionResult<VaccinationPlanSummary[]>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = getVaccinationPlansSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, batchType, limit } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult

    const plans = await prisma.vaccinationPlan.findMany({
      where: {
        organizationId,
        isActive: true,
        ...(batchType ? { batchType } : {}),
      },
      select:  vaccinationPlanSelect,
      orderBy: { name: "asc" },
      take:    limit,
    })

    return { success: true, data: plans }
  } catch {
    return { success: false, error: "Impossible de récupérer les plans vaccinaux" }
  }
}

// ---------------------------------------------------------------------------
// 2. createVaccinationPlan
// ---------------------------------------------------------------------------

/**
 * Crée un plan vaccinal avec ses étapes.
 * Les items sont créés en même temps que le plan (nested create Prisma).
 * Requiert MANAGE_FARMS.
 */
export async function createVaccinationPlan(
  data: unknown,
): Promise<ActionResult<VaccinationPlanSummary>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = createVaccinationPlanSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, name, batchType, items } = parsed.data
    const actorId = sessionResult.data.user.id

    const membershipResult = await requireMembership(actorId, organizationId)
    if (!membershipResult.success) return membershipResult

    if (!canPerformAction(membershipResult.data.role, "MANAGE_FARMS")) {
      return { success: false, error: "Permission refusée" }
    }

    const plan = await prisma.vaccinationPlan.create({
      data: {
        organizationId,
        name,
        batchType,
        items: { create: items },
      },
      select: vaccinationPlanSelect,
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.CREATE,
      resourceType:   "VACCINATION_PLAN",
      resourceId:     plan.id,
      after:          { name, batchType, itemCount: items.length },
    })

    return { success: true, data: plan }
  } catch {
    return { success: false, error: "Impossible de créer le plan vaccinal" }
  }
}

// ---------------------------------------------------------------------------
// 3. updateVaccinationPlan
// ---------------------------------------------------------------------------

/**
 * Met à jour un plan vaccinal.
 * isActive: false = archivage (pas de suppression — l'historique est préservé).
 * Si items fourni : remplacement complet atomique (deleteMany + createMany).
 * Requiert MANAGE_FARMS.
 */
export async function updateVaccinationPlan(
  data: unknown,
): Promise<ActionResult<VaccinationPlanSummary>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = updateVaccinationPlanSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, planId, items, ...planUpdates } = parsed.data
    const actorId = sessionResult.data.user.id

    const membershipResult = await requireMembership(actorId, organizationId)
    if (!membershipResult.success) return membershipResult

    if (!canPerformAction(membershipResult.data.role, "MANAGE_FARMS")) {
      return { success: false, error: "Permission refusée" }
    }

    const existing = await prisma.vaccinationPlan.findFirst({
      where:  { id: planId, organizationId },
      select: { id: true },
    })
    if (!existing) {
      return { success: false, error: "Plan vaccinal introuvable" }
    }

    let plan: VaccinationPlanSummary

    if (items !== undefined) {
      // Remplacement complet des items en transaction
      plan = await prisma.$transaction(async (tx) => {
        await tx.vaccinationPlanItem.deleteMany({ where: { vaccinationPlanId: planId } })
        await tx.vaccinationPlanItem.createMany({
          data: items.map((item) => ({ vaccinationPlanId: planId, ...item })),
        })
        return tx.vaccinationPlan.update({
          where:  { id: planId },
          data:   planUpdates,
          select: vaccinationPlanSelect,
        })
      })
    } else {
      plan = await prisma.vaccinationPlan.update({
        where:  { id: planId },
        data:   planUpdates,
        select: vaccinationPlanSelect,
      })
    }

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.UPDATE,
      resourceType:   "VACCINATION_PLAN",
      resourceId:     planId,
      before:         existing,
      after:          { ...planUpdates, ...(items ? { itemCount: items.length } : {}) },
    })

    return { success: true, data: plan }
  } catch {
    return { success: false, error: "Impossible de mettre à jour le plan vaccinal" }
  }
}

// ---------------------------------------------------------------------------
// 4. getVaccinations
// ---------------------------------------------------------------------------

/**
 * Retourne les vaccinations d'une organisation ou d'un lot.
 * Pagination cursor-based sur date desc.
 *
 * Si batchId fourni → historique vaccinal du lot (accès vérifié via farmId).
 * Si absent → toutes les vaccinations accessibles selon les permissions de ferme.
 */
export async function getVaccinations(
  data: unknown,
): Promise<ActionResult<VaccinationSummary[]>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = getVaccinationsSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const {
      organizationId,
      batchId,
      fromDate,
      toDate,
      cursorDate,
      limit,
    } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult

    const { role, farmPermissions } = membershipResult.data

    // Construire le filtre ferme
    let farmFilter: object = {}

    if (batchId) {
      const batch = await findBatchForHealth(batchId, organizationId)
      if (!batch) {
        return { success: false, error: "Lot introuvable" }
      }
      if (!canAccessFarm(role, farmPermissions, batch.building.farmId, "canRead")) {
        return { success: false, error: "Accès refusé à cette ferme" }
      }
      farmFilter = { batchId }
    } else {
      const scope = resolveHealthFarmReadScope(role, farmPermissions)
      if (scope !== "all") {
        if (scope.length === 0) return { success: true, data: [] }
        farmFilter = { batch: { building: { farmId: { in: scope } } } }
      }
    }

    const vaccinations = await prisma.vaccinationRecord.findMany({
      where: {
        organizationId,
        ...farmFilter,
        ...(fromDate || toDate
          ? {
              date: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate   ? { lte: toDate }   : {}),
              },
            }
          : {}),
        ...(cursorDate ? { date: { lt: cursorDate } } : {}),
      },
      select:  vaccinationSelect,
      orderBy: { date: "desc" },
      take:    limit,
    })

    return { success: true, data: vaccinations }
  } catch {
    return { success: false, error: "Impossible de récupérer les vaccinations" }
  }
}

// ---------------------------------------------------------------------------
// 5. getVaccination
// ---------------------------------------------------------------------------

/**
 * Retourne le détail d'une vaccination.
 * Vérifie l'accès via la ferme du lot.
 */
export async function getVaccination(
  data: unknown,
): Promise<ActionResult<VaccinationSummary>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = getVaccinationSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, vaccinationId } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult

    const { role, farmPermissions } = membershipResult.data

    const vaccination = await prisma.vaccinationRecord.findFirst({
      where:  { id: vaccinationId, organizationId },
      select: {
        ...vaccinationSelect,
        batch: { select: { building: { select: { farmId: true } } } },
      },
    })

    if (!vaccination) {
      return { success: false, error: "Vaccination introuvable" }
    }

    if (!canAccessFarm(role, farmPermissions, vaccination.batch.building.farmId, "canRead")) {
      return { success: false, error: "Accès refusé à cette ferme" }
    }

    // Extraire batch du résultat avant de retourner (non inclus dans VaccinationSummary)
    const { batch, ...vaccinationData } = vaccination
    void batch
    return { success: true, data: vaccinationData }
  } catch {
    return { success: false, error: "Impossible de récupérer la vaccination" }
  }
}

// ---------------------------------------------------------------------------
// 6. createVaccination
// ---------------------------------------------------------------------------

/**
 * Enregistre une vaccination effectivement réalisée sur un lot.
 *
 * batchAgeDay calculé côté serveur :
 *   entryAgeDay + (date - entryDate) en jours.
 *   Refus explicite si la date est antérieure à entryDate (Ajustement 3).
 *
 * Garde countVaccinated (Ajustement 2) :
 *   MVP : countVaccinated <= batch.entryCount.
 *   Limite : l'effectif vivant réel (entryCount - SUM mortalities) n'est pas
 *   calculé pour éviter une agrégation coûteuse. Toute valeur > entryCount est absurde.
 *
 * Historique médical (Ajustement 4) :
 *   Aucune suppression possible — correction via updateVaccination uniquement.
 *
 * Requiert CREATE_VACCINATION + canAccessFarm(farmId, "canWrite").
 */
export async function createVaccination(
  data: unknown,
): Promise<ActionResult<VaccinationSummary>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = createVaccinationSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const {
      organizationId,
      batchId,
      date,
      vaccineName,
      route,
      dose,
      countVaccinated,
      medicineStockId,
      notes,
    } = parsed.data
    const actorId = sessionResult.data.user.id

    const membershipResult = await requireMembership(actorId, organizationId)
    if (!membershipResult.success) return membershipResult

    const { role, farmPermissions } = membershipResult.data

    if (!canPerformAction(role, "CREATE_VACCINATION")) {
      return { success: false, error: "Permission refusée" }
    }

    // Valider le lot et obtenir les données nécessaires
    const batch = await findBatchForHealth(batchId, organizationId)
    if (!batch) {
      return { success: false, error: "Lot introuvable" }
    }

    if (!canAccessFarm(role, farmPermissions, batch.building.farmId, "canWrite")) {
      return { success: false, error: "Accès en écriture refusé sur cette ferme" }
    }

    // Vérifier le statut du lot (ACTIVE requis, sauf MANAGER+)
    if (
      batch.status !== BatchStatus.ACTIVE &&
      !hasMinimumRole(role, UserRole.MANAGER)
    ) {
      return {
        success: false,
        error:   `Impossible d'enregistrer une vaccination sur un lot ${batch.status.toLowerCase()}`,
      }
    }

    // Calculer batchAgeDay — refus si date antérieure à l'entrée (Ajustement 3)
    const ageResult = computeBatchAgeDay(date, batch)
    if ("error" in ageResult) {
      return { success: false, error: ageResult.error }
    }

    // Garde countVaccinated (Ajustement 2)
    if (countVaccinated > batch.entryCount) {
      return {
        success: false,
        error:
          `Le nombre de sujets vaccinés (${countVaccinated}) dépasse l'effectif ` +
          `initial du lot (${batch.entryCount})`,
      }
    }

    // Valider le stock médicament si fourni
    if (medicineStockId) {
      const medStock = await prisma.medicineStock.findFirst({
        where:  { id: medicineStockId, organizationId },
        select: { id: true },
      })
      if (!medStock) {
        return { success: false, error: "Stock de médicament introuvable" }
      }
    }

    const vaccination = await prisma.vaccinationRecord.create({
      data: {
        organizationId,
        batchId,
        date,
        batchAgeDay:     ageResult.ageDay,
        vaccineName,
        route:           route ?? null,
        dose:            dose ?? null,
        countVaccinated,
        medicineStockId: medicineStockId ?? null,
        notes:           notes ?? null,
        recordedById:    actorId,
      },
      select: vaccinationSelect,
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.CREATE,
      resourceType:   "VACCINATION_RECORD",
      resourceId:     vaccination.id,
      after:          { batchId, date, vaccineName, countVaccinated, batchAgeDay: ageResult.ageDay },
    })

    return { success: true, data: vaccination }
  } catch {
    return { success: false, error: "Impossible d'enregistrer la vaccination" }
  }
}

// ---------------------------------------------------------------------------
// 7. updateVaccination
// ---------------------------------------------------------------------------

/**
 * Corrige un enregistrement de vaccination existant.
 *
 * Champs immuables : batchId, date — ils définissent l'événement.
 * Champs modifiables : vaccineName, route, dose, countVaccinated, medicineStockId, notes.
 *
 * Garde countVaccinated si fourni (Ajustement 2) :
 *   countVaccinated <= batch.entryCount, vérifié en chargeant le lot.
 *
 * Historique médical (Ajustement 4) :
 *   Aucune suppression n'est exposée. Ce update est le seul vecteur de correction.
 *   L'audit log préserve la traçabilité avant/après.
 *
 * Requiert CREATE_VACCINATION + canAccessFarm(farmId, "canWrite").
 */
export async function updateVaccination(
  data: unknown,
): Promise<ActionResult<VaccinationSummary>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = updateVaccinationSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, vaccinationId, countVaccinated, ...updates } = parsed.data
    const actorId = sessionResult.data.user.id

    const membershipResult = await requireMembership(actorId, organizationId)
    if (!membershipResult.success) return membershipResult

    const { role, farmPermissions } = membershipResult.data

    if (!canPerformAction(role, "CREATE_VACCINATION")) {
      return { success: false, error: "Permission refusée" }
    }

    // Charger la vaccination avec les infos nécessaires aux gardes
    const existing = await prisma.vaccinationRecord.findFirst({
      where:  { id: vaccinationId, organizationId },
      select: {
        ...vaccinationSelect,
        batch: {
          select: {
            entryCount:  true,
            building:    { select: { farmId: true } },
          },
        },
      },
    })
    if (!existing) {
      return { success: false, error: "Vaccination introuvable" }
    }

    if (!canAccessFarm(role, farmPermissions, existing.batch.building.farmId, "canWrite")) {
      return { success: false, error: "Accès en écriture refusé sur cette ferme" }
    }

    // Garde countVaccinated si fourni (Ajustement 2)
    if (countVaccinated !== undefined && countVaccinated > existing.batch.entryCount) {
      return {
        success: false,
        error:
          `Le nombre de sujets vaccinés (${countVaccinated}) dépasse l'effectif ` +
          `initial du lot (${existing.batch.entryCount})`,
      }
    }

    // Valider le nouveau stock médicament si fourni
    if (updates.medicineStockId) {
      const medStock = await prisma.medicineStock.findFirst({
        where:  { id: updates.medicineStockId, organizationId },
        select: { id: true },
      })
      if (!medStock) {
        return { success: false, error: "Stock de médicament introuvable" }
      }
    }

    const { batch, ...existingData } = existing
    void batch

    const vaccination = await prisma.vaccinationRecord.update({
      where:  { id: vaccinationId },
      data:   { ...updates, ...(countVaccinated !== undefined ? { countVaccinated } : {}) },
      select: vaccinationSelect,
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.UPDATE,
      resourceType:   "VACCINATION_RECORD",
      resourceId:     vaccinationId,
      before:         existingData,
      after:          { ...updates, ...(countVaccinated !== undefined ? { countVaccinated } : {}) },
    })

    return { success: true, data: vaccination }
  } catch {
    return { success: false, error: "Impossible de mettre à jour la vaccination" }
  }
}

// ---------------------------------------------------------------------------
// 8. getTreatments
// ---------------------------------------------------------------------------

/**
 * Retourne les traitements d'une organisation ou d'un lot.
 * Pagination cursor-based sur startDate desc.
 */
export async function getTreatments(
  data: unknown,
): Promise<ActionResult<TreatmentSummary[]>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = getTreatmentsSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const {
      organizationId,
      batchId,
      fromDate,
      toDate,
      cursorDate,
      limit,
    } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult

    const { role, farmPermissions } = membershipResult.data

    let farmFilter: object = {}

    if (batchId) {
      const batch = await findBatchForHealth(batchId, organizationId)
      if (!batch) {
        return { success: false, error: "Lot introuvable" }
      }
      if (!canAccessFarm(role, farmPermissions, batch.building.farmId, "canRead")) {
        return { success: false, error: "Accès refusé à cette ferme" }
      }
      farmFilter = { batchId }
    } else {
      const scope = resolveHealthFarmReadScope(role, farmPermissions)
      if (scope !== "all") {
        if (scope.length === 0) return { success: true, data: [] }
        farmFilter = { batch: { building: { farmId: { in: scope } } } }
      }
    }

    const treatments = await prisma.treatmentRecord.findMany({
      where: {
        organizationId,
        ...farmFilter,
        ...(fromDate || toDate
          ? {
              startDate: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate   ? { lte: toDate }   : {}),
              },
            }
          : {}),
        ...(cursorDate ? { startDate: { lt: cursorDate } } : {}),
      },
      select:  treatmentSelect,
      orderBy: { startDate: "desc" },
      take:    limit,
    })

    return { success: true, data: treatments }
  } catch {
    return { success: false, error: "Impossible de récupérer les traitements" }
  }
}

// ---------------------------------------------------------------------------
// 9. getTreatment
// ---------------------------------------------------------------------------

/**
 * Retourne le détail d'un traitement.
 * Vérifie l'accès via la ferme du lot.
 */
export async function getTreatment(
  data: unknown,
): Promise<ActionResult<TreatmentSummary>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = getTreatmentSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, treatmentId } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult

    const { role, farmPermissions } = membershipResult.data

    const treatment = await prisma.treatmentRecord.findFirst({
      where:  { id: treatmentId, organizationId },
      select: {
        ...treatmentSelect,
        batch: { select: { building: { select: { farmId: true } } } },
      },
    })

    if (!treatment) {
      return { success: false, error: "Traitement introuvable" }
    }

    if (!canAccessFarm(role, farmPermissions, treatment.batch.building.farmId, "canRead")) {
      return { success: false, error: "Accès refusé à cette ferme" }
    }

    const { batch, ...treatmentData } = treatment
    void batch
    return { success: true, data: treatmentData }
  } catch {
    return { success: false, error: "Impossible de récupérer le traitement" }
  }
}

// ---------------------------------------------------------------------------
// 10. createTreatment
// ---------------------------------------------------------------------------

/**
 * Enregistre un traitement médicamenteux sur un lot.
 *
 * countTreated optionnel :
 *   null/absent = traitement appliqué à l'intégralité du lot.
 *   Si fourni : garde MVP countTreated <= batch.entryCount (Ajustement 2).
 *
 * endDate optionnel à la création :
 *   Un traitement peut être créé sans endDate (traitement en cours) et fermé
 *   ultérieurement via updateTreatment({ endDate }).
 *   Si fourni : endDate >= startDate (vérifié par Zod refine).
 *
 * Statut du lot :
 *   ACTIVE requis, sauf MANAGER+ qui peut documenter des traitements historiques.
 *
 * Historique médical (Ajustement 4) :
 *   Aucune suppression n'est exposée. Correction via updateTreatment uniquement.
 *
 * Requiert CREATE_TREATMENT + canAccessFarm(farmId, "canWrite").
 */
export async function createTreatment(
  data: unknown,
): Promise<ActionResult<TreatmentSummary>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = createTreatmentSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const {
      organizationId,
      batchId,
      startDate,
      endDate,
      medicineName,
      dose,
      durationDays,
      countTreated,
      medicineStockId,
      indication,
      notes,
    } = parsed.data
    const actorId = sessionResult.data.user.id

    const membershipResult = await requireMembership(actorId, organizationId)
    if (!membershipResult.success) return membershipResult

    const { role, farmPermissions } = membershipResult.data

    if (!canPerformAction(role, "CREATE_TREATMENT")) {
      return { success: false, error: "Permission refusée" }
    }

    const batch = await findBatchForHealth(batchId, organizationId)
    if (!batch) {
      return { success: false, error: "Lot introuvable" }
    }

    if (!canAccessFarm(role, farmPermissions, batch.building.farmId, "canWrite")) {
      return { success: false, error: "Accès en écriture refusé sur cette ferme" }
    }

    if (
      batch.status !== BatchStatus.ACTIVE &&
      !hasMinimumRole(role, UserRole.MANAGER)
    ) {
      return {
        success: false,
        error:   `Impossible d'enregistrer un traitement sur un lot ${batch.status.toLowerCase()}`,
      }
    }

    // Vérifier que startDate n'est pas antérieure à l'entrée du lot
    const ageResult = computeBatchAgeDay(startDate, batch)
    if ("error" in ageResult) {
      return { success: false, error: ageResult.error }
    }

    // Garde countTreated (Ajustement 2)
    if (countTreated !== undefined && countTreated > batch.entryCount) {
      return {
        success: false,
        error:
          `Le nombre de sujets traités (${countTreated}) dépasse l'effectif ` +
          `initial du lot (${batch.entryCount})`,
      }
    }

    if (medicineStockId) {
      const medStock = await prisma.medicineStock.findFirst({
        where:  { id: medicineStockId, organizationId },
        select: { id: true },
      })
      if (!medStock) {
        return { success: false, error: "Stock de médicament introuvable" }
      }
    }

    const treatment = await prisma.treatmentRecord.create({
      data: {
        organizationId,
        batchId,
        startDate,
        endDate:         endDate ?? null,
        medicineName,
        dose:            dose ?? null,
        durationDays:    durationDays ?? null,
        countTreated:    countTreated ?? null,
        medicineStockId: medicineStockId ?? null,
        indication:      indication ?? null,
        notes:           notes ?? null,
        recordedById:    actorId,
      },
      select: treatmentSelect,
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.CREATE,
      resourceType:   "TREATMENT_RECORD",
      resourceId:     treatment.id,
      after:          { batchId, startDate, medicineName, countTreated },
    })

    return { success: true, data: treatment }
  } catch {
    return { success: false, error: "Impossible d'enregistrer le traitement" }
  }
}

// ---------------------------------------------------------------------------
// 11. updateTreatment
// ---------------------------------------------------------------------------

/**
 * Corrige ou ferme un traitement existant.
 *
 * Cas d'usage principal : fermer un traitement en renseignant endDate.
 *   { treatmentId, organizationId, endDate: new Date() }
 *
 * Champs immuables : batchId, startDate — ils définissent l'événement.
 *
 * Cohérence endDate >= startDate :
 *   Vérifiée côté serveur après chargement du startDate existant
 *   (impossible à valider dans le schéma Zod seul car startDate vient de la DB).
 *
 * Historique médical (Ajustement 4) :
 *   Aucune suppression n'est exposée. Ce update est le seul vecteur de correction.
 *   L'audit log préserve la traçabilité avant/après modification.
 *
 * Requiert CREATE_TREATMENT + canAccessFarm(farmId, "canWrite").
 */
export async function updateTreatment(
  data: unknown,
): Promise<ActionResult<TreatmentSummary>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = updateTreatmentSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, treatmentId, countTreated, ...updates } = parsed.data
    const actorId = sessionResult.data.user.id

    const membershipResult = await requireMembership(actorId, organizationId)
    if (!membershipResult.success) return membershipResult

    const { role, farmPermissions } = membershipResult.data

    if (!canPerformAction(role, "CREATE_TREATMENT")) {
      return { success: false, error: "Permission refusée" }
    }

    const existing = await prisma.treatmentRecord.findFirst({
      where:  { id: treatmentId, organizationId },
      select: {
        ...treatmentSelect,
        batch: {
          select: {
            entryCount: true,
            building:   { select: { farmId: true } },
          },
        },
      },
    })
    if (!existing) {
      return { success: false, error: "Traitement introuvable" }
    }

    if (!canAccessFarm(role, farmPermissions, existing.batch.building.farmId, "canWrite")) {
      return { success: false, error: "Accès en écriture refusé sur cette ferme" }
    }

    // Cohérence endDate >= startDate (vérification serveur, startDate vient de la DB)
    if (updates.endDate && updates.endDate < existing.startDate) {
      return {
        success: false,
        error:   "La date de fin doit être postérieure ou égale à la date de début du traitement",
      }
    }

    // Garde countTreated si fourni (Ajustement 2)
    if (countTreated !== undefined && countTreated > existing.batch.entryCount) {
      return {
        success: false,
        error:
          `Le nombre de sujets traités (${countTreated}) dépasse l'effectif ` +
          `initial du lot (${existing.batch.entryCount})`,
      }
    }

    // Valider le nouveau stock médicament si fourni
    if (updates.medicineStockId) {
      const medStock = await prisma.medicineStock.findFirst({
        where:  { id: updates.medicineStockId, organizationId },
        select: { id: true },
      })
      if (!medStock) {
        return { success: false, error: "Stock de médicament introuvable" }
      }
    }

    const { batch, ...existingData } = existing
    void batch

    const treatment = await prisma.treatmentRecord.update({
      where:  { id: treatmentId },
      data:   { ...updates, ...(countTreated !== undefined ? { countTreated } : {}) },
      select: treatmentSelect,
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.UPDATE,
      resourceType:   "TREATMENT_RECORD",
      resourceId:     treatmentId,
      before:         existingData,
      after:          { ...updates, ...(countTreated !== undefined ? { countTreated } : {}) },
    })

    return { success: true, data: treatment }
  } catch {
    return { success: false, error: "Impossible de mettre à jour le traitement" }
  }
}
