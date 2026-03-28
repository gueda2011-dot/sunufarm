/**
 * SunuFarm — Server Actions : gestion des stocks
 *
 * Deux familles couvertes :
 *   1. Stock aliment      (FeedStock + FeedMovement)
 *   2. Stock médicaments  (MedicineStock + MedicineMovement)
 *
 * Architecture du stock — quantité dénormalisée :
 *   La quantité courante est stockée directement sur FeedStock.quantityKg
 *   et MedicineStock.quantityOnHand. Chaque création de mouvement met à jour
 *   cette valeur de façon atomique via $transaction. La cohérence est garantie
 *   par le code, pas par recalcul.
 *
 * Décision 1 — Permissions de lecture (opérationnel, pas seulement financier) :
 *   Un TECHNICIAN doit pouvoir consulter le stock aliment de sa ferme pour gérer
 *   les distributions journalières. VIEW_FINANCES exclurait ces rôles terrain.
 *   Stratégie retenue :
 *   - farmId fourni → canAccessFarm(farmId, "canRead") — accessible à tout rôle
 *     ayant accès à la ferme (TECHNICIAN inclus via farmPermissions)
 *   - farmId absent → VIEW_FINANCES pour une vue org entière ; sinon filtrage
 *     par farmPermissions.canRead (chaque utilisateur voit ses fermes autorisées)
 *
 * Décision 2 — Cohérence farmId / feedStockId|medicineStockId :
 *   Si les deux sont fournis comme filtres, on vérifie explicitement que le stock
 *   appartient bien à la ferme indiquée. Un désaccord retourne une erreur métier
 *   claire plutôt qu'un résultat silencieusement vide.
 *
 * Décision 3 — Date des mouvements :
 *   Passé autorisé — un opérateur peut corriger un oubli de saisie.
 *   Futur refusé   — un mouvement qui n'a pas encore eu lieu n'a pas de sens.
 *   Validation : date <= aujourd'hui (comparaison date-only, heure ignorée).
 *
 * Décision 4 — Sémantique INVENTAIRE :
 *   Pour un mouvement de type INVENTAIRE, la quantité représente la valeur
 *   physique réellement observée lors du comptage. Ce n'est PAS une variation :
 *   le stock courant est remplacé (écrasé) par cette valeur absolue.
 *   Effet : quantityKg = movement.quantityKg (pas +=).
 *
 * Décision 5 — Historique append-only :
 *   Les mouvements sont immuables une fois créés. Aucune modification ni
 *   suppression directe n'est exposée. Toute correction passe par :
 *   - AJUSTEMENT (delta signé) pour une correction partielle
 *   - INVENTAIRE (valeur absolue) pour un recalage complet sur le comptage réel
 *   Ce principe préserve l'intégrité du journal de stock.
 *
 * Périmètre MVP :
 *   getFeedStocks / getFeedMovements / createFeedStock / updateFeedStock / createFeedMovement
 *   getMedicineStocks / getMedicineMovements / createMedicineStock / updateMedicineStock / createMedicineMovement
 */

"use server"

import { z } from "zod"
import prisma from "@/src/lib/prisma"
import {
  requireSession,
  requireMembership,
  requireModuleAccess,
  type ActionResult,
} from "@/src/lib/auth"
import { createAuditLog, AuditAction } from "@/src/lib/audit"
import {
  canPerformAction,
  canAccessFarm,
  parseFarmPermissions,
} from "@/src/lib/permissions"
import {
  requiredIdSchema,
  optionalIdSchema,
  positiveIntSchema,
  positiveNumberSchema,
  optionalDateSchema,
} from "@/src/lib/validators"
import {
  FeedMovementType,
  MedicineMovementType,
  UserRole,
} from "@/src/generated/prisma/client"

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Nombre de jours avant péremption déclenchant l'alerte isExpiringSoon */
const EXPIRY_WARNING_DAYS = 30

// ---------------------------------------------------------------------------
// Schéma de date pour les mouvements
// ---------------------------------------------------------------------------

/**
 * Date d'un mouvement de stock.
 * - Passé autorisé : correction d'un oubli de saisie acceptée
 * - Futur refusé   : un mouvement qui n'a pas eu lieu n'a pas de sens
 * Comparaison date-only (heure ignorée) pour éviter les faux positifs de fuseau.
 */
const movementDateSchema = z.coerce.date().refine(
  (d) => {
    const today = new Date()
    const todayNorm = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
    const dNorm     = new Date(Date.UTC(d.getFullYear(),     d.getMonth(),     d.getDate()))
    return dNorm <= todayNorm
  },
  { message: "La date du mouvement ne peut pas être dans le futur" },
)

// ---------------------------------------------------------------------------
// Schémas Zod — Stock aliment
// ---------------------------------------------------------------------------

const getFeedStocksSchema = z.object({
  organizationId: requiredIdSchema,
  farmId:         optionalIdSchema,
  limit:          z.number().int().min(1).max(100).default(50),
})

const getFeedMovementsSchema = z.object({
  organizationId: requiredIdSchema,
  /** Filtre par stock précis — vérifié cohérent avec farmId si les deux sont fournis */
  feedStockId:    optionalIdSchema,
  farmId:         optionalIdSchema,
  batchId:        optionalIdSchema,
  fromDate:       optionalDateSchema,
  toDate:         optionalDateSchema,
  cursorDate:     z.coerce.date().optional(),
  limit:          z.number().int().min(1).max(100).default(20),
})

const createFeedStockSchema = z.object({
  organizationId:   requiredIdSchema,
  farmId:           requiredIdSchema,
  feedTypeId:       requiredIdSchema,
  name:             z.string().min(1).max(150),
  supplierName:     z.string().max(100).optional(),
  /**
   * Prix unitaire en FCFA/kg — utilisé pour valoriser les futures entrées.
   * Modifiable via updateFeedStock si le prix évolue.
   */
  unitPriceFcfa:    positiveIntSchema.optional(),
  /**
   * Seuil d'alerte en kg — déclenche isBelowAlert et les alertes stock bas.
   * 0 par défaut = pas d'alerte.
   */
  alertThresholdKg: z.number().nonnegative().optional(),
})

const updateFeedStockSchema = z.object({
  organizationId:   requiredIdSchema,
  feedStockId:      requiredIdSchema,
  name:             z.string().min(1).max(150).optional(),
  supplierName:     z.string().max(100).optional(),
  unitPriceFcfa:    positiveIntSchema.optional(),
  alertThresholdKg: z.number().nonnegative().optional(),
  // quantityKg est intentionnellement absent — jamais modifiable directement
})

const createFeedMovementSchema = z.object({
  organizationId: requiredIdSchema,
  feedStockId:    requiredIdSchema,
  type:           z.nativeEnum(FeedMovementType),
  /**
   * Quantité du mouvement en kg.
   * - ENTREE, SORTIE, INVENTAIRE : strictement positive (> 0)
   * - AJUSTEMENT : positive (stock trouvé) ou négative (perte / correction à la baisse)
   * Zéro refusé dans tous les cas.
   */
  quantityKg:     z.number().finite().refine(
    (v) => v !== 0,
    { message: "La quantité ne peut pas être zéro" },
  ),
  /** Renseigné pour les entrées d'achat — permet de calculer totalFcfa */
  unitPriceFcfa:  positiveIntSchema.optional(),
  /** Lot qui a consommé cet aliment (pour les SORTIE imputées à un lot) */
  batchId:        optionalIdSchema,
  reference:      z.string().max(100).optional(),
  notes:          z.string().max(1000).optional(),
  date:           movementDateSchema,
}).refine(
  (d) => d.type === FeedMovementType.AJUSTEMENT || d.quantityKg > 0,
  {
    message: "La quantité doit être strictement positive pour ce type de mouvement",
    path: ["quantityKg"],
  },
)

// ---------------------------------------------------------------------------
// Schémas Zod — Stock médicaments
// ---------------------------------------------------------------------------

const getMedicineStocksSchema = z.object({
  organizationId: requiredIdSchema,
  farmId:         optionalIdSchema,
  limit:          z.number().int().min(1).max(100).default(50),
})

const getMedicineMovementsSchema = z.object({
  organizationId:  requiredIdSchema,
  medicineStockId: optionalIdSchema,
  farmId:          optionalIdSchema,
  batchId:         optionalIdSchema,
  fromDate:        optionalDateSchema,
  toDate:          optionalDateSchema,
  cursorDate:      z.coerce.date().optional(),
  limit:           z.number().int().min(1).max(100).default(20),
})

const createMedicineStockSchema = z.object({
  organizationId:  requiredIdSchema,
  farmId:          requiredIdSchema,
  name:            z.string().min(1).max(150),
  category:        z.string().max(50).optional(),
  unit:            z.string().min(1).max(30),
  unitPriceFcfa:   positiveIntSchema.optional(),
  alertThreshold:  z.number().nonnegative().optional(),
  expiryDate:      optionalDateSchema,
  notes:           z.string().max(1000).optional(),
})

const updateMedicineStockSchema = z.object({
  organizationId:  requiredIdSchema,
  medicineStockId: requiredIdSchema,
  name:            z.string().min(1).max(150).optional(),
  category:        z.string().max(50).optional(),
  unit:            z.string().min(1).max(30).optional(),
  unitPriceFcfa:   positiveIntSchema.optional(),
  alertThreshold:  z.number().nonnegative().optional(),
  expiryDate:      optionalDateSchema,
  notes:           z.string().max(1000).optional(),
  // quantityOnHand absent — jamais modifiable directement
})

const createMedicineMovementSchema = z.object({
  organizationId:  requiredIdSchema,
  medicineStockId: requiredIdSchema,
  type:            z.nativeEnum(MedicineMovementType),
  /**
   * Quantité du mouvement dans l'unité définie sur MedicineStock.
   * Tous les types MedicineMovementType (ENTREE, SORTIE, PEREMPTION, INVENTAIRE)
   * utilisent une quantité strictement positive. PEREMPTION est une SORTIE motivée
   * par la date de péremption — la direction est portée par le type, pas le signe.
   */
  quantity:        positiveNumberSchema,
  unitPriceFcfa:   positiveIntSchema.optional(),
  batchId:         optionalIdSchema,
  reference:       z.string().max(100).optional(),
  notes:           z.string().max(1000).optional(),
  date:            movementDateSchema,
})

// ---------------------------------------------------------------------------
// Types retournés
// ---------------------------------------------------------------------------

export interface FeedStockSummary {
  id:               string
  organizationId:   string
  farmId:           string
  feedTypeId:       string
  name:             string
  supplierName:     string | null
  quantityKg:       number
  unitPriceFcfa:    number
  alertThresholdKg: number
  /** true si quantityKg <= alertThresholdKg */
  isBelowAlert:     boolean
  createdAt:        Date
  feedType:         { id: string; name: string; code: string }
}

export interface FeedMovementSummary {
  id:             string
  organizationId: string
  feedStockId:    string
  feedTypeId:     string
  type:           FeedMovementType
  quantityKg:     number
  unitPriceFcfa:  number | null
  totalFcfa:      number | null
  batchId:        string | null
  reference:      string | null
  notes:          string | null
  date:           Date
  createdAt:      Date
  feedStock:      { id: string; name: string; farmId: string }
}

export interface MedicineStockSummary {
  id:             string
  organizationId: string
  farmId:         string
  name:           string
  category:       string | null
  unit:           string
  quantityOnHand: number
  unitPriceFcfa:  number
  expiryDate:     Date | null
  alertThreshold: number
  notes:          string | null
  /** true si quantityOnHand <= alertThreshold */
  isBelowAlert:   boolean
  /** true si expiryDate est dans les 30 prochains jours */
  isExpiringSoon: boolean
  createdAt:      Date
}

export interface MedicineMovementSummary {
  id:              string
  organizationId:  string
  medicineStockId: string
  type:            MedicineMovementType
  quantity:        number
  unitPriceFcfa:   number | null
  totalFcfa:       number | null
  batchId:         string | null
  reference:       string | null
  notes:           string | null
  date:            Date
  createdAt:       Date
  medicineStock:   { id: string; name: string; farmId: string }
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

const feedStockSelect = {
  id:               true,
  organizationId:   true,
  farmId:           true,
  feedTypeId:       true,
  name:             true,
  supplierName:     true,
  quantityKg:       true,
  unitPriceFcfa:    true,
  alertThresholdKg: true,
  createdAt:        true,
  feedType: { select: { id: true, name: true, code: true } },
} as const

const feedMovementSelect = {
  id:             true,
  organizationId: true,
  feedStockId:    true,
  feedTypeId:     true,
  type:           true,
  quantityKg:     true,
  unitPriceFcfa:  true,
  totalFcfa:      true,
  batchId:        true,
  reference:      true,
  notes:          true,
  date:           true,
  createdAt:      true,
  feedStock: { select: { id: true, name: true, farmId: true } },
} as const

const medicineStockSelect = {
  id:             true,
  organizationId: true,
  farmId:         true,
  name:           true,
  category:       true,
  unit:           true,
  quantityOnHand: true,
  unitPriceFcfa:  true,
  expiryDate:     true,
  alertThreshold: true,
  notes:          true,
  createdAt:      true,
} as const

const medicineMovementSelect = {
  id:              true,
  organizationId:  true,
  medicineStockId: true,
  type:            true,
  quantity:        true,
  unitPriceFcfa:   true,
  totalFcfa:       true,
  batchId:         true,
  reference:       true,
  notes:           true,
  date:            true,
  createdAt:       true,
  medicineStock: { select: { id: true, name: true, farmId: true } },
} as const

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

/**
 * Calcule la nouvelle quantité d'aliment après un mouvement.
 *
 * - ENTREE      : delta positif (ajout au stock)
 * - SORTIE      : delta négatif (consommation ou perte)
 * - INVENTAIRE  : valeur absolue — remplace le stock courant (pas un delta)
 * - AJUSTEMENT  : delta signé — positif si stock trouvé, négatif si perte
 */
function computeNewFeedQuantity(
  currentKg:  number,
  type:        FeedMovementType,
  quantityKg:  number,
): number {
  switch (type) {
    case FeedMovementType.ENTREE:
      return currentKg + quantityKg
    case FeedMovementType.SORTIE:
      return currentKg - quantityKg
    case FeedMovementType.INVENTAIRE:
      // Valeur physique réelle : écrase le stock courant
      return quantityKg
    case FeedMovementType.AJUSTEMENT:
      return currentKg + quantityKg
  }
}

/**
 * Calcule la nouvelle quantité médicament après un mouvement.
 *
 * - ENTREE      : delta positif
 * - SORTIE      : delta négatif (consommation normale)
 * - PEREMPTION  : delta négatif (sortie motivée par la date de péremption)
 * - INVENTAIRE  : valeur absolue — remplace la quantité courante
 */
function computeNewMedicineQuantity(
  currentQty: number,
  type:        MedicineMovementType,
  quantity:    number,
): number {
  switch (type) {
    case MedicineMovementType.ENTREE:
      return currentQty + quantity
    case MedicineMovementType.SORTIE:
    case MedicineMovementType.PEREMPTION:
      return currentQty - quantity
    case MedicineMovementType.INVENTAIRE:
      return quantity
  }
}

/**
 * Calcule le montant total d'un mouvement.
 * Utilise Math.abs pour gérer les AJUSTEMENT négatifs proprement.
 * Retourne null si le prix unitaire n'est pas renseigné.
 */
function computeMovementTotal(
  quantity:      number,
  unitPriceFcfa: number | undefined,
): number | null {
  if (unitPriceFcfa === undefined) return null
  return Math.round(Math.abs(quantity) * unitPriceFcfa)
}

/** true si expiryDate existe et tombe dans les EXPIRY_WARNING_DAYS à venir */
function checkExpiringSoon(expiryDate: Date | null): boolean {
  if (!expiryDate) return false
  const warning = new Date()
  warning.setDate(warning.getDate() + EXPIRY_WARNING_DAYS)
  return expiryDate <= warning
}

/**
 * Résout l'accès aux fermes pour les lectures sans farmId explicite.
 *
 * - VIEW_FINANCES → vue org complète (SUPER_ADMIN, OWNER, MANAGER, ACCOUNTANT)
 * - Sinon → uniquement les fermes avec canRead dans farmPermissions
 *
 * Retourne :
 *   "all"        → aucune restriction de ferme dans la requête
 *   string[]     → liste de farmIds accessibles (peut être vide)
 */
function resolveFarmReadScope(
  role:            UserRole,
  farmPermissions: unknown,
): "all" | string[] {
  if (canPerformAction(role, "VIEW_FINANCES")) return "all"
  const perms = parseFarmPermissions(farmPermissions)
  return perms.filter((p) => p.canRead).map((p) => p.farmId)
}

// ---------------------------------------------------------------------------
// 1. getFeedStocks
// ---------------------------------------------------------------------------

/**
 * Retourne les stocks d'aliment d'une organisation, avec farmId optionnel.
 *
 * Permissions (opérationnelles, pas seulement financières) :
 *   - farmId fourni → canAccessFarm(farmId, "canRead") — TECHNICIAN inclus
 *   - farmId absent → VIEW_FINANCES pour tout voir ; sinon filtre farmPermissions
 *
 * isBelowAlert est calculé à la volée (quantityKg <= alertThresholdKg).
 */
export async function getFeedStocks(
  data: unknown,
): Promise<ActionResult<FeedStockSummary[]>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = getFeedStocksSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

      const { organizationId, farmId, limit } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult
    const moduleAccessResult = requireModuleAccess(membershipResult.data, "STOCK")
    if (!moduleAccessResult.success) return moduleAccessResult

    const { role, farmPermissions } = membershipResult.data

    // Valider l'accès à la ferme si farmId est fourni
    if (farmId && !canAccessFarm(role, farmPermissions, farmId, "canRead")) {
      return { success: false, error: "Accès refusé à cette ferme" }
    }

    // Construire le filtre ferme pour la requête Prisma
    let farmFilter: { farmId?: string | { in: string[] } } = {}
    if (farmId) {
      farmFilter = { farmId }
    } else {
      const scope = resolveFarmReadScope(role, farmPermissions)
      if (scope !== "all") {
        if (scope.length === 0) return { success: true, data: [] }
        farmFilter = { farmId: { in: scope } }
      }
    }

      const stocks = await prisma.feedStock.findMany({
        where:   { organizationId, ...farmFilter },
        select:  feedStockSelect,
        orderBy: [{ farmId: "asc" }, { name: "asc" }],
        take:    limit,
      })

    return {
      success: true,
      data:    stocks.map((s) => ({
        ...s,
        isBelowAlert: s.quantityKg <= s.alertThresholdKg,
      })),
    }
  } catch {
    return { success: false, error: "Impossible de récupérer les stocks d'aliment" }
  }
}

// ---------------------------------------------------------------------------
// 2. getFeedMovements
// ---------------------------------------------------------------------------

/**
 * Retourne les mouvements de stock aliment avec filtres optionnels.
 *
 * Cohérence farmId / feedStockId :
 *   Si les deux sont fournis, le stock doit appartenir à la ferme indiquée.
 *   Un désaccord retourne une erreur explicite plutôt qu'un résultat vide.
 *
 * Pagination cursor-based sur date desc.
 * Historique append-only — aucun mouvement n'est modifiable ou supprimable.
 */
export async function getFeedMovements(
  data: unknown,
): Promise<ActionResult<FeedMovementSummary[]>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = getFeedMovementsSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const {
      organizationId,
      feedStockId,
      farmId,
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
    const moduleAccessResult = requireModuleAccess(membershipResult.data, "STOCK")
    if (!moduleAccessResult.success) return moduleAccessResult

    const { role, farmPermissions } = membershipResult.data

    // --- Validation feedStockId + cohérence avec farmId (Ajustement 2) ---
    let feedStockFarmId: string | undefined

    if (feedStockId) {
      const feedStock = await prisma.feedStock.findFirst({
        where:  { id: feedStockId, organizationId },
        select: { id: true, farmId: true },
      })
      if (!feedStock) {
        return { success: false, error: "Stock d'aliment introuvable" }
      }
      // Cohérence : si farmId est aussi fourni, les deux doivent concorder
      if (farmId && feedStock.farmId !== farmId) {
        return {
          success: false,
          error:   "Le stock d'aliment n'appartient pas à cette ferme",
        }
      }
      // Vérifier l'accès à la ferme réelle du stock
      if (!canAccessFarm(role, farmPermissions, feedStock.farmId, "canRead")) {
        return { success: false, error: "Accès refusé à cette ferme" }
      }
      feedStockFarmId = feedStock.farmId
    } else if (farmId) {
      if (!canAccessFarm(role, farmPermissions, farmId, "canRead")) {
        return { success: false, error: "Accès refusé à cette ferme" }
      }
    }

    // --- Construire le filtre ferme pour les mouvements ---
    // FeedMovement n'a pas farmId direct → accès via la relation feedStock
    let movementFarmFilter: object = {}

    if (feedStockId) {
      // feedStockId est le filtre le plus précis — ferme déjà validée
      movementFarmFilter = { feedStockId }
    } else if (farmId) {
      movementFarmFilter = { feedStock: { farmId } }
    } else if (!feedStockFarmId) {
      const scope = resolveFarmReadScope(role, farmPermissions)
      if (scope !== "all") {
        if (scope.length === 0) return { success: true, data: [] }
        movementFarmFilter = { feedStock: { farmId: { in: scope } } }
      }
    }

    const movements = await prisma.feedMovement.findMany({
      where: {
        organizationId,
        ...movementFarmFilter,
        ...(batchId ? { batchId } : {}),
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
      select:  feedMovementSelect,
      orderBy: { date: "desc" },
      take:    limit,
    })

    return { success: true, data: movements }
  } catch {
    return { success: false, error: "Impossible de récupérer les mouvements d'aliment" }
  }
}

// ---------------------------------------------------------------------------
// 3. createFeedStock
// ---------------------------------------------------------------------------

/**
 * Crée un article stock aliment pour une ferme.
 * La quantité initiale est 0 — à alimenter via createFeedMovement (ENTREE ou INVENTAIRE).
 * Requiert MANAGE_FARMS + accès en écriture à la ferme.
 */
export async function createFeedStock(
  data: unknown,
): Promise<ActionResult<FeedStockSummary>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = createFeedStockSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, farmId, ...stockData } = parsed.data
    const actorId = sessionResult.data.user.id

    const membershipResult = await requireMembership(actorId, organizationId)
    if (!membershipResult.success) return membershipResult
    const moduleAccessResult = requireModuleAccess(membershipResult.data, "STOCK")
    if (!moduleAccessResult.success) return moduleAccessResult

    const { role, farmPermissions } = membershipResult.data

    if (!canPerformAction(role, "MANAGE_FARMS")) {
      return { success: false, error: "Permission refusée" }
    }
    if (!canAccessFarm(role, farmPermissions, farmId, "canWrite")) {
      return { success: false, error: "Accès en écriture refusé sur cette ferme" }
    }

    const farm = await prisma.farm.findFirst({
      where:  { id: farmId, organizationId, deletedAt: null },
      select: { id: true },
    })
    if (!farm) {
      return { success: false, error: "Ferme introuvable" }
    }

    const feedStock = await prisma.feedStock.create({
      data:   { organizationId, farmId, ...stockData },
      select: feedStockSelect,
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.CREATE,
      resourceType:   "FEED_STOCK",
      resourceId:     feedStock.id,
      after:          { farmId, ...stockData },
    })

    return {
      success: true,
      data:    { ...feedStock, isBelowAlert: feedStock.quantityKg <= feedStock.alertThresholdKg },
    }
  } catch {
    return { success: false, error: "Impossible de créer le stock d'aliment" }
  }
}

// ---------------------------------------------------------------------------
// 4. updateFeedStock
// ---------------------------------------------------------------------------

/**
 * Modifie les métadonnées d'un stock aliment (nom, prix, seuil d'alerte).
 * quantityKg est intentionnellement absent — toute modification de quantité
 * passe obligatoirement par un mouvement (createFeedMovement).
 * Requiert MANAGE_FARMS + accès en écriture à la ferme.
 */
export async function updateFeedStock(
  data: unknown,
): Promise<ActionResult<FeedStockSummary>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = updateFeedStockSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, feedStockId, ...updates } = parsed.data
    const actorId = sessionResult.data.user.id

    const membershipResult = await requireMembership(actorId, organizationId)
    if (!membershipResult.success) return membershipResult
    const moduleAccessResult = requireModuleAccess(membershipResult.data, "STOCK")
    if (!moduleAccessResult.success) return moduleAccessResult

    const { role, farmPermissions } = membershipResult.data

    if (!canPerformAction(role, "MANAGE_FARMS")) {
      return { success: false, error: "Permission refusée" }
    }

    const existing = await prisma.feedStock.findFirst({
      where:  { id: feedStockId, organizationId },
      select: { id: true, farmId: true },
    })
    if (!existing) {
      return { success: false, error: "Stock d'aliment introuvable" }
    }

    if (!canAccessFarm(role, farmPermissions, existing.farmId, "canWrite")) {
      return { success: false, error: "Accès en écriture refusé sur cette ferme" }
    }

    const feedStock = await prisma.feedStock.update({
      where:  { id: feedStockId },
      data:   updates,
      select: feedStockSelect,
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.UPDATE,
      resourceType:   "FEED_STOCK",
      resourceId:     feedStockId,
      before:         existing,
      after:          updates,
    })

    return {
      success: true,
      data:    { ...feedStock, isBelowAlert: feedStock.quantityKg <= feedStock.alertThresholdKg },
    }
  } catch {
    return { success: false, error: "Impossible de mettre à jour le stock d'aliment" }
  }
}

// ---------------------------------------------------------------------------
// 5. createFeedMovement
// ---------------------------------------------------------------------------

/**
 * Enregistre un mouvement de stock aliment et met à jour FeedStock.quantityKg
 * de façon atomique dans une $transaction.
 *
 * Types de mouvement :
 *   ENTREE     → approvisionnement (livraison, achat) — quantityKg > 0
 *   SORTIE     → consommation (par un lot ou autre) — quantityKg > 0
 *   INVENTAIRE → comptage physique réel (valeur absolue, écrase le stock courant)
 *   AJUSTEMENT → correction d'écart (positif = stock trouvé, négatif = perte)
 *
 * Sémantique INVENTAIRE :
 *   La quantité saisie représente la valeur physique réellement observée lors
 *   du comptage. Ce n'est PAS une variation : le stock courant est remplacé par
 *   cette valeur absolue. Effet : quantityKg = mouvement.quantityKg (pas +=).
 *
 * Historique append-only :
 *   Ce mouvement est immuable une fois créé.
 *   Toute correction passe par un nouveau mouvement AJUSTEMENT ou INVENTAIRE.
 *   Aucune fonction updateFeedMovement ou deleteFeedMovement n'est exposée.
 *
 * Requiert CREATE_FEED_MOVEMENT + accès en écriture à la ferme du stock.
 */
export async function createFeedMovement(
  data: unknown,
): Promise<ActionResult<FeedMovementSummary>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = createFeedMovementSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const {
      organizationId,
      feedStockId,
      type,
      quantityKg,
      unitPriceFcfa,
      batchId,
      reference,
      notes,
      date,
    } = parsed.data
    const actorId = sessionResult.data.user.id

    const membershipResult = await requireMembership(actorId, organizationId)
    if (!membershipResult.success) return membershipResult
    const moduleAccessResult = requireModuleAccess(membershipResult.data, "STOCK")
    if (!moduleAccessResult.success) return moduleAccessResult

    const { role, farmPermissions } = membershipResult.data

    if (!canPerformAction(role, "CREATE_FEED_MOVEMENT")) {
      return { success: false, error: "Permission refusée" }
    }

    // Charger le stock pour obtenir farmId, feedTypeId et quantityKg courante
    const feedStock = await prisma.feedStock.findFirst({
      where:  { id: feedStockId, organizationId },
      select: { id: true, farmId: true, feedTypeId: true, quantityKg: true },
    })
    if (!feedStock) {
      return { success: false, error: "Stock d'aliment introuvable" }
    }

    if (!canAccessFarm(role, farmPermissions, feedStock.farmId, "canWrite")) {
      return { success: false, error: "Accès en écriture refusé sur cette ferme" }
    }

    // Valider le lot si fourni
    if (batchId) {
      const batch = await prisma.batch.findFirst({
        where:  { id: batchId, organizationId },
        select: { id: true },
      })
      if (!batch) {
        return { success: false, error: "Lot introuvable" }
      }
    }

    const totalFcfa = computeMovementTotal(quantityKg, unitPriceFcfa)

    let createdMovement: FeedMovementSummary

    try {
      createdMovement = await prisma.$transaction(async (tx) => {
        const newQuantity = computeNewFeedQuantity(
          feedStock.quantityKg,
          type,
          quantityKg,
        )

        if (newQuantity < 0) {
          throw new BusinessRuleError(
            `Stock insuffisant : ${feedStock.quantityKg.toFixed(2)} kg disponibles, ` +
            `${Math.abs(quantityKg).toFixed(2)} kg demandés`,
          )
        }

        // Mise à jour atomique de la quantité courante
        await tx.feedStock.update({
          where: { id: feedStockId },
          data:  { quantityKg: newQuantity },
        })

        // feedTypeId déduit du stock — pas fourni par le client
        return tx.feedMovement.create({
          data: {
            organizationId,
            feedStockId,
            feedTypeId:   feedStock.feedTypeId,
            type,
            quantityKg,
            unitPriceFcfa: unitPriceFcfa ?? null,
            totalFcfa,
            batchId:       batchId ?? null,
            reference:     reference ?? null,
            notes:         notes ?? null,
            recordedById:  actorId,
            date,
          },
          select: feedMovementSelect,
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
      resourceType:   "FEED_MOVEMENT",
      resourceId:     createdMovement.id,
      after:          { feedStockId, type, quantityKg, unitPriceFcfa, batchId, date },
    })

    return { success: true, data: createdMovement }
  } catch {
    return { success: false, error: "Impossible de créer le mouvement d'aliment" }
  }
}

// ---------------------------------------------------------------------------
// 6. getMedicineStocks
// ---------------------------------------------------------------------------

/**
 * Retourne les stocks de médicaments/vaccins d'une organisation.
 *
 * Permissions identiques à getFeedStocks — stock opérationnel accessible aux
 * rôles terrain (TECHNICIAN, VET) qui consultent les stocks de leur ferme.
 *
 * Champs calculés :
 *   isBelowAlert   → quantityOnHand <= alertThreshold
 *   isExpiringSoon → expiryDate dans les 30 prochains jours
 */
export async function getMedicineStocks(
  data: unknown,
): Promise<ActionResult<MedicineStockSummary[]>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = getMedicineStocksSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

      const { organizationId, farmId, limit } = parsed.data

    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult
    const moduleAccessResult = requireModuleAccess(membershipResult.data, "STOCK")
    if (!moduleAccessResult.success) return moduleAccessResult

    const { role, farmPermissions } = membershipResult.data

    if (farmId && !canAccessFarm(role, farmPermissions, farmId, "canRead")) {
      return { success: false, error: "Accès refusé à cette ferme" }
    }

    let farmFilter: { farmId?: string | { in: string[] } } = {}
    if (farmId) {
      farmFilter = { farmId }
    } else {
      const scope = resolveFarmReadScope(role, farmPermissions)
      if (scope !== "all") {
        if (scope.length === 0) return { success: true, data: [] }
        farmFilter = { farmId: { in: scope } }
      }
    }

      const stocks = await prisma.medicineStock.findMany({
        where:   { organizationId, ...farmFilter },
        select:  medicineStockSelect,
        orderBy: [{ farmId: "asc" }, { name: "asc" }],
        take:    limit,
      })

    return {
      success: true,
      data:    stocks.map((s) => ({
        ...s,
        isBelowAlert:   s.quantityOnHand <= s.alertThreshold,
        isExpiringSoon: checkExpiringSoon(s.expiryDate),
      })),
    }
  } catch {
    return { success: false, error: "Impossible de récupérer les stocks de médicaments" }
  }
}

// ---------------------------------------------------------------------------
// 7. getMedicineMovements
// ---------------------------------------------------------------------------

/**
 * Retourne les mouvements de stock médicament avec filtres optionnels.
 *
 * Cohérence medicineStockId / farmId :
 *   Si les deux sont fournis, le stock doit appartenir à la ferme indiquée.
 *   Un désaccord retourne une erreur explicite.
 *
 * Historique append-only — aucun mouvement n'est modifiable ou supprimable.
 */
export async function getMedicineMovements(
  data: unknown,
): Promise<ActionResult<MedicineMovementSummary[]>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = getMedicineMovementsSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const {
      organizationId,
      medicineStockId,
      farmId,
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
    const moduleAccessResult = requireModuleAccess(membershipResult.data, "STOCK")
    if (!moduleAccessResult.success) return moduleAccessResult

    const { role, farmPermissions } = membershipResult.data

    // --- Validation medicineStockId + cohérence farmId (Ajustement 2) ---
    if (medicineStockId) {
      const medStock = await prisma.medicineStock.findFirst({
        where:  { id: medicineStockId, organizationId },
        select: { id: true, farmId: true },
      })
      if (!medStock) {
        return { success: false, error: "Stock de médicament introuvable" }
      }
      if (farmId && medStock.farmId !== farmId) {
        return {
          success: false,
          error:   "Le stock de médicament n'appartient pas à cette ferme",
        }
      }
      if (!canAccessFarm(role, farmPermissions, medStock.farmId, "canRead")) {
        return { success: false, error: "Accès refusé à cette ferme" }
      }
    } else if (farmId) {
      if (!canAccessFarm(role, farmPermissions, farmId, "canRead")) {
        return { success: false, error: "Accès refusé à cette ferme" }
      }
    }

    // --- Construire le filtre ferme ---
    let movementFarmFilter: object = {}
    if (medicineStockId) {
      movementFarmFilter = { medicineStockId }
    } else if (farmId) {
      movementFarmFilter = { medicineStock: { farmId } }
    } else {
      const scope = resolveFarmReadScope(role, farmPermissions)
      if (scope !== "all") {
        if (scope.length === 0) return { success: true, data: [] }
        movementFarmFilter = { medicineStock: { farmId: { in: scope } } }
      }
    }

    const movements = await prisma.medicineMovement.findMany({
      where: {
        organizationId,
        ...movementFarmFilter,
        ...(batchId ? { batchId } : {}),
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
      select:  medicineMovementSelect,
      orderBy: { date: "desc" },
      take:    limit,
    })

    return { success: true, data: movements }
  } catch {
    return { success: false, error: "Impossible de récupérer les mouvements de médicaments" }
  }
}

// ---------------------------------------------------------------------------
// 8. createMedicineStock
// ---------------------------------------------------------------------------

/**
 * Crée un article stock médicament/vaccin pour une ferme.
 * La quantité initiale est 0 — à alimenter via createMedicineMovement.
 * Requiert MANAGE_FARMS + accès en écriture à la ferme.
 */
export async function createMedicineStock(
  data: unknown,
): Promise<ActionResult<MedicineStockSummary>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = createMedicineStockSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, farmId, ...stockData } = parsed.data
    const actorId = sessionResult.data.user.id

    const membershipResult = await requireMembership(actorId, organizationId)
    if (!membershipResult.success) return membershipResult
    const moduleAccessResult = requireModuleAccess(membershipResult.data, "STOCK")
    if (!moduleAccessResult.success) return moduleAccessResult

    const { role, farmPermissions } = membershipResult.data

    if (!canPerformAction(role, "MANAGE_FARMS")) {
      return { success: false, error: "Permission refusée" }
    }
    if (!canAccessFarm(role, farmPermissions, farmId, "canWrite")) {
      return { success: false, error: "Accès en écriture refusé sur cette ferme" }
    }

    const farm = await prisma.farm.findFirst({
      where:  { id: farmId, organizationId, deletedAt: null },
      select: { id: true },
    })
    if (!farm) {
      return { success: false, error: "Ferme introuvable" }
    }

    const medStock = await prisma.medicineStock.create({
      data:   { organizationId, farmId, ...stockData },
      select: medicineStockSelect,
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.CREATE,
      resourceType:   "MEDICINE_STOCK",
      resourceId:     medStock.id,
      after:          { farmId, ...stockData },
    })

    return {
      success: true,
      data:    {
        ...medStock,
        isBelowAlert:   medStock.quantityOnHand <= medStock.alertThreshold,
        isExpiringSoon: checkExpiringSoon(medStock.expiryDate),
      },
    }
  } catch {
    return { success: false, error: "Impossible de créer le stock de médicament" }
  }
}

// ---------------------------------------------------------------------------
// 9. updateMedicineStock
// ---------------------------------------------------------------------------

/**
 * Modifie les métadonnées d'un stock médicament (nom, catégorie, prix, seuil, péremption).
 * quantityOnHand est intentionnellement absent — toute modification de quantité
 * passe obligatoirement par un mouvement (createMedicineMovement).
 * Requiert MANAGE_FARMS + accès en écriture à la ferme.
 */
export async function updateMedicineStock(
  data: unknown,
): Promise<ActionResult<MedicineStockSummary>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = updateMedicineStockSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, medicineStockId, ...updates } = parsed.data
    const actorId = sessionResult.data.user.id

    const membershipResult = await requireMembership(actorId, organizationId)
    if (!membershipResult.success) return membershipResult
    const moduleAccessResult = requireModuleAccess(membershipResult.data, "STOCK")
    if (!moduleAccessResult.success) return moduleAccessResult

    const { role, farmPermissions } = membershipResult.data

    if (!canPerformAction(role, "MANAGE_FARMS")) {
      return { success: false, error: "Permission refusée" }
    }

    const existing = await prisma.medicineStock.findFirst({
      where:  { id: medicineStockId, organizationId },
      select: { id: true, farmId: true },
    })
    if (!existing) {
      return { success: false, error: "Stock de médicament introuvable" }
    }

    if (!canAccessFarm(role, farmPermissions, existing.farmId, "canWrite")) {
      return { success: false, error: "Accès en écriture refusé sur cette ferme" }
    }

    const medStock = await prisma.medicineStock.update({
      where:  { id: medicineStockId },
      data:   updates,
      select: medicineStockSelect,
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.UPDATE,
      resourceType:   "MEDICINE_STOCK",
      resourceId:     medicineStockId,
      before:         existing,
      after:          updates,
    })

    return {
      success: true,
      data:    {
        ...medStock,
        isBelowAlert:   medStock.quantityOnHand <= medStock.alertThreshold,
        isExpiringSoon: checkExpiringSoon(medStock.expiryDate),
      },
    }
  } catch {
    return { success: false, error: "Impossible de mettre à jour le stock de médicament" }
  }
}

// ---------------------------------------------------------------------------
// 10. createMedicineMovement
// ---------------------------------------------------------------------------

/**
 * Enregistre un mouvement de stock médicament et met à jour MedicineStock.quantityOnHand
 * de façon atomique dans une $transaction.
 *
 * Types de mouvement :
 *   ENTREE     → réception (achat, don) — quantityOnHand += quantity
 *   SORTIE     → consommation normale   — quantityOnHand -= quantity
 *   PEREMPTION → sortie pour péremption — quantityOnHand -= quantity
 *                (même effet que SORTIE, motif documenté dans le type)
 *   INVENTAIRE → comptage physique réel — quantityOnHand = quantity (valeur absolue)
 *
 * Sémantique INVENTAIRE :
 *   La quantité saisie représente la valeur physique réellement observée.
 *   Ce n'est PAS une variation : quantityOnHand est remplacé par cette valeur.
 *
 * Historique append-only :
 *   Ce mouvement est immuable une fois créé.
 *   Aucune fonction updateMedicineMovement ou deleteMedicineMovement n'est exposée.
 *   Toute correction passe par un nouveau mouvement INVENTAIRE.
 *
 * Requiert CREATE_MEDICINE_MOVEMENT + accès en écriture à la ferme du stock.
 */
export async function createMedicineMovement(
  data: unknown,
): Promise<ActionResult<MedicineMovementSummary>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = createMedicineMovementSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const {
      organizationId,
      medicineStockId,
      type,
      quantity,
      unitPriceFcfa,
      batchId,
      reference,
      notes,
      date,
    } = parsed.data
    const actorId = sessionResult.data.user.id

    const membershipResult = await requireMembership(actorId, organizationId)
    if (!membershipResult.success) return membershipResult
    const moduleAccessResult = requireModuleAccess(membershipResult.data, "STOCK")
    if (!moduleAccessResult.success) return moduleAccessResult

    const { role, farmPermissions } = membershipResult.data

    if (!canPerformAction(role, "CREATE_MEDICINE_MOVEMENT")) {
      return { success: false, error: "Permission refusée" }
    }

    const medStock = await prisma.medicineStock.findFirst({
      where:  { id: medicineStockId, organizationId },
      select: { id: true, farmId: true, quantityOnHand: true },
    })
    if (!medStock) {
      return { success: false, error: "Stock de médicament introuvable" }
    }

    if (!canAccessFarm(role, farmPermissions, medStock.farmId, "canWrite")) {
      return { success: false, error: "Accès en écriture refusé sur cette ferme" }
    }

    if (batchId) {
      const batch = await prisma.batch.findFirst({
        where:  { id: batchId, organizationId },
        select: { id: true },
      })
      if (!batch) {
        return { success: false, error: "Lot introuvable" }
      }
    }

    const totalFcfa = computeMovementTotal(quantity, unitPriceFcfa)

    let createdMovement: MedicineMovementSummary

    try {
      createdMovement = await prisma.$transaction(async (tx) => {
        const newQuantity = computeNewMedicineQuantity(
          medStock.quantityOnHand,
          type,
          quantity,
        )

        if (newQuantity < 0) {
          throw new BusinessRuleError(
            `Stock insuffisant : ${medStock.quantityOnHand} unité(s) disponible(s), ` +
            `${quantity} demandée(s)`,
          )
        }

        await tx.medicineStock.update({
          where: { id: medicineStockId },
          data:  { quantityOnHand: newQuantity },
        })

        return tx.medicineMovement.create({
          data: {
            organizationId,
            medicineStockId,
            type,
            quantity,
            unitPriceFcfa: unitPriceFcfa ?? null,
            totalFcfa,
            batchId:       batchId ?? null,
            reference:     reference ?? null,
            notes:         notes ?? null,
            recordedById:  actorId,
            date,
          },
          select: medicineMovementSelect,
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
      resourceType:   "MEDICINE_MOVEMENT",
      resourceId:     createdMovement.id,
      after:          { medicineStockId, type, quantity, unitPriceFcfa, batchId, date },
    })

    return { success: true, data: createdMovement }
  } catch {
    return { success: false, error: "Impossible de créer le mouvement de médicament" }
  }
}
