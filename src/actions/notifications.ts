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
 * Anti-spam — une seule notification par jour calendaire (Ajustement 1) :
 *   Règle explicite : un seul enregistrement par (type, resourceType, resourceId, userId)
 *   et par jour calendaire UTC. "Jour calendaire" = de 00:00:00 UTC à 23:59:59 UTC.
 *   NB : ce n'est PAS une fenêtre glissante de 24h. Un nouveau jour calendaire reset
 *   la déduplication, même si la notification a été créée à 23:59 la veille.
 *
 * Robustesse des check* (Ajustement 2) :
 *   Chaque signal est évalué dans son propre try/catch.
 *   Une erreur sur un signal ne bloque jamais les autres.
 *
 * Types de notification utilisés :
 *   STOCK_ALIMENT_CRITIQUE   → stock aliment sous seuil (resourceType: FEED_STOCK)
 *   AUTRE + MEDICINE_STOCK   → stock médicament sous seuil
 *   AUTRE + MEDICINE_STOCK_EXPIRY → médicament proche péremption (< 30 jours)
 *   AUTRE + DAILY_RECORD_MISSING  → saisie journalière absente
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
  requireSession,
  requireMembership,
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

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

/**
 * Début du jour calendaire UTC pour une date donnée.
 * Anti-spam : la déduplication est basée sur ce jour, pas sur une fenêtre glissante.
 */
function calendarDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

/**
 * Crée une notification uniquement si aucune notification identique n'existe
 * déjà pour ce jour calendaire UTC.
 *
 * Clé de déduplication : (type, resourceType, resourceId, userId, jour calendaire).
 * L'inclusion de resourceType distingue les alertes AUTRE pour un même resourceId
 * (ex : stock bas ET péremption sur le même médicament).
 *
 * Retourne true si la notification a été créée, false si déjà existante.
 */
async function createNotificationIfAbsent(params: {
  organizationId: string
  userId:         string
  type:           NotificationType
  title:          string
  message:        string
  resourceType?:  string
  resourceId?:    string
  metadata?:      Record<string, unknown>
}): Promise<boolean> {
  const todayStart = calendarDayStart(new Date())

  const existing = await prisma.notification.findFirst({
    where: {
      userId:         params.userId,
      organizationId: params.organizationId,
      type:           params.type,
      resourceType:   params.resourceType ?? null,
      resourceId:     params.resourceId   ?? null,
      status:         { in: [NotificationStatus.NON_LU, NotificationStatus.LU] },
      createdAt:      { gte: todayStart },
    },
    select: { id: true },
  })

  if (existing) return false

  await prisma.notification.create({
    data: {
      organizationId: params.organizationId,
      userId:         params.userId,
      type:           params.type,
      title:          params.title,
      message:        params.message,
      resourceType:   params.resourceType ?? null,
      resourceId:     params.resourceId   ?? null,
      ...(params.metadata !== undefined ? { metadata: params.metadata as Prisma.InputJsonValue } : {}),
    },
  })

  return true
}

// ---------------------------------------------------------------------------
// Générateurs de signaux (helpers privés)
// ---------------------------------------------------------------------------

/**
 * Signal 1 — Stock aliment sous seuil.
 * Alerte si quantityKg <= alertThresholdKg (seuil > 0 requis pour éviter le bruit).
 * Prisma ne supporte pas la comparaison field-to-field : filtrage en mémoire.
 */
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

  let created = 0
  for (const stock of belowThreshold) {
    for (const userId of userIds) {
      const wasCreated = await createNotificationIfAbsent({
        organizationId,
        userId,
        type:         NotificationType.STOCK_ALIMENT_CRITIQUE,
        title:        "Stock aliment critique",
        message:
          `Le stock "${stock.name}" (${stock.feedType.name}) est à ` +
          `${stock.quantityKg.toFixed(1)} kg, sous le seuil d'alerte ` +
          `de ${stock.alertThresholdKg.toFixed(1)} kg.`,
        resourceType: "FEED_STOCK",
        resourceId:   stock.id,
        metadata:     {
          quantityKg:       stock.quantityKg,
          alertThresholdKg: stock.alertThresholdKg,
        },
      })
      if (wasCreated) created++
    }
  }

  return created
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

  let created = 0
  for (const stock of belowThreshold) {
    for (const userId of userIds) {
      const wasCreated = await createNotificationIfAbsent({
        organizationId,
        userId,
        type:         NotificationType.AUTRE,
        title:        "Stock médicament bas",
        message:
          `Le stock de "${stock.name}" est à ${stock.quantityOnHand} ${stock.unit}, ` +
          `sous le seuil d'alerte de ${stock.alertThreshold} ${stock.unit}.`,
        resourceType: "MEDICINE_STOCK",
        resourceId:   stock.id,
        metadata:     {
          quantityOnHand: stock.quantityOnHand,
          alertThreshold: stock.alertThreshold,
          unit:           stock.unit,
        },
      })
      if (wasCreated) created++
    }
  }

  return created
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

  let created = 0
  for (const stock of stocks) {
    if (!stock.expiryDate) continue

    const daysLeft = Math.ceil(
      (stock.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    )

    for (const userId of userIds) {
      const wasCreated = await createNotificationIfAbsent({
        organizationId,
        userId,
        type:         NotificationType.AUTRE,
        title:        "Médicament proche de la péremption",
        message:
          `"${stock.name}" (${stock.quantityOnHand} ${stock.unit}) expire dans ` +
          `${daysLeft} jour${daysLeft > 1 ? "s" : ""}.`,
        resourceType: "MEDICINE_STOCK_EXPIRY",
        resourceId:   stock.id,
        metadata:     {
          daysLeft,
          expiryDate:     stock.expiryDate.toISOString(),
          quantityOnHand: stock.quantityOnHand,
          unit:           stock.unit,
        },
      })
      if (wasCreated) created++
    }
  }

  return created
}

/**
 * Signal 4 — Saisie journalière manquante.
 *
 * Règle explicite (Ajustement 3) :
 *   On notifie uniquement pour les lots ACTIFS dont la date d'entrée est
 *   strictement antérieure à aujourd'hui (entryDate < début du jour courant UTC).
 *   Un lot créé aujourd'hui ne peut pas avoir de saisie "manquante hier" —
 *   il n'existait pas encore.
 */
async function checkMissedDailyRecords(
  organizationId: string,
  userIds:        string[],
): Promise<number> {
  const now        = new Date()
  const todayStart = calendarDayStart(now)
  // yesterday = toute la journée d'hier = [hier 00:00 UTC, aujourd'hui 00:00 UTC[
  const yesterday  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))

  // Lots actifs existant avant aujourd'hui (entryDate < todayStart)
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

  // Lots ayant une saisie pour hier
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

  let created = 0
  for (const batch of missingBatches) {
    for (const userId of userIds) {
      const wasCreated = await createNotificationIfAbsent({
        organizationId,
        userId,
        type:         NotificationType.AUTRE,
        title:        "Saisie journalière manquante",
        message:      `Aucune saisie enregistrée pour le lot ${batch.number} le ${yesterdayLabel}.`,
        resourceType: "DAILY_RECORD_MISSING",
        resourceId:   batch.id,
        metadata:     {
          batchNumber: batch.number,
          missingDate: yesterday.toISOString(),
        },
      })
      if (wasCreated) created++
    }
  }

  return created
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
async function checkMissingMortalityReasons(
  organizationId: string,
  userIds:        string[],
): Promise<number> {
  const now          = new Date()
  const yesterday    = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
  const threeDaysAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3))

  // DailyRecords avec mortalité > 0 et aucun motif renseigné dans la fenêtre
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

  // Compter les jours sans motif par lot dans la fenêtre
  const batchCount = new Map<string, { count: number; number: string }>()
  for (const record of records) {
    const entry = batchCount.get(record.batchId)
    if (entry) {
      entry.count++
    } else {
      batchCount.set(record.batchId, { count: 1, number: record.batch.number })
    }
  }

  // La fenêtre est de 3 jours — count === 3 signifie 3 jours consécutifs sans motif
  const alertBatches = Array.from(batchCount.entries())
    .filter(([, data]) => data.count >= 3)
    .map(([batchId, data]) => ({ batchId, ...data }))

  let created = 0
  for (const batch of alertBatches) {
    for (const userId of userIds) {
      const wasCreated = await createNotificationIfAbsent({
        organizationId,
        userId,
        type:         NotificationType.MOTIF_MORTALITE_MANQUANT,
        title:        "Motif de mortalité non renseigné",
        message:
          `Le lot ${batch.number} a enregistré des mortalités sur ` +
          `3 jours consécutifs sans motif renseigné.`,
        resourceType: "BATCH",
        resourceId:   batch.batchId,
        metadata:     { batchNumber: batch.number, daysCount: batch.count },
      })
      if (wasCreated) created++
    }
  }

  return created
}

// ---------------------------------------------------------------------------
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
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = getNotificationsSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, status, cursorDate, limit } = parsed.data
    const userId = sessionResult.data.user.id

    const membershipResult = await requireMembership(userId, organizationId)
    if (!membershipResult.success) return membershipResult

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

    return { success: true, data: notifications }
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
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = getUnreadCountSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId } = parsed.data
    const userId = sessionResult.data.user.id

    const membershipResult = await requireMembership(userId, organizationId)
    if (!membershipResult.success) return membershipResult

    const count = await prisma.notification.count({
      where: { userId, organizationId, status: NotificationStatus.NON_LU },
    })

    return { success: true, data: count }
  } catch {
    return { success: false, error: "Impossible de récupérer le compteur de notifications" }
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
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = markNotificationReadSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, notificationId } = parsed.data
    const userId = sessionResult.data.user.id

    const membershipResult = await requireMembership(userId, organizationId)
    if (!membershipResult.success) return membershipResult

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
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = markAllNotificationsReadSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId } = parsed.data
    const userId = sessionResult.data.user.id

    const membershipResult = await requireMembership(userId, organizationId)
    if (!membershipResult.success) return membershipResult

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
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = archiveNotificationSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, notificationId } = parsed.data
    const userId = sessionResult.data.user.id

    const membershipResult = await requireMembership(userId, organizationId)
    if (!membershipResult.success) return membershipResult

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
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = generateNotificationsSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId } = parsed.data
    const userId = sessionResult.data.user.id

    // Vérifier l'appartenance à l'organisation (Ajustement 5)
    const membershipResult = await requireMembership(userId, organizationId)
    if (!membershipResult.success) return membershipResult

    // Cibler les membres OWNER et MANAGER actifs (non soft-deleted)
    const targetMembers = await prisma.userOrganization.findMany({
      where: {
        organizationId,
        role:    { in: [UserRole.OWNER, UserRole.MANAGER] },
        user:    { deletedAt: null },
      },
      select: { userId: true },
    })

    if (targetMembers.length === 0) {
      return { success: true, data: { created: 0 } }
    }

    const userIds = targetMembers.map((m) => m.userId)
    let totalCreated = 0

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
      totalCreated += await checkMissingMortalityReasons(organizationId, userIds)
    } catch {
      // Erreur silencieuse
    }

    return { success: true, data: { created: totalCreated } }
  } catch {
    return { success: false, error: "Impossible de générer les notifications" }
  }
}
