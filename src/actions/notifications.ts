/**
 * SunuFarm — Server Actions : notifications in-app
 *
 * Architecture — persisté + généré à la demande (hybride) :
 *   Les notifications sont stockées en base (modèle Notification) pour permettre
 *   le suivi lu/non-lu et l'historique. La génération est déclenchée à la demande
 *   (chargement du dashboard, appel explicite) — pas de cron pour le MVP.
 *
 * Idempotence :
 *   generateNotifications évalue les signaux et ne crée que les notifications
 *   manquantes. Elle est safe à appeler plusieurs fois par le même utilisateur.
 *
 * Anti-spam — fenêtre glissante par type (Ajustement 6) :
 *   Règle : un seul enregistrement par (type, resourceType, resourceId, userId)
 *   dans la fenêtre de cooldown propre au resourceType.
 *   Les alertes critiques (rupture, mortalité, marge) ont un cooldown de 1 jour.
 *   Les rappels basse priorité ont un cooldown étendu pour réduire le bruit :
 *     MEDICINE_STOCK_EXPIRY  → 7 jours  (péremption lente, pas besoin de rappel quotidien)
 *     MEDICINE_STOCK         → 3 jours
 *     FEED_STOCK             → 2 jours
 *     BATCH (motif manquant) → 2 jours
 *     BATCH_VACCINATION_REMINDER → 3 jours
 *     INVOICE_OVERDUE        → 3 jours
 *   Par défaut : 1 jour pour tous les autres types.
 *
 * Regroupement DAILY_RECORD_MISSING (Ajustement 7) :
 *   Si 2+ lots actifs n'ont pas de saisie hier, une seule notification groupée
 *   est générée (titre : "N lots sans saisie hier") au lieu de N notifications.
 *   L'action URL pointe vers /batches (liste) plutôt qu'un lot individuel.
 *
 * Détection de persistance (isRecurring) :
 *   getNotifications marque `isRecurring = true` sur chaque notification dont
 *   le signal (resourceType + resourceId) a déjà déclenché une notification
 *   dans les 7 derniers jours. Cela permet à l'UI d'afficher "Persistant".
 *
 * Auto-archival silencieux (Ajustement 8) :
 *   generateNotificationsForOrganization archive automatiquement les notifications
 *   au statut LU datant de plus de 14 jours. Opération idempotente et silencieuse.
 *
 * Robustesse des check* (Ajustement 2) :
 *   Chaque signal est évalué dans son propre try/catch.
 *   Une erreur sur un signal ne bloque jamais les autres.
 *
 * Types de notification utilisés :
 *   STOCK_ALIMENT_CRITIQUE   → stock aliment sous seuil (resourceType: FEED_STOCK)
 *   AUTRE + MEDICINE_STOCK   → stock médicament sous seuil
 *   AUTRE + MEDICINE_STOCK_EXPIRY → médicament proche péremption (< 30 jours)
 *   AUTRE + DAILY_RECORD_MISSING  → saisie journalière absente (groupée si N > 1)
 *   MOTIF_MORTALITE_MANQUANT      → 3 jours consécutifs sans motif (resourceType: BATCH)
 *
 *   Note : les types MORTALITE_ELEVEE, TAUX_PONTE_BAS, RETARD_VACCINATION,
 *   CREANCE_EN_RETARD existent dans le schéma mais n'ont pas de générateur MVP.
 *   Le type AUTRE est utilisé pour les signaux sans type dédié dans l'enum.
 *
 * Utilisateurs ciblés par generateNotifications :
 *   OWNER et MANAGER actifs de l'organisation.
 *   Granularité par ferme prévue en V2 (farmPermissions).
 *
 * Sécurité (Ajustement 5) :
 *   Toutes les fonctions passent par requireSession() + requireMembership(organizationId).
 *   L'appartenance à l'organisation est vérifiée avant toute opération.
 *
 * Audit log :
 *   Pas d'audit log sur generateNotifications (processus système, pas une action utilisateur).
 *   Pas d'audit log sur markNotificationRead / archiveNotification (gestion d'UI, non métier).
 */

"use server"

import { z } from "zod"
import prisma from "@/src/lib/prisma"
import {
  requireOrganizationModuleContext,
  type ActionResult,
} from "@/src/lib/auth"
import {
  NotificationType,
  NotificationStatus,
  BatchStatus,
  UserRole,
  Prisma,
} from "@/src/generated/prisma/client"
import {
  requiredIdSchema,
} from "@/src/lib/validators"
import { KPI_THRESHOLDS } from "@/src/constants/kpi-thresholds"
import {
  getBatchMarginPredictionsInternal,
  getBatchMortalityPredictionsInternal,
  getStockPredictionsInternal,
} from "@/src/actions/predictive"
import {
  upsertOrganizationBatchMarginSnapshots,
  upsertOrganizationBatchMortalitySnapshots,
  upsertOrganizationSnapshots,
} from "@/src/lib/predictive-snapshots"
import { hasPlanFeature } from "@/src/lib/subscriptions"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { fetchLocalWeather } from "@/src/lib/weather"
import { resolveEntitlementGate } from "@/src/lib/gate-resolver"
import { getPremiumSurfaceCopy } from "@/src/lib/premium-surface-copy"

// ---------------------------------------------------------------------------
// Schémas Zod
// ---------------------------------------------------------------------------

const getNotificationsSchema = z.object({
  organizationId: requiredIdSchema,
  status:         z.nativeEnum(NotificationStatus).optional(),
  cursorDate:     z.coerce.date().optional(),
  limit:          z.number().int().min(1).max(100).default(20),
})

const getUnreadCountSchema = z.object({
  organizationId: requiredIdSchema,
})

const markNotificationReadSchema = z.object({
  organizationId: requiredIdSchema,
  notificationId: requiredIdSchema,
})

const markAllNotificationsReadSchema = z.object({
  organizationId: requiredIdSchema,
})

const archiveNotificationSchema = z.object({
  organizationId: requiredIdSchema,
  notificationId: requiredIdSchema,
})

const generateNotificationsSchema = z.object({
  organizationId: requiredIdSchema,
})

// ---------------------------------------------------------------------------
// Types retournés
// ---------------------------------------------------------------------------

export interface NotificationSummary {
  id:             string
  organizationId: string
  userId:         string
  type:           NotificationType
  status:         NotificationStatus
  title:          string
  message:        string
  resourceType:   string | null
  resourceId:     string | null
  /** Données contextuelles additionnelles (Json Prisma) */
  metadata:       unknown
  readAt:         Date | null
  createdAt:      Date
  alertKind?:     "simple" | "actionable"
  signalLabel?:   string
  signalTone?:    "neutral" | "warning" | "critical"
  consequence?:   string | null
  priority?:      "high" | "medium" | "low"
  actionLabel?:   string
  actionUrl?:     string
  /** Vrai si le même signal a déjà déclenché une notification dans les 7 derniers jours */
  isRecurring?:   boolean
  /** Évolution du signal par rapport au précédent déclenchement (disponible si isRecurring) */
  trend?:         "worsening" | "stable" | "improving"
}

export interface NotificationTeaser {
  id: string
  title: string
  message: string
  access: "blocked" | "preview" | "locked"
  priority: "high"
  signalLabel: string
  signalTone: "warning" | "critical"
  consequence: string
  ctaLabel: string
  footerHint?: string
}

// ---------------------------------------------------------------------------
// Sélection Prisma partagée
// ---------------------------------------------------------------------------

const notificationSelect = {
  id:             true,
  organizationId: true,
  userId:         true,
  type:           true,
  status:         true,
  title:          true,
  message:        true,
  resourceType:   true,
  resourceId:     true,
  metadata:       true,
  readAt:         true,
  createdAt:      true,
} as const

function getNotificationPriority(
  alertKind: "simple" | "actionable",
  signalTone: "neutral" | "warning" | "critical",
  resourceType: string | null,
): "high" | "medium" | "low" {
  if (alertKind === "actionable" && signalTone === "critical") return "high"
  if (alertKind === "actionable") return "medium"
  if (signalTone === "warning" && (resourceType === "DAILY_RECORD" || resourceType === "BATCH")) return "medium"
  return "low"
}

/**
 * Retourne le label d'action et l'URL de destination pour chaque type de notification.
 *
 * Principes :
 *   • Le label décrit une action concrète ("Saisir", "Réapprovisionner") pas un état ("Voir").
 *   • L'URL cible directement le bon écran avec tab (?tab=) ou anchor (#) quand possible.
 *   • FEED_STOCK* → /stock?tab=aliment   (onglet aliment présélectionné)
 *   • MEDICINE_STOCK* → /stock?tab=medicament
 *   • BATCH_MORTALITY_PREDICTIVE → /batches/{id}#alerte-mortalite  (scroll direct)
 *   • BATCH_MARGIN_PREDICTIVE    → /batches/{id}#alerte-marge
 *   • BATCH_VACCINATION_REMINDER → /batches/{batchId}#sante
 *     (resourceId format : "{batchId}:{vaccineName}:{dayOfAge}")
 */
function getNotificationActionInfo(
  resourceType: string | null,
  resourceId: string | null,
  metadata: unknown,
): { actionLabel?: string; actionUrl?: string } {
  const meta = (metadata !== null && typeof metadata === "object") ? metadata as Record<string, unknown> : null

  switch (resourceType) {
    // ── Stock aliment ──────────────────────────────────────────────────────
    case "FEED_STOCK":
      return { actionLabel: "Gérer le stock aliment", actionUrl: "/stock?tab=aliment" }
    case "FEED_STOCK_RUPTURE":
      return { actionLabel: "Réapprovisionner", actionUrl: "/stock?tab=aliment" }

    // ── Stock médicament ───────────────────────────────────────────────────
    case "MEDICINE_STOCK":
      return { actionLabel: "Gérer le stock médicament", actionUrl: "/stock?tab=medicament" }
    case "MEDICINE_STOCK_EXPIRY":
      return { actionLabel: "Gérer l'expiration", actionUrl: "/stock?tab=medicament" }
    case "MEDICINE_STOCK_RUPTURE":
      return { actionLabel: "Réapprovisionner", actionUrl: "/stock?tab=medicament" }

    // ── Saisie journalière manquante ───────────────────────────────────────
    case "DAILY_RECORD_MISSING":
      if (!resourceId) return {}
      return resourceId.startsWith("grouped-")
        ? { actionLabel: "Saisir pour les lots", actionUrl: "/batches" }
        : { actionLabel: "Saisir maintenant", actionUrl: `/batches/${resourceId}` }

    // ── Anomalie journalière ───────────────────────────────────────────────
    case "DAILY_RECORD": {
      const batchId = typeof meta?.batchId === "string" ? meta.batchId : null
      return batchId ? { actionLabel: "Documenter l'anomalie", actionUrl: `/batches/${batchId}#saisies` } : {}
    }

    // ── Motif de mortalité manquant ────────────────────────────────────────
    case "BATCH":
      return resourceId ? { actionLabel: "Saisir le motif", actionUrl: `/batches/${resourceId}` } : {}

    // ── Prédictions avec scroll direct sur la card ─────────────────────────
    case "BATCH_MORTALITY_PREDICTIVE":
      return resourceId
        ? { actionLabel: "Analyser le risque", actionUrl: `/batches/${resourceId}#alerte-mortalite` }
        : {}
    case "BATCH_MARGIN_PREDICTIVE":
      return resourceId
        ? { actionLabel: "Analyser la marge", actionUrl: `/batches/${resourceId}#alerte-marge` }
        : {}

    // ── Rappel vaccination — resourceId = "{batchId}:{vaccineName}:{dayOfAge}" ──
    // isTomorrow = true  → rappel J-1 : "Préparer la vaccination"
    // isTomorrow = false → rappel J   : "Vacciner maintenant" (le jour même)
    case "BATCH_VACCINATION_REMINDER": {
      const batchId = resourceId ? resourceId.split(":")[0] : null
      const isToday = meta?.isTomorrow === false
      return batchId
        ? {
            actionLabel: isToday ? "Vacciner maintenant" : "Préparer la vaccination",
            actionUrl: `/batches/${batchId}#sante`,
          }
        : {}
    }

    // ── Finances ───────────────────────────────────────────────────────────
    case "INVOICE_OVERDUE":
      return { actionLabel: "Voir les créances", actionUrl: "/finances" }

    // ── Météo ferme ────────────────────────────────────────────────────────
    case "FARM_WEATHER":
      return { actionLabel: "Voir les fermes", actionUrl: "/farms" }

    default:
      return {}
  }
}

function decorateNotification(notification: NotificationSummary): NotificationSummary {
  let alertKind: "simple" | "actionable" = "simple"
  let signalLabel = "Info"
  let signalTone: "neutral" | "warning" | "critical" = "neutral"
  let consequence: string | null = null

  switch (notification.resourceType) {
    case "FEED_STOCK":
    case "MEDICINE_STOCK":
    case "MEDICINE_STOCK_EXPIRY":
    case "DAILY_RECORD_MISSING":
    case "FARM_WEATHER":
    case "BATCH_VACCINATION_REMINDER":
      alertKind = "simple"; signalLabel = "Rappel"; signalTone = "warning"; break
    case "BATCH":
      alertKind = "simple"; signalLabel = "Motif manquant"; signalTone = "warning"; break
    case "DAILY_RECORD":
      alertKind = "simple"; signalLabel = "Anomalie"; signalTone = "warning"
      consequence = "Ce signal doit etre documente rapidement pour eviter une derive plus couteuse."; break
    case "FEED_STOCK_RUPTURE":
    case "MEDICINE_STOCK_RUPTURE":
      alertKind = "actionable"; signalLabel = "Rupture imminente"; signalTone = "critical"
      consequence = "Une rupture peut bloquer l exploitation et degrader rapidement la performance economique."; break
    case "BATCH_MORTALITY_PREDICTIVE":
      alertKind = "actionable"; signalLabel = "Risque mortalite"; signalTone = "critical"
      consequence = "Une derive de mortalite peut detruire la marge du lot si rien n est corrige."; break
    case "BATCH_MARGIN_PREDICTIVE":
      alertKind = "actionable"; signalLabel = "Derive de marge"; signalTone = "critical"
      consequence = "La marge projette une perte possible si le lot continue sur ce rythme."; break
    case "INVOICE_OVERDUE":
      alertKind = "actionable"; signalLabel = "Cash a risque"; signalTone = "warning"
      consequence = "Un retard de paiement peut tendre la tresorerie et limiter les prochaines decisions."; break
    default:
      alertKind = "simple"; signalLabel = "Info"; signalTone = "neutral"; break
  }

  const priority = getNotificationPriority(alertKind, signalTone, notification.resourceType)
  const actionInfo = getNotificationActionInfo(notification.resourceType, notification.resourceId, notification.metadata)

  return {
    ...notification,
    alertKind,
    signalLabel,
    signalTone,
    consequence,
    priority,
    ...actionInfo,
  }
}

// ---------------------------------------------------------------------------
// Adaptation du label d'action selon la tendance
// ---------------------------------------------------------------------------

/**
 * Retourne un label d'action plus urgent quand le signal est worsening + high priority.
 * L'objectif est de déclencher une action immédiate plutôt que de l'analyse.
 * Retourne undefined pour les types sans surcharge prévue.
 */
function getWorseningActionLabel(resourceType: string | null): string | undefined {
  switch (resourceType) {
    case "BATCH_MORTALITY_PREDICTIVE": return "Corriger maintenant"
    case "BATCH_MARGIN_PREDICTIVE":    return "Agir sur la marge"
    case "FEED_STOCK_RUPTURE":         return "Réapprovisionner d'urgence"
    case "MEDICINE_STOCK_RUPTURE":     return "Réapprovisionner d'urgence"
    default:                           return undefined
  }
}

// ---------------------------------------------------------------------------
// Calcul de tendance — fenêtre glissante (window-based)
// ---------------------------------------------------------------------------

/**
 * Indique si une valeur plus haute est synonyme de dégradation pour ce resourceType.
 *   true  → hausse = aggravation   (mortalité, risque)
 *   false → hausse = amélioration  (stocks, jours restants, marge)
 */
const TREND_HIGHER_IS_WORSE: Record<string, boolean> = {
  DAILY_RECORD:               true,   // mortalityRate : plus haut = pire
  FEED_STOCK:                 false,  // quantityKg    : plus bas  = pire
  MEDICINE_STOCK:             false,  // quantityOnHand: plus bas  = pire
  FEED_STOCK_RUPTURE:         false,  // daysToStockout: plus bas  = pire
  MEDICINE_STOCK_RUPTURE:     false,
  BATCH_MORTALITY_PREDICTIVE: true,   // riskScore     : plus haut = pire
  BATCH_MARGIN_PREDICTIVE:    false,  // projectedProfitFcfa : plus bas = pire
  MEDICINE_STOCK_EXPIRY:      false,  // daysLeft      : plus bas  = pire
}

/**
 * Seuil de variation relative pour sortir de la zone "stable".
 * Calibré large pour éviter les faux signaux sur du bruit de mesure.
 */
const TREND_STABLE_THRESHOLD: Record<string, number> = {
  DAILY_RECORD:               0.20,   // 20 % de variation relative du taux de mortalité
  FEED_STOCK:                 0.15,   // 15 % de variation de stock aliment
  MEDICINE_STOCK:             0.15,
  FEED_STOCK_RUPTURE:         0.20,   // 20 % sur le délai avant rupture
  MEDICINE_STOCK_RUPTURE:     0.20,
  BATCH_MORTALITY_PREDICTIVE: 0.15,   // 15 % sur le score de risque
  BATCH_MARGIN_PREDICTIVE:    0.15,   // 15 % sur la marge projetée
  MEDICINE_STOCK_EXPIRY:      0.25,   // 25 % sur les jours restants
}

/**
 * Extrait la métrique numérique pertinente d'un objet metadata pour le calcul de tendance.
 * Retourne null si la métrique est absente ou invalide.
 */
function extractTrendMetric(resourceType: string, meta: Record<string, unknown>): number | null {
  switch (resourceType) {
    case "DAILY_RECORD":
      return typeof meta.mortalityRate === "number" ? meta.mortalityRate : null
    case "FEED_STOCK":
      return typeof meta.quantityKg === "number" ? meta.quantityKg : null
    case "MEDICINE_STOCK":
      return typeof meta.quantityOnHand === "number" ? meta.quantityOnHand : null
    case "FEED_STOCK_RUPTURE":
    case "MEDICINE_STOCK_RUPTURE":
      return typeof meta.daysToStockout === "number" ? meta.daysToStockout : null
    case "BATCH_MORTALITY_PREDICTIVE":
      return typeof meta.riskScore === "number" ? meta.riskScore : null
    case "BATCH_MARGIN_PREDICTIVE":
      return typeof meta.projectedProfitFcfa === "number" ? meta.projectedProfitFcfa : null
    case "MEDICINE_STOCK_EXPIRY":
      return typeof meta.daysLeft === "number" ? meta.daysLeft : null
    default:
      return null
  }
}

/**
 * Calcule la tendance d'un signal par comparaison de deux fenêtres temporelles.
 *
 * Algorithme :
 *   - `priorSignalsMetas` contient les métadonnées des notifications antérieures triées par
 *     date décroissante (la plus récente en premier), sur une fenêtre de 14 jours.
 *   - On divise ces signaux en deux demi-fenêtres :
 *       • Fenêtre récente  : première moitié (signaux les plus proches du présent)
 *       • Fenêtre ancienne : deuxième moitié (référence de base)
 *   - La notification courante est intégrée dans la fenêtre récente pour le calcul.
 *   - Minimum requis : 2 signaux antérieurs avec métrique valide (au moins 1 par fenêtre).
 *   - Si la variation relative entre les deux moyennes est inférieure au seuil → "stable".
 *   - Pas de seuil absolu : tout est relatif à la valeur de référence pour rester agnostique
 *     aux unités (FCFA, kg, %, jours).
 *
 * Robustesse :
 *   - Si la moyenne de référence est 0 : cas traité explicitement.
 *   - Si les métadonnées sont incomplètes sur certains signaux : valeurs ignorées (filter null).
 *   - Résultat undefined si les données sont insuffisantes (pas de badge affiché).
 */
function calculateWindowTrend(
  resourceType: string,
  currentMeta: Record<string, unknown>,
  priorSignalsMetas: Array<Record<string, unknown>>,
): "worsening" | "stable" | "improving" | undefined {
  if (priorSignalsMetas.length < 2) return undefined

  const currentValue = extractTrendMetric(resourceType, currentMeta)
  if (currentValue === null) return undefined

  const priorValues = priorSignalsMetas
    .map((m) => extractTrendMetric(resourceType, m))
    .filter((v): v is number => v !== null)

  if (priorValues.length < 2) return undefined

  // Première moitié = plus récent (priorValues trié desc depuis la requête)
  const splitIdx = Math.ceil(priorValues.length / 2)
  const recentPriorValues = priorValues.slice(0, splitIdx)
  const olderValues = priorValues.slice(splitIdx)

  if (olderValues.length === 0) return undefined

  // La notification courante rejoint la fenêtre récente
  const recentValues = [currentValue, ...recentPriorValues]
  const recentAvg = recentValues.reduce((s, v) => s + v, 0) / recentValues.length
  const olderAvg  = olderValues.reduce((s, v) => s + v, 0) / olderValues.length

  if (olderAvg === 0) {
    // Référence nulle : dégradation si la valeur monte pour un indicateur "plus haut = pire"
    if (recentAvg === 0) return "stable"
    return (TREND_HIGHER_IS_WORSE[resourceType] ?? false) ? "worsening" : "improving"
  }

  const relativeDelta = (recentAvg - olderAvg) / Math.abs(olderAvg)
  const threshold = TREND_STABLE_THRESHOLD[resourceType] ?? 0.15

  if (Math.abs(relativeDelta) < threshold) return "stable"

  const isIncreasing  = relativeDelta > 0
  const higherIsWorse = TREND_HIGHER_IS_WORSE[resourceType] ?? false
  return (isIncreasing === higherIsWorse) ? "worsening" : "improving"
}

interface NotificationCandidate {
  title: string
  message: string
  resourceId: string
  metadata?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

/**
 * Début du jour calendaire UTC pour une date donnée.
 * Utilisé uniquement pour construire des identifiants stables (ex: groupement journalier).
 */
function calendarDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

/**
 * Cooldowns par resourceType (fenêtre glissante en jours).
 * Les alertes critiques gardent 1 jour. Les rappels à faible urgence ont un cooldown étendu
 * pour éviter de polluer la liste avec des signaux qui ne changent pas rapidement.
 */
const NOTIFICATION_COOLDOWN_DAYS: Record<string, number> = {
  FEED_STOCK:                   2,
  MEDICINE_STOCK:               3,
  MEDICINE_STOCK_EXPIRY:        7,
  BATCH:                        2,
  BATCH_VACCINATION_REMINDER:   3,
  INVOICE_OVERDUE:              3,
  FARM_WEATHER:                 1,
  DAILY_RECORD_MISSING:         1,
  DAILY_RECORD:                 1,
  FEED_STOCK_RUPTURE:           1,
  MEDICINE_STOCK_RUPTURE:       1,
  BATCH_MORTALITY_PREDICTIVE:   1,
  BATCH_MARGIN_PREDICTIVE:      1,
}

function getCooldownStart(resourceType: string): Date {
  const days = NOTIFICATION_COOLDOWN_DAYS[resourceType] ?? 1
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

/**
 * Crée une notification uniquement si aucune notification identique n'existe
 * dans la fenêtre de cooldown propre au resourceType.
 *
 * Clé de déduplication : (type, resourceType, resourceId, userId) dans le cooldown.
 * L'inclusion de resourceType distingue les alertes AUTRE pour un même resourceId
 * (ex : stock bas ET péremption sur le même médicament).
 *
 * Retourne le nombre de notifications créées.
 */
async function createNotificationsIfAbsent(params: {
  organizationId: string
  userIds:        string[]
  type:           NotificationType
  resourceType:   string
  candidates:     NotificationCandidate[]
}): Promise<number> {
  if (params.userIds.length === 0 || params.candidates.length === 0) {
    return 0
  }

  const cooldownStart = getCooldownStart(params.resourceType)
  const resourceIds = [...new Set(params.candidates.map((candidate) => candidate.resourceId))]

  const existing = await prisma.notification.findMany({
    where: {
      organizationId: params.organizationId,
      userId:         { in: params.userIds },
      type:           params.type,
      resourceType:   params.resourceType,
      resourceId:     { in: resourceIds },
      status:         { in: [NotificationStatus.NON_LU, NotificationStatus.LU] },
      createdAt:      { gte: cooldownStart },
    },
    select: { userId: true, resourceId: true },
  })

  const existingKeys = new Set(
    existing.map((notification) => `${notification.userId}:${notification.resourceId ?? ""}`),
  )

  const toCreate = params.userIds.flatMap((userId) => (
    params.candidates
      .filter((candidate) => !existingKeys.has(`${userId}:${candidate.resourceId}`))
      .map((candidate) => ({
        organizationId: params.organizationId,
        userId,
        type: params.type,
        title: candidate.title,
        message: candidate.message,
        resourceType: params.resourceType,
        resourceId: candidate.resourceId,
        ...(candidate.metadata !== undefined
          ? { metadata: candidate.metadata as Prisma.InputJsonValue }
          : {}),
      }))
  ))

  if (toCreate.length === 0) {
    return 0
  }

  const result = await prisma.notification.createMany({
    data: toCreate,
  })

  return result.count
}

async function checkFeedStockAlerts(
  organizationId: string,
  userIds:        string[],
): Promise<number> {
  const stocks = await prisma.feedStock.findMany({
    where:  { organizationId, alertThresholdKg: { gt: 0 } },
    select: {
      id:               true,
      name:             true,
      quantityKg:       true,
      alertThresholdKg: true,
      feedType:         { select: { name: true } },
    },
  })

  const belowThreshold = stocks.filter((s) => s.quantityKg <= s.alertThresholdKg)

  return createNotificationsIfAbsent({
    organizationId,
    userIds,
    type: NotificationType.STOCK_ALIMENT_CRITIQUE,
    resourceType: "FEED_STOCK",
    candidates: belowThreshold.map((stock) => ({
      title: "Stock aliment critique",
      message:
        `Le stock "${stock.name}" (${stock.feedType.name}) est a ` +
        `${stock.quantityKg.toFixed(1)} kg, sous le seuil d'alerte ` +
        `de ${stock.alertThresholdKg.toFixed(1)} kg.`,
      resourceId: stock.id,
      metadata: {
        quantityKg: stock.quantityKg,
        alertThresholdKg: stock.alertThresholdKg,
      },
    })),
  })
}

/**
 * Signal 2 — Stock médicament sous seuil.
 * Utilise NotificationType.AUTRE (pas de type dédié dans l'enum du schéma).
 * resourceType = "MEDICINE_STOCK" permet de distinguer dans l'UI et la déduplication.
 */
async function checkMedicineStockAlerts(
  organizationId: string,
  userIds:        string[],
): Promise<number> {
  const stocks = await prisma.medicineStock.findMany({
    where:  { organizationId, alertThreshold: { gt: 0 } },
    select: {
      id:             true,
      name:           true,
      quantityOnHand: true,
      alertThreshold: true,
      unit:           true,
    },
  })

  const belowThreshold = stocks.filter((s) => s.quantityOnHand <= s.alertThreshold)

  return createNotificationsIfAbsent({
    organizationId,
    userIds,
    type: NotificationType.AUTRE,
    resourceType: "MEDICINE_STOCK",
    candidates: belowThreshold.map((stock) => ({
      title: "Stock medicament bas",
      message:
        `Le stock de "${stock.name}" est a ${stock.quantityOnHand} ${stock.unit}, ` +
        `sous le seuil d'alerte de ${stock.alertThreshold} ${stock.unit}.`,
      resourceId: stock.id,
      metadata: {
        quantityOnHand: stock.quantityOnHand,
        alertThreshold: stock.alertThreshold,
        unit: stock.unit,
      },
    })),
  })
}

/**
 * Signal 3 — Médicament proche de la péremption (< 30 jours).
 * N'alerte que si le stock est non vide (quantityOnHand > 0).
 * resourceType = "MEDICINE_STOCK_EXPIRY" pour distinguer du signal "stock bas"
 * sur le même médicament dans la déduplication anti-spam.
 */
async function checkMedicineExpiryAlerts(
  organizationId: string,
  userIds:        string[],
): Promise<number> {
  const now         = new Date()
  const warningDate = new Date()
  warningDate.setDate(warningDate.getDate() + 30)

  const stocks = await prisma.medicineStock.findMany({
    where: {
      organizationId,
      quantityOnHand: { gt: 0 },
      expiryDate:     { lte: warningDate, gte: now },
    },
    select: {
      id:             true,
      name:           true,
      expiryDate:     true,
      quantityOnHand: true,
      unit:           true,
    },
  })

  const candidates = stocks.flatMap((stock) => {
    if (!stock.expiryDate) return []

    const daysLeft = Math.ceil(
      (stock.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    )

    return [{
      title: "Medicament proche de la peremption",
      message:
        `"${stock.name}" (${stock.quantityOnHand} ${stock.unit}) expire dans ` +
        `${daysLeft} jour${daysLeft > 1 ? "s" : ""}.`,
      resourceId: stock.id,
      metadata: {
        daysLeft,
        expiryDate: stock.expiryDate.toISOString(),
        quantityOnHand: stock.quantityOnHand,
        unit: stock.unit,
      },
    }]
  })

  return createNotificationsIfAbsent({
    organizationId,
    userIds,
    type: NotificationType.AUTRE,
    resourceType: "MEDICINE_STOCK_EXPIRY",
    candidates,
  })
}

/**
 * Signal 4 — Saisie journalière manquante.
 *
 * Règle explicite (Ajustement 3) :
 *   On notifie uniquement pour les lots ACTIFS dont la date d'entrée est
 *   strictement antérieure à aujourd'hui (entryDate < début du jour courant UTC).
 *   Un lot créé aujourd'hui ne peut pas avoir de saisie "manquante hier" —
 *   il n'existait pas encore.
 *
 * Regroupement (Ajustement 7) :
 *   Si 1 seul lot manquant → notification individuelle (resourceId = batchId).
 *   Si 2+ lots manquants → notification groupée unique (resourceId = "grouped-{date}").
 *   Le groupement évite l'explosion du nombre de notifications quand plusieurs lots
 *   sont actifs simultanément.
 */
async function checkMissedDailyRecords(
  organizationId: string,
  userIds:        string[],
): Promise<number> {
  const now        = new Date()
  const todayStart = calendarDayStart(now)
  const yesterday  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))

  const activeBatches = await prisma.batch.findMany({
    where: {
      organizationId,
      status:    BatchStatus.ACTIVE,
      deletedAt: null,
      entryDate: { lt: todayStart },
    },
    select: { id: true, number: true },
  })

  if (activeBatches.length === 0) return 0

  const recordedYesterday = await prisma.dailyRecord.findMany({
    where: {
      batchId: { in: activeBatches.map((b) => b.id) },
      date:    yesterday,
    },
    select: { batchId: true },
  })
  const recordedIds = new Set(recordedYesterday.map((r) => r.batchId))

  const missingBatches = activeBatches.filter((b) => !recordedIds.has(b.id))
  if (missingBatches.length === 0) return 0

  const yesterdayLabel = yesterday.toLocaleDateString("fr-SN", {
    weekday: "long",
    day:     "numeric",
    month:   "long",
  })

  // Cas individuel (1 lot) : notification ciblée avec action directe vers le lot
  if (missingBatches.length === 1) {
    const batch = missingBatches[0]
    return createNotificationsIfAbsent({
      organizationId,
      userIds,
      type: NotificationType.AUTRE,
      resourceType: "DAILY_RECORD_MISSING",
      candidates: [{
        title: "Saisie journaliere manquante",
        message: `Aucune saisie enregistree pour le lot ${batch.number} le ${yesterdayLabel}.`,
        resourceId: batch.id,
        metadata: {
          batchNumber: batch.number,
          missingDate: yesterday.toISOString(),
          batchCount: 1,
        },
      }],
    })
  }

  // Cas groupé (2+ lots) : une seule notification pour éviter le bruit
  const dateKey = `${yesterday.getUTCFullYear()}-${String(yesterday.getUTCMonth() + 1).padStart(2, "0")}-${String(yesterday.getUTCDate()).padStart(2, "0")}`
  const batchList = missingBatches.map((b) => b.number).join(", ")
  const groupedResourceId = `grouped-${dateKey}`

  return createNotificationsIfAbsent({
    organizationId,
    userIds,
    type: NotificationType.AUTRE,
    resourceType: "DAILY_RECORD_MISSING",
    candidates: [{
      title: `${missingBatches.length} lots sans saisie hier`,
      message: `Aucune saisie enregistree pour ${missingBatches.length} lots le ${yesterdayLabel} : ${batchList}.`,
      resourceId: groupedResourceId,
      metadata: {
        batchCount: missingBatches.length,
        batchNumbers: missingBatches.map((b) => b.number),
        missingDate: yesterday.toISOString(),
      },
    }],
  })
}

/**
 * Signal 5 — Motif de mortalité manquant (3 jours consécutifs).
 *
 * Condition : lot ACTIF avec DailyRecord.mortality > 0 sur les 3 derniers jours
 * complets (J-3 à J-1) et aucune MortalityRecord associée (details absents).
 * Si les 3 jours sont présents et sans motif : alerte déclenchée.
 *
 * resourceType/resourceId (Ajustement 4) :
 *   Le problème porte sur le lot, pas sur un DailyRecord isolé.
 *   resourceType = "BATCH", resourceId = batchId.
 *   La déduplication anti-spam est donc par lot et par jour calendaire.
 */
async function checkHighMortalityAlerts(
  organizationId: string,
  userIds: string[],
): Promise<number> {
  const now = new Date()
  const yesterday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - 1,
  ))

  const records = await prisma.dailyRecord.findMany({
    where: {
      organizationId,
      date: yesterday,
      mortality: { gt: 0 },
      batch: {
        status: BatchStatus.ACTIVE,
        deletedAt: null,
      },
    },
    select: {
      id: true,
      mortality: true,
      batch: {
        select: {
          id: true,
          number: true,
          entryCount: true,
        },
      },
    },
  })

  const candidates = records.flatMap((record) => {
    if (record.batch.entryCount <= 0) return []

    const mortalityRate = record.mortality / record.batch.entryCount
    if (mortalityRate < KPI_THRESHOLDS.MORTALITY_DAILY_WARNING_RATE) {
      return []
    }

    return [{
      title: "Mortalite anormale detectee",
      message:
        `Le lot ${record.batch.number} a enregistre ${record.mortality} mort(s) hier ` +
        `(${(mortalityRate * 100).toFixed(1)}% du lot).`,
      resourceId: record.id,
      metadata: {
        batchId: record.batch.id,
        batchNumber: record.batch.number,
        mortality: record.mortality,
        mortalityRate,
        threshold: KPI_THRESHOLDS.MORTALITY_DAILY_WARNING_RATE,
      },
    }]
  })

  return createNotificationsIfAbsent({
    organizationId,
    userIds,
    type: NotificationType.MORTALITE_ELEVEE,
    resourceType: "DAILY_RECORD",
    candidates,
  })
}

async function checkMissingMortalityReasons(
  organizationId: string,
  userIds:        string[],
): Promise<number> {
  const now          = new Date()
  const yesterday    = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
  const threeDaysAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3))

  const records = await prisma.dailyRecord.findMany({
    where: {
      organizationId,
      mortality:        { gt: 0 },
      date:             { gte: threeDaysAgo, lte: yesterday },
      mortalityRecords: { none: {} },
      batch: {
        status:    BatchStatus.ACTIVE,
        deletedAt: null,
      },
    },
    select: {
      batchId: true,
      batch:   { select: { number: true } },
    },
  })

  const batchCount = new Map<string, { count: number; number: string }>()
  for (const record of records) {
    const entry = batchCount.get(record.batchId)
    if (entry) {
      entry.count++
    } else {
      batchCount.set(record.batchId, { count: 1, number: record.batch.number })
    }
  }

  const alertBatches = Array.from(batchCount.entries())
    .filter(([, data]) => data.count >= 3)
    .map(([batchId, data]) => ({ batchId, ...data }))

  return createNotificationsIfAbsent({
    organizationId,
    userIds,
    type: NotificationType.MOTIF_MORTALITE_MANQUANT,
    resourceType: "BATCH",
    candidates: alertBatches.map((batch) => ({
      title: "Motif de mortalite non renseigne",
      message:
        `Le lot ${batch.number} a enregistre des mortalites sur ` +
        `3 jours consecutifs sans motif renseigne.`,
      resourceId: batch.batchId,
      metadata: { batchNumber: batch.number, daysCount: batch.count },
    })),
  })
}

// ---------------------------------------------------------------------------
// 1. getNotifications// ---------------------------------------------------------------------------
// 1. getNotifications
// ---------------------------------------------------------------------------

/**
 * Retourne les notifications de l'utilisateur courant pour une organisation.
 * Filtrables par statut. Pagination cursor-based sur createdAt desc.
 *
 * Sécurité : requireSession + requireMembership(organizationId).
 * userId déduit de la session — jamais fourni par le client.
 */
export async function getNotifications(
  data: unknown,
): Promise<ActionResult<NotificationSummary[]>> {
  try {
    const parsed = getNotificationsSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, status, cursorDate, limit } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "DASHBOARD")
    if (!accessResult.success) return accessResult
    const userId = accessResult.data.session.user.id

    const subscription = await getOrganizationSubscription(organizationId)
    const notifications = await prisma.notification.findMany({
      where: {
        userId,
        organizationId,
        ...(status     ? { status }                       : {}),
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
      },
      select:  notificationSelect,
      orderBy: { createdAt: "desc" },
      take:    limit,
    })

    const decoratedNotifications = notifications.map((notification) => (
      decorateNotification(notification)
    ))

    const canSeePredictiveStock = resolveEntitlementGate(
      subscription,
      "PREDICTIVE_STOCK_ALERTS",
      { hasMinimumData: true, previewEnabled: true },
    ).access === "full"
    const canSeePredictiveHealth = resolveEntitlementGate(
      subscription,
      "PREDICTIVE_HEALTH_ALERTS",
      { hasMinimumData: true, previewEnabled: true },
    ).access === "full"
    const canSeePredictiveMargin = resolveEntitlementGate(
      subscription,
      "PREDICTIVE_MARGIN_ALERTS",
      { hasMinimumData: true, previewEnabled: true },
    ).access === "full"

    const filteredNotifications = decoratedNotifications.filter((notification) => {
      if (notification.resourceType === "FEED_STOCK_RUPTURE" || notification.resourceType === "MEDICINE_STOCK_RUPTURE") {
        return canSeePredictiveStock
      }
      if (notification.resourceType === "BATCH_MORTALITY_PREDICTIVE") {
        return canSeePredictiveHealth
      }
      if (notification.resourceType === "BATCH_MARGIN_PREDICTIVE") {
        return canSeePredictiveMargin
      }
      return true
    })

    // Tri par priorité : high → medium → low, puis par date décroissante
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
    let sortedNotifications = [...filteredNotifications].sort((a, b) => {
      const aOrder = priorityOrder[a.priority ?? "low"] ?? 2
      const bOrder = priorityOrder[b.priority ?? "low"] ?? 2
      if (aOrder !== bOrder) return aOrder - bOrder
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    // Détection de persistance (isRecurring) + calcul de tendance (window-based).
    //
    // Une seule requête Prisma sur 14 jours (hors dernières 24h) :
    //   • isRecurring = vrai si au moins un signal apparaît dans la fenêtre 1–7 jours.
    //   • trend       = comparaison de deux demi-fenêtres sur les signaux disponibles.
    //     Requiert au moins 2 signaux antérieurs avec métrique valide pour chaque clé.
    const resourceTypesInList = [...new Set(
      sortedNotifications.map((n) => n.resourceType).filter((t): t is string => t !== null),
    )]
    const resourceIdsInList = [...new Set(
      sortedNotifications.map((n) => n.resourceId).filter((id): id is string => id !== null),
    )]

    if (resourceTypesInList.length > 0 && resourceIdsInList.length > 0) {
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      const sevenDaysAgo    = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000)
      const oneDayAgo       = new Date(Date.now() -      24 * 60 * 60 * 1000)

      // Fenêtre étendue à 14 jours pour accumuler assez de points de mesure par signal.
      // orderBy desc → les signaux les plus récents arrivent en premier dans chaque groupe.
      const allPriorSignals = await prisma.notification.findMany({
        where: {
          userId,
          organizationId,
          resourceType: { in: resourceTypesInList },
          resourceId:   { in: resourceIdsInList },
          createdAt:    { gte: fourteenDaysAgo, lt: oneDayAgo },
        },
        select:  { resourceType: true, resourceId: true, metadata: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      })

      // Grouper par clé (resourceType:resourceId), ordre décroissant préservé.
      const priorSignalsByKey = new Map<string, Array<{ metadata: unknown; createdAt: Date }>>()
      for (const s of allPriorSignals) {
        const key = `${s.resourceType}:${s.resourceId}`
        const bucket = priorSignalsByKey.get(key)
        if (bucket) bucket.push(s)
        else priorSignalsByKey.set(key, [s])
      }

      // isRecurring : au moins un signal dans la fenêtre 1–7 jours
      const recurringKeys = new Set<string>()
      for (const [key, signals] of priorSignalsByKey.entries()) {
        if (signals.some((s) => new Date(s.createdAt) >= sevenDaysAgo)) {
          recurringKeys.add(key)
        }
      }

      sortedNotifications = sortedNotifications.map((n) => {
        const key =
          n.resourceType !== null && n.resourceId !== null
            ? `${n.resourceType}:${n.resourceId}`
            : null
        const isRecurring = key !== null ? recurringKeys.has(key) : false

        let trend: "worsening" | "stable" | "improving" | undefined
        if (isRecurring && key !== null && n.resourceType !== null) {
          const priorSignals = priorSignalsByKey.get(key) ?? []
          const currentMetaObj =
            n.metadata !== null && typeof n.metadata === "object"
              ? (n.metadata as Record<string, unknown>)
              : null
          const priorMetaObjs = priorSignals
            .map((s) => s.metadata)
            .filter((m): m is Record<string, unknown> => m !== null && typeof m === "object")
          if (currentMetaObj !== null) {
            trend = calculateWindowTrend(n.resourceType, currentMetaObj, priorMetaObjs)
          }
        }

        // Adapter le label d'action si le signal s'aggrave sur une alerte critique
        const worseningLabel =
          trend === "worsening" && n.priority === "high"
            ? getWorseningActionLabel(n.resourceType)
            : undefined

        return {
          ...n,
          isRecurring,
          trend,
          ...(worseningLabel !== undefined ? { actionLabel: worseningLabel } : {}),
        }
      })
    }

    return { success: true, data: sortedNotifications }
  } catch {
    return { success: false, error: "Impossible de récupérer les notifications" }
  }
}

// ---------------------------------------------------------------------------
// 2. getUnreadCount
// ---------------------------------------------------------------------------

/**
 * Retourne le nombre de notifications NON_LU de l'utilisateur courant.
 * Utilisé pour le badge dans le header (icône cloche).
 *
 * Sécurité : requireSession + requireMembership(organizationId).
 */
export async function getUnreadCount(
  data: unknown,
): Promise<ActionResult<number>> {
  try {
    const parsed = getUnreadCountSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "DASHBOARD")
    if (!accessResult.success) return accessResult
    const userId = accessResult.data.session.user.id

    const count = await prisma.notification.count({
      where: { userId, organizationId, status: NotificationStatus.NON_LU },
    })

    return { success: true, data: count }
  } catch {
    return { success: false, error: "Impossible de récupérer le compteur de notifications" }
  }
}

export async function getNotificationTeasers(
  data: unknown,
): Promise<ActionResult<NotificationTeaser[]>> {
  try {
    const parsed = getUnreadCountSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const { organizationId } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "DASHBOARD")
    if (!accessResult.success) return accessResult

    const subscription = await getOrganizationSubscription(organizationId)

    const [activeBatches, feedStockCount, medicineStockCount] = await Promise.all([
      prisma.batch.findMany({
        where: {
          organizationId,
          status: BatchStatus.ACTIVE,
          deletedAt: null,
        },
        select: {
          id: true,
          number: true,
          _count: { select: { dailyRecords: true } },
        },
        take: 10,
      }),
      prisma.feedStock.count({ where: { organizationId } }),
      prisma.medicineStock.count({ where: { organizationId } }),
    ])

    const hasPredictiveBatchData = activeBatches.some((batch) => batch._count.dailyRecords >= 3)
    const hasStockData = feedStockCount > 0 || medicineStockCount > 0

    const mortalityGate = resolveEntitlementGate(subscription, "PREDICTIVE_HEALTH_ALERTS", {
      hasMinimumData: hasPredictiveBatchData,
      previewEnabled: hasPredictiveBatchData,
    })
    const marginGate = resolveEntitlementGate(subscription, "PREDICTIVE_MARGIN_ALERTS", {
      hasMinimumData: hasPredictiveBatchData,
      previewEnabled: hasPredictiveBatchData,
    })
    const stockGate = resolveEntitlementGate(subscription, "PREDICTIVE_STOCK_ALERTS", {
      hasMinimumData: hasStockData,
      previewEnabled: hasStockData,
    })

    const teasers: NotificationTeaser[] = []
    if (mortalityGate.access !== "full") {
      const copy = getPremiumSurfaceCopy("mortality", mortalityGate.access)
      teasers.push({
        id: "mortality-alert-teaser",
        title: copy.title,
        message: mortalityGate.reason,
        access: mortalityGate.access,
        priority: "high",
        signalLabel: mortalityGate.access === "preview" ? "Risque mortalite" : "Preparation",
        signalTone: "critical",
        consequence: "Une derive de mortalite peut entamer rapidement la marge du lot.",
        ctaLabel: copy.ctaLabel,
        footerHint: copy.footerHint,
      })
    }

    if (marginGate.access !== "full") {
      const copy = getPremiumSurfaceCopy("margin", marginGate.access)
      teasers.push({
        id: "margin-alert-teaser",
        title: copy.title,
        message: marginGate.reason,
        access: marginGate.access,
        priority: "high",
        signalLabel: marginGate.access === "preview" ? "Derive de marge" : "Preparation",
        signalTone: "critical",
        consequence: "Une projection negative aide a corriger avant que la perte soit reelle.",
        ctaLabel: copy.ctaLabel,
        footerHint: copy.footerHint,
      })
    }

    if (stockGate.access !== "full") {
      teasers.push({
        id: "stock-alert-teaser",
        title: "Eviter une rupture qui coute cher",
        message: stockGate.reason,
        access: stockGate.access,
        priority: "high",
        signalLabel: stockGate.access === "preview" ? "Rupture imminente" : "Preparation",
        signalTone: "warning",
        consequence: "Une rupture d aliment ou de medicament peut casser le rythme du lot et creer une perte evitable.",
        ctaLabel:
          stockGate.access === "blocked"
            ? "Continuer la saisie pour activer cette lecture"
            : "Passer a Pro pour anticiper la rupture",
        footerHint: "Les rappels simples restent visibles. Pro debloque la lecture actionnable sur les ruptures.",
      })
    }

    return { success: true, data: teasers.slice(0, 3) }
  } catch {
    return { success: false, error: "Impossible de preparer les teasers d alertes" }
  }
}

// ---------------------------------------------------------------------------
// 3. markNotificationRead
// ---------------------------------------------------------------------------

/**
 * Passe une notification de NON_LU à LU et renseigne readAt.
 * Vérifie l'appartenance à l'utilisateur courant avant toute modification.
 * Idempotent : si déjà LU, la mise à jour est sans effet visible.
 *
 * Sécurité : requireSession + requireMembership(organizationId).
 */
export async function markNotificationRead(
  data: unknown,
): Promise<ActionResult<void>> {
  try {
    const parsed = markNotificationReadSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, notificationId } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "DASHBOARD")
    if (!accessResult.success) return accessResult
    const userId = accessResult.data.session.user.id

    // Vérifier que la notification appartient bien à cet utilisateur
    const notification = await prisma.notification.findFirst({
      where:  { id: notificationId, userId, organizationId },
      select: { id: true },
    })
    if (!notification) {
      return { success: false, error: "Notification introuvable" }
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data:  { status: NotificationStatus.LU, readAt: new Date() },
    })

    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Impossible de marquer la notification comme lue" }
  }
}

// ---------------------------------------------------------------------------
// 4. markAllNotificationsRead
// ---------------------------------------------------------------------------

/**
 * Passe toutes les notifications NON_LU de l'utilisateur → LU en une seule opération.
 * Retourne le nombre de notifications effectivement mises à jour.
 *
 * Sécurité : requireSession + requireMembership(organizationId).
 */
export async function markAllNotificationsRead(
  data: unknown,
): Promise<ActionResult<{ count: number }>> {
  try {
    const parsed = markAllNotificationsReadSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "DASHBOARD")
    if (!accessResult.success) return accessResult
    const userId = accessResult.data.session.user.id

    const result = await prisma.notification.updateMany({
      where: { userId, organizationId, status: NotificationStatus.NON_LU },
      data:  { status: NotificationStatus.LU, readAt: new Date() },
    })

    return { success: true, data: { count: result.count } }
  } catch {
    return { success: false, error: "Impossible de marquer les notifications comme lues" }
  }
}

// ---------------------------------------------------------------------------
// 5. archiveNotification
// ---------------------------------------------------------------------------

/**
 * Archive une notification (ARCHIVE), quel que soit son statut actuel.
 * Une notification archivée n'apparaît plus dans la liste principale.
 * Vérifie l'appartenance à l'utilisateur courant.
 *
 * Sécurité : requireSession + requireMembership(organizationId).
 */
export async function archiveNotification(
  data: unknown,
): Promise<ActionResult<void>> {
  try {
    const parsed = archiveNotificationSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, notificationId } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "DASHBOARD")
    if (!accessResult.success) return accessResult
    const userId = accessResult.data.session.user.id

    const notification = await prisma.notification.findFirst({
      where:  { id: notificationId, userId, organizationId },
      select: { id: true },
    })
    if (!notification) {
      return { success: false, error: "Notification introuvable" }
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data:  { status: NotificationStatus.ARCHIVE },
    })

    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Impossible d'archiver la notification" }
  }
}

// ---------------------------------------------------------------------------
// 6. generateNotifications
// ---------------------------------------------------------------------------

/**
 * Évalue les signaux métier et crée les notifications manquantes.
 *
 * Peut être appelée par tout membre actif de l'organisation.
 * Génère des notifications pour les membres OWNER et MANAGER de l'organisation.
 *
 * Signaux évalués (dans l'ordre) :
 *   1. STOCK_ALIMENT_CRITIQUE   — stock aliment sous seuil
 *   2. MEDICINE_STOCK           — stock médicament sous seuil
 *   3. MEDICINE_STOCK_EXPIRY    — médicament périmant dans 30 jours
 *   4. DAILY_RECORD_MISSING     — saisie absente pour les lots actifs existant hier
 *   5. MOTIF_MORTALITE_MANQUANT — 3 jours consécutifs de mortalité sans motif
 *
 * Idempotence : anti-spam par jour calendaire UTC — aucun doublon dans la journée.
 *
 * Robustesse (Ajustement 2) :
 *   Chaque signal est évalué dans son propre try/catch indépendant.
 *   Une erreur sur un signal n'impacte jamais les autres.
 *   Le total retourné (`created`) exclut les signaux en erreur.
 *
 * Retourne : { created: number } — nombre total de nouvelles notifications créées.
 * Pas d'audit log — génération système, pas une action utilisateur.
 *
 * Sécurité : requireSession + requireMembership(organizationId).
 */
export async function generateNotifications(
  data: unknown,
): Promise<ActionResult<{ created: number }>> {
  try {
    const parsed = generateNotificationsSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "DASHBOARD")
    if (!accessResult.success) return accessResult

    const result = await generateNotificationsForOrganization(organizationId)
    return { success: true, data: { created: result.created } }
  } catch {
    return { success: false, error: "Impossible de générer les notifications" }
  }
}

export async function generateNotificationsForOrganization(
  organizationId: string,
): Promise<{ created: number; targetUserIds: string[] }> {
  // Cibler les membres SUPER_ADMIN, OWNER et MANAGER actifs (non soft-deleted)
  const targetMembers = await prisma.userOrganization.findMany({
    where: {
      organizationId,
      role:    { in: [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER] },
      user:    { deletedAt: null },
    },
    select: { userId: true },
  })

  if (targetMembers.length === 0) {
    return { created: 0, targetUserIds: [] }
  }

  const userIds = targetMembers.map((m) => m.userId)
  let totalCreated = 0

  // Auto-archival silencieux : archiver les notifications LU datant de plus de 14 jours
  // pour garder la liste lisible sans intervention manuelle de l'utilisateur.
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  try {
    await prisma.notification.updateMany({
      where: {
        organizationId,
        status:    NotificationStatus.LU,
        createdAt: { lt: fourteenDaysAgo },
      },
      data: { status: NotificationStatus.ARCHIVE },
    })
  } catch {
    // Silencieux — nettoyage non critique, ne bloque pas la génération
  }

  const subscription = await getOrganizationSubscription(organizationId)
  const canSeePredictiveStock = resolveEntitlementGate(subscription, "PREDICTIVE_STOCK_ALERTS", {
    hasMinimumData: true,
    previewEnabled: true,
  }).access === "full"
  const canSeePredictiveHealth = resolveEntitlementGate(subscription, "PREDICTIVE_HEALTH_ALERTS", {
    hasMinimumData: true,
    previewEnabled: true,
  }).access === "full"
  const canSeePredictiveMargin = resolveEntitlementGate(subscription, "PREDICTIVE_MARGIN_ALERTS", {
    hasMinimumData: true,
    previewEnabled: true,
  }).access === "full"

  // Signal 1 — Stock aliment sous seuil (Ajustement 2 : try/catch indépendant)
  try {
    totalCreated += await checkFeedStockAlerts(organizationId, userIds)
  } catch {
    // Erreur silencieuse — ne bloque pas les autres signaux
  }

  // Signal 2 — Stock médicament sous seuil
  try {
    totalCreated += await checkMedicineStockAlerts(organizationId, userIds)
  } catch {
    // Erreur silencieuse
  }

  // Signal 3 — Médicament proche de la péremption
  try {
    totalCreated += await checkMedicineExpiryAlerts(organizationId, userIds)
  } catch {
    // Erreur silencieuse
  }

  // Signal 4 — Saisie journalière manquante (lots existant avant aujourd'hui)
  try {
    totalCreated += await checkMissedDailyRecords(organizationId, userIds)
  } catch {
    // Erreur silencieuse
  }

  // Signal 5 — Motif de mortalité manquant (3 jours consécutifs)
  try {
    totalCreated += await checkHighMortalityAlerts(organizationId, userIds)
  } catch {
    // Erreur silencieuse
  }

  try {
    totalCreated += await checkMissingMortalityReasons(organizationId, userIds)
  } catch {
    // Erreur silencieuse
  }

  // Signal 7 — Rupture stock prédictive (aliment + médicament en critical uniquement)
  if (canSeePredictiveStock) {
    try {
      totalCreated += await checkStockRuptureAlerts(organizationId, userIds)
    } catch {
      // Erreur silencieuse
    }
  }

  if (canSeePredictiveHealth) {
    try {
      totalCreated += await checkBatchMortalityRiskAlerts(organizationId, userIds)
    } catch {
      // Erreur silencieuse
    }
  }

  if (canSeePredictiveMargin) {
    try {
      totalCreated += await checkBatchMarginProjectionAlerts(organizationId, userIds)
    } catch {
      // Erreur silencieuse
    }
  }

  if (canSeePredictiveStock) {
    try {
      const predictions = await getStockPredictionsInternal(organizationId)
      await upsertOrganizationSnapshots(
        prisma,
        organizationId,
        predictions.feed,
        predictions.medicine,
      )
    } catch {
      // Erreur silencieuse — ne bloque pas le cron
    }
  }

  if (canSeePredictiveHealth) {
    try {
      const mortalityPredictions = await getBatchMortalityPredictionsInternal(organizationId)
      await upsertOrganizationBatchMortalitySnapshots(
        prisma,
        organizationId,
        mortalityPredictions,
      )
    } catch {
      // Erreur silencieuse — ne bloque pas le cron
    }
  }

  if (canSeePredictiveMargin) {
    try {
      const marginPredictions = await getBatchMarginPredictionsInternal(organizationId)
      await upsertOrganizationBatchMarginSnapshots(
        prisma,
        organizationId,
        marginPredictions,
      )
    } catch {
      // Erreur silencieuse â€” ne bloque pas le cron
    }
  }

  const canSeeAlerts = hasPlanFeature(subscription.plan, "ALERTS")
  const canSeeAdvancedHealth = hasPlanFeature(subscription.plan, "ADVANCED_HEALTH")

  // Signal 8 — Alertes Météo (Toute l'équipe) — Optionnelle (Plan Pro/Business)
  if (canSeeAlerts) {
    try {
      const allMembers = await prisma.userOrganization.findMany({
        where: {
          organizationId,
          user: { deletedAt: null },
        },
        select: { userId: true },
      })
      const allMemberIds = allMembers.map((m) => m.userId)
      totalCreated += await checkWeatherAlerts(organizationId, allMemberIds)
    } catch {
      // Erreur silencieuse
    }
  }

  // Signal 9 — Rappels de Vaccination (Toute l'équipe) — Optionnelle (Plan Pro/Business)
  if (canSeeAdvancedHealth) {
    try {
      const allMembers = await prisma.userOrganization.findMany({
        where: { organizationId, user: { deletedAt: null } },
        select: { userId: true },
      })
      const allMemberIds = allMembers.map((m) => m.userId)
      totalCreated += await checkVaccinationReminders(organizationId, allMemberIds)
    } catch {
      // Erreur silencieuse
    }
  }

  // Signal 10 — Créances en retard (Propriétaires & Managers uniquement) — Optionnelle (Plan Pro/Business)
  if (canSeeAlerts) {
    try {
      totalCreated += await checkOverdueInvoices(organizationId, userIds)
    } catch {
      // Erreur silencieuse
    }
  }

  return { created: totalCreated, targetUserIds: userIds }
}

// ---------------------------------------------------------------------------
// Signal 7 — Rupture de stock prédictive (critical uniquement)
// ---------------------------------------------------------------------------

/**
 * Génère des notifications pour les stocks aliment et médicament dont la
 * prédiction de rupture est "critical" (daysToStockout <= seuil critique).
 *
 * Seuls les niveaux "critical" sont notifiés ici pour limiter le bruit —
 * les niveaux "warning" sont visibles directement sur la page stock.
 */
async function checkStockRuptureAlerts(
  organizationId: string,
  userIds: string[],
): Promise<number> {
  const predictions = await getStockPredictionsInternal(organizationId)

  // Récupérer les noms des stocks pour construire les messages
  const feedStockIds    = Object.keys(predictions.feed).filter((id) => predictions.feed[id].alertLevel === "critical")
  const medicineStockIds = Object.keys(predictions.medicine).filter((id) => predictions.medicine[id].alertLevel === "critical")

  if (feedStockIds.length === 0 && medicineStockIds.length === 0) return 0

  const [feedStocks, medicineStocks] = await Promise.all([
    feedStockIds.length > 0
      ? prisma.feedStock.findMany({
          where:  { id: { in: feedStockIds }, organizationId },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    medicineStockIds.length > 0
      ? prisma.medicineStock.findMany({
          where:  { id: { in: medicineStockIds }, organizationId },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ])

  const feedNameMap     = Object.fromEntries(feedStocks.map((s) => [s.id, s.name]))
  const medicineNameMap = Object.fromEntries(medicineStocks.map((s) => [s.id, s.name]))

  const feedCandidates = feedStockIds.map((id) => {
    const pred = predictions.feed[id]
    const days = pred.daysToStockout !== null ? Math.round(pred.daysToStockout * 10) / 10 : 0
    return {
      title:      "Rupture aliment imminente",
      message:    `Le stock "${feedNameMap[id] ?? id}" sera epuise dans environ ${days} jour(s) au rythme actuel de consommation.`,
      resourceId: id,
      metadata:   { daysToStockout: days, avgDailyConsumption: pred.avgDailyConsumption },
    }
  })

  const medicineCandidates = medicineStockIds.map((id) => {
    const pred = predictions.medicine[id]
    const days = pred.daysToStockout !== null ? Math.round(pred.daysToStockout * 10) / 10 : 0
    return {
      title:      "Rupture medicament imminente",
      message:    `Le stock "${medicineNameMap[id] ?? id}" sera epuise dans environ ${days} jour(s) au rythme actuel de consommation.`,
      resourceId: id,
      metadata:   { daysToStockout: days, avgDailyConsumption: pred.avgDailyConsumption },
    }
  })

  let created = 0

  if (feedCandidates.length > 0) {
    created += await createNotificationsIfAbsent({
      organizationId,
      userIds,
      type:         NotificationType.STOCK_ALIMENT_CRITIQUE,
      resourceType: "FEED_STOCK_RUPTURE",
      candidates:   feedCandidates,
    })
  }

  if (medicineCandidates.length > 0) {
    created += await createNotificationsIfAbsent({
      organizationId,
      userIds,
      type:         NotificationType.AUTRE,
      resourceType: "MEDICINE_STOCK_RUPTURE",
      candidates:   medicineCandidates,
    })
  }

  return created
}

async function checkBatchMortalityRiskAlerts(
  organizationId: string,
  userIds: string[],
): Promise<number> {
  const predictions = await getBatchMortalityPredictionsInternal(organizationId)
  const criticalBatchIds = Object.keys(predictions).filter((id) => predictions[id].alertLevel === "critical")

  if (criticalBatchIds.length === 0) return 0

  const batches = await prisma.batch.findMany({
    where: {
      organizationId,
      id: { in: criticalBatchIds },
    },
    select: {
      id: true,
      number: true,
    },
  })

  const batchNameMap = Object.fromEntries(batches.map((batch) => [batch.id, batch.number]))

  return createNotificationsIfAbsent({
    organizationId,
    userIds,
    type: NotificationType.MORTALITE_ELEVEE,
    resourceType: "BATCH_MORTALITY_PREDICTIVE",
    candidates: criticalBatchIds.map((batchId) => {
      const prediction = predictions[batchId]
      return {
        title: "Risque mortalite eleve",
        message: `Le lot ${batchNameMap[batchId] ?? batchId} presente un risque eleve sur 7 jours (${prediction.riskScore}/100).`,
        resourceId: batchId,
        metadata: {
          riskScore: prediction.riskScore,
          reasons: prediction.reasons,
          summary: prediction.summary,
        },
      }
    }),
  })
}

async function checkBatchMarginProjectionAlerts(
  organizationId: string,
  userIds: string[],
): Promise<number> {
  const predictions = await getBatchMarginPredictionsInternal(organizationId)
  const negativeBatchIds = Object.keys(predictions).filter((id) => predictions[id].alertLevel === "critical")

  if (negativeBatchIds.length === 0) return 0

  const batches = await prisma.batch.findMany({
    where: {
      organizationId,
      id: { in: negativeBatchIds },
    },
    select: {
      id: true,
      number: true,
    },
  })

  const batchNameMap = Object.fromEntries(batches.map((batch) => [batch.id, batch.number]))

  return createNotificationsIfAbsent({
    organizationId,
    userIds,
    type: NotificationType.AUTRE,
    resourceType: "BATCH_MARGIN_PREDICTIVE",
    candidates: negativeBatchIds.map((batchId) => {
      const prediction = predictions[batchId]
      return {
        title: "Projection de marge negative",
        message: `Le lot ${batchNameMap[batchId] ?? batchId} projette une marge negative (${prediction.projectedProfitFcfa} FCFA).`,
        resourceId: batchId,
        metadata: {
          projectedProfitFcfa: prediction.projectedProfitFcfa,
          projectedMarginRate: prediction.projectedMarginRate,
          confidence: prediction.confidence,
          reasons: prediction.reasons,
        },
      }
    }),
  })
}

/**
 * Signal 8 — Alertes Météo Intelligence Artificielle.
 * Scanne les fermes de l'organisation et génère des alertes si les seuils
 * de chaleur ou de pluie sont dépassés.
 * Notifie toute l'équipe (OWNER, MANAGER, TECHNICIAN, etc.).
 */
async function checkWeatherAlerts(
  organizationId: string,
  userIds: string[],
): Promise<number> {
  const farms = await prisma.farm.findMany({
    where: { organizationId, deletedAt: null, latitude: { not: null }, longitude: { not: null } },
    select: { id: true, name: true, latitude: true, longitude: true },
  })

  if (farms.length === 0) return 0

  const HEAT_THRESHOLD = 33
  const RAIN_THRESHOLD = 40
  const candidates: NotificationCandidate[] = []

  for (const farm of farms) {
    try {
      const weather = await fetchLocalWeather(farm.latitude!, farm.longitude!)
      if (!weather) continue

      if (weather.temperatureMax > HEAT_THRESHOLD) {
        candidates.push({
          title: `Alerte Chaleur : ${farm.name}`,
          message: `Forte chaleur prevue (${weather.temperatureMax}°C). Pensez a bien hydrater vos poulets et a ventiler les batiments.`,
          resourceId: farm.id,
          metadata: { temperatureMax: weather.temperatureMax, type: "HEAT" },
        })
      }

      if (weather.precipitationProbability > RAIN_THRESHOLD) {
        candidates.push({
          title: `Risque de Pluie : ${farm.name}`,
          message: `Risque de pluie eleve (${weather.precipitationProbability}%). Assurez-vous que la ferme est bien protegee.`,
          resourceId: farm.id,
          metadata: { precipitationProbability: weather.precipitationProbability, type: "RAIN" },
        })
      }
    } catch (error) {
      console.error(`Failed to check weather for farm ${farm.id}`, error)
    }
  }

  if (candidates.length === 0) return 0

  return createNotificationsIfAbsent({
    organizationId,
    userIds,
    type: NotificationType.ALERTE_METEO,
    resourceType: "FARM_WEATHER",
    candidates,
  })
}

/**
 * Signal 9 — Rappels de Vaccination.
 * Alerte si un lot atteint l'âge d'un vaccin prévu dans son plan vaccinal
 * et que celui-ci n'a pas encore été enregistré.
 */
async function checkVaccinationReminders(
  organizationId: string,
  userIds: string[],
): Promise<number> {
  const activeBatches = await prisma.batch.findMany({
    where: { organizationId, status: BatchStatus.ACTIVE, deletedAt: null },
    select: { id: true, number: true, type: true, entryDate: true, entryAgeDay: true },
  })

  if (activeBatches.length === 0) return 0

  const todayStr = new Date().toISOString().split("T")[0]
  const candidates: NotificationCandidate[] = []

  for (const batch of activeBatches) {
    try {
      // 1. Calculer l'âge actuel du lot
      const diffTime = Math.abs(new Date().getTime() - new Date(batch.entryDate).getTime())
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
      const currentAge = batch.entryAgeDay + diffDays

      // 2. Trouver les plans vaccinaux actifs pour ce type de lot (J et J+1)
      const plans = await prisma.vaccinationPlan.findMany({
        where: { organizationId, batchType: batch.type, isActive: true },
        include: {
          items: {
            where: { dayOfAge: { in: [currentAge, currentAge + 1] } },
          },
        },
      })

      for (const plan of plans) {
        for (const item of plan.items) {
          const isTomorrow = item.dayOfAge === currentAge + 1

          // 3. Vérifier si une vaccination a déjà été enregistrée pour ce vaccin
          // Pour J-1, on ne vérifie pas "déjà fait aujourd'hui" car c'est pour demain.
          // Mais pour Jour J, on vérifie si c'est déjà fait.
          if (!isTomorrow) {
            const alreadyDone = await prisma.vaccinationRecord.findFirst({
              where: {
                batchId: batch.id,
                vaccineName: item.vaccineName,
                date: new Date(todayStr),
              },
            })
            if (alreadyDone) continue
          }

          candidates.push({
            title: isTomorrow
              ? `Vaccination Demain : ${batch.number}`
              : `Vaccination Aujourd'hui : ${batch.number}`,
            message: isTomorrow
              ? `Vaccin ${item.vaccineName} prevu demain (J${item.dayOfAge}) pour le lot ${batch.number}.`
              : `Vaccin ${item.vaccineName} prevu aujourd'hui (J${item.dayOfAge}) pour le lot ${batch.number}.`,
            // On inclut dayOfAge dans le resourceId pour permettre les rappels successifs (J-1 puis J)
            resourceId: `${batch.id}:${item.vaccineName}:${item.dayOfAge}`,
            metadata: { vaccineName: item.vaccineName, dayOfAge: item.dayOfAge, isTomorrow },
          })
        }
      }
    } catch (error) {
      console.error(`Failed to check vaccination for batch ${batch.id}`, error)
    }
  }

  if (candidates.length === 0) return 0

  return createNotificationsIfAbsent({
    organizationId,
    userIds,
    type: NotificationType.RETARD_VACCINATION,
    resourceType: "BATCH_VACCINATION_REMINDER",
    candidates,
  })
}

/**
 * Signal 10 — Factures de vente impayées à l'échéance.
 */
async function checkOverdueInvoices(
  organizationId: string,
  userIds: string[],
): Promise<number> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const overdueInvoices = await prisma.invoice.findMany({
    where: {
      organizationId,
      type: "VENTE",
      status: { not: "PAYEE" },
      dueDate: { lte: today },
    },
    include: { customer: { select: { name: true } } },
  })

  if (overdueInvoices.length === 0) return 0

  const candidates = overdueInvoices.map((inv) => ({
    title: `Facture impayee : ${inv.number}`,
    message: `La facture ${inv.number} pour ${inv.customer?.name ?? "Client inconnu"} est arrivee a echeance (${inv.totalFcfa - inv.paidFcfa} FCFA restant).`,
    resourceId: inv.id,
    metadata: { invoiceNumber: inv.number, totalFcfa: inv.totalFcfa, paidFcfa: inv.paidFcfa },
  }))

  return createNotificationsIfAbsent({
    organizationId,
    userIds,
    type: NotificationType.CREANCE_EN_RETARD,
    resourceType: "INVOICE_OVERDUE",
    candidates,
  })
}
