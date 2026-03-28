/**
 * SunuFarm — Server Actions : gestion des membres d'organisation
 *
 * Périmètre MVP :
 *   - Lister les membres d'une organisation
 *   - Ajouter un utilisateur existant à une organisation (pas d'invitation email)
 *   - Modifier le rôle d'un membre
 *   - Retirer un membre
 *
 * Hors périmètre (V2) :
 *   - Système d'invitation par email
 *   - Mise à jour des farmPermissions (champ JSON)
 *   - Mise à jour des informations de l'organisation (nom, logo, etc.)
 *
 * Pattern de sécurité appliqué à chaque mutation :
 *   1. requireSession()               → authentification
 *   2. Zod safeParse()                → validation entrée
 *   3. requireMembership() + canPerformAction() → autorisation
 *   4. Règle métier spécifique        → cohérence données
 *   5. prisma.$transaction()          → écriture atomique (fonctions sensibles)
 *   6. createAuditLog()               → traçabilité (fire-and-forget)
 *
 * Note sur la concurrence (dernier OWNER) :
 *   Le count + mutation est encapsulé dans $transaction pour réduire la fenêtre
 *   de race condition. PostgreSQL READ COMMITTED (défaut) ne l'élimine pas
 *   totalement — une élimination complète nécessiterait SELECT FOR UPDATE ou
 *   isolation SERIALIZABLE. Ce niveau de protection est acceptable pour le MVP
 *   (équipes de moins de 20 personnes, opérations sur les rôles rares).
 */

"use server"

import { z } from "zod"
import prisma from "@/src/lib/prisma"
import { Prisma } from "@/src/generated/prisma/client"
import {
  requireSession,
  requireMembership,
  requireModuleAccess,
  type ActionResult,
} from "@/src/lib/auth"
import { createAuditLog, AuditAction } from "@/src/lib/audit"
import {
  APP_MODULES,
  canPerformAction,
  parseModulePermissions,
  type AppModule,
} from "@/src/lib/permissions"
import { requiredIdSchema } from "@/src/lib/validators"
import { UserRole } from "@/src/generated/prisma/client"

// ---------------------------------------------------------------------------
// Rôles assignables via les actions d'organisation
//
// SUPER_ADMIN est un rôle plateforme — il ne peut pas être assigné
// via ces actions métier, uniquement via une interface d'administration dédiée.
// ---------------------------------------------------------------------------

const ORG_ASSIGNABLE_ROLES = [
  "OWNER",
  "MANAGER",
  "TECHNICIAN",
  "DATA_ENTRY",
  "ACCOUNTANT",
  "VET",
  "VIEWER",
] as const satisfies readonly Exclude<UserRole, "SUPER_ADMIN">[]

const orgRoleSchema = z.enum(ORG_ASSIGNABLE_ROLES)

// ---------------------------------------------------------------------------
// Schémas Zod
// ---------------------------------------------------------------------------

const getOrganizationMembersSchema = z.object({
  organizationId: requiredIdSchema,
})

const addUserToOrganizationSchema = z.object({
  organizationId: requiredIdSchema,
  /** ID de l'utilisateur existant à ajouter — pas de création de compte ici */
  userId:         requiredIdSchema,
  role:           orgRoleSchema.default("VIEWER"),
})

const addUserToOrganizationByEmailSchema = z.object({
  organizationId: requiredIdSchema,
  email:          z.string().trim().toLowerCase().email("Email invalide"),
  role:           orgRoleSchema.default("VIEWER"),
})

const updateUserRoleSchema = z.object({
  organizationId: requiredIdSchema,
  targetUserId:   requiredIdSchema,
  role:           orgRoleSchema,
})

const appModuleSchema = z.enum(APP_MODULES)

const updateUserModulePermissionsSchema = z.object({
  organizationId: requiredIdSchema,
  targetUserId: requiredIdSchema,
  modulePermissions: z.array(appModuleSchema).nullable(),
})

const updateUserNotificationPreferenceSchema = z.object({
  organizationId: requiredIdSchema,
  targetUserId: requiredIdSchema,
  emailNotificationsEnabled: z.boolean(),
})

const removeUserFromOrganizationSchema = z.object({
  organizationId: requiredIdSchema,
  targetUserId:   requiredIdSchema,
})

// ---------------------------------------------------------------------------
// Types retournés
// ---------------------------------------------------------------------------

export interface OrgMember {
  id:              string
  userId:          string
  role:            UserRole
  emailNotificationsEnabled: boolean
  modulePermissions: unknown
  farmPermissions: unknown
  createdAt:       Date
  user: {
    id:    string
    name:  string | null
    email: string
  }
}

// ---------------------------------------------------------------------------
// Erreur métier interne
//
// Utilisée à l'intérieur des $transaction pour distinguer une violation de
// règle métier (à retourner au client) d'une erreur Prisma inattendue.
// Non exportée — usage interne uniquement.
// ---------------------------------------------------------------------------

class BusinessRuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BusinessRuleError"
  }
}

// Sélection Prisma partagée pour éviter la duplication
const memberSelect = {
  id:              true,
  userId:          true,
  role:            true,
  emailNotificationsEnabled: true,
  modulePermissions: true,
  farmPermissions: true,
  createdAt:       true,
  user: {
    select: { id: true, name: true, email: true },
  },
} as const

// ---------------------------------------------------------------------------
// 1. getOrganizationMembers
// ---------------------------------------------------------------------------

/**
 * Retourne la liste des membres actifs d'une organisation.
 * Accessible à tout membre de l'organisation (lecture libre).
 *
 * Filtre explicitement les utilisateurs soft-deleted (deletedAt != null) :
 * le schéma utilise onDelete: Cascade uniquement pour les hard deletes,
 * donc une UserOrganization peut pointer vers un user soft-deleted.
 * On exclut ces entrées pour ne jamais remonter un compte supprimé en UI.
 */
export async function getOrganizationMembers(
  data: unknown,
): Promise<ActionResult<OrgMember[]>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = getOrganizationMembersSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId } = parsed.data

    // Lecture : tout membre est autorisé
    const membershipResult = await requireMembership(
      sessionResult.data.user.id,
      organizationId,
    )
    if (!membershipResult.success) return membershipResult
    const moduleAccessResult = requireModuleAccess(membershipResult.data, "TEAM")
    if (!moduleAccessResult.success) return moduleAccessResult

    const members = await prisma.userOrganization.findMany({
      where: {
        organizationId,
        user: { deletedAt: null }, // exclut les comptes soft-deleted
      },
      select:  memberSelect,
      orderBy: { createdAt: "asc" },
    })

    return { success: true, data: members }
  } catch {
    return { success: false, error: "Impossible de récupérer les membres" }
  }
}

// ---------------------------------------------------------------------------
// 2. addUserToOrganization
// ---------------------------------------------------------------------------

/**
 * Ajoute un utilisateur existant à une organisation.
 *
 * Règles :
 * - L'acteur doit avoir la permission INVITE_USER (OWNER ou SUPER_ADMIN)
 * - L'utilisateur cible doit exister et ne pas être soft-deleted
 * - L'utilisateur cible ne doit pas être déjà membre
 * - SUPER_ADMIN n'est pas assignable comme rôle d'organisation
 */
export async function addUserToOrganization(
  data: unknown,
): Promise<ActionResult<OrgMember>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = addUserToOrganizationSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Données invalides" }
    }

    const { organizationId, userId, role } = parsed.data
    const actorId = sessionResult.data.user.id

    const membershipResult = await requireMembership(actorId, organizationId)
    if (!membershipResult.success) return membershipResult
    const moduleAccessResult = requireModuleAccess(membershipResult.data, "TEAM")
    if (!moduleAccessResult.success) return moduleAccessResult

    if (!canPerformAction(membershipResult.data.role, "INVITE_USER")) {
      return { success: false, error: "Permission refusée" }
    }

    // L'utilisateur cible doit exister et ne pas être soft-deleted
    const targetUser = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    })
    if (!targetUser) {
      return { success: false, error: "Utilisateur introuvable" }
    }

    // Vérifier l'absence de doublon avant création (message explicite > erreur P2002)
    const existing = await prisma.userOrganization.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    })
    if (existing) {
      return { success: false, error: "Cet utilisateur est déjà membre de l'organisation" }
    }

    const membership = await prisma.userOrganization.create({
      data:   {
        userId,
        organizationId,
        role,
        modulePermissions: Prisma.JsonNull,
      },
      select: memberSelect,
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.CREATE,
      resourceType:   "ORGANIZATION_MEMBER",
      resourceId:     membership.id,
      after:          { userId, role },
    })

    return { success: true, data: membership }
  } catch {
    return { success: false, error: "Impossible d'ajouter le membre" }
  }
}

// ---------------------------------------------------------------------------
// 2.b addUserToOrganizationByEmail
// ---------------------------------------------------------------------------

/**
 * Ajoute un utilisateur existant à partir de son email.
 *
 * Ce helper évite à l'UI d'avoir à résoudre manuellement le userId.
 * Si l'email n'existe pas, on retourne un message explicite pour inviter
 * l'utilisateur à créer d'abord son compte.
 */
export async function addUserToOrganizationByEmail(
  data: unknown,
): Promise<ActionResult<OrgMember>> {
  const parsed = addUserToOrganizationByEmailSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: "Donnees invalides" }
  }

  const targetUser = await prisma.user.findFirst({
    where: {
      email: parsed.data.email,
      deletedAt: null,
    },
    select: { id: true },
  })

  if (!targetUser) {
    return {
      success: false,
      error: "Aucun compte actif ne correspond a cet email. Demandez d'abord a cette personne de creer son compte.",
    }
  }

  return addUserToOrganization({
    organizationId: parsed.data.organizationId,
    userId: targetUser.id,
    role: parsed.data.role,
  })
}

// ---------------------------------------------------------------------------
// 3. updateUserRole
// ---------------------------------------------------------------------------

/**
 * Modifie le rôle d'un membre de l'organisation.
 *
 * Règles :
 * - L'acteur doit avoir la permission INVITE_USER
 * - L'acteur ne peut pas modifier son propre rôle (prévention auto-escalade)
 * - Impossible de déclasser le dernier OWNER (vérifié dans $transaction)
 */
export async function updateUserRole(
  data: unknown,
): Promise<ActionResult<OrgMember>> {
  const sessionResult = await requireSession()
  if (!sessionResult.success) return sessionResult

  const parsed = updateUserRoleSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: "Données invalides" }
  }

  const { organizationId, targetUserId, role } = parsed.data
  const actorId = sessionResult.data.user.id

  const membershipResult = await requireMembership(actorId, organizationId)
  if (!membershipResult.success) return membershipResult
  const moduleAccessResult = requireModuleAccess(membershipResult.data, "TEAM")
  if (!moduleAccessResult.success) return moduleAccessResult

  if (!canPerformAction(membershipResult.data.role, "INVITE_USER")) {
    return { success: false, error: "Permission refusée" }
  }

  if (targetUserId === actorId) {
    return { success: false, error: "Vous ne pouvez pas modifier votre propre rôle" }
  }

  // Récupérer la cible avant transaction (message d'erreur précis si absente)
  const targetMembership = await prisma.userOrganization.findUnique({
    where: { userId_organizationId: { userId: targetUserId, organizationId } },
  })
  if (!targetMembership) {
    return { success: false, error: "Membre introuvable dans cette organisation" }
  }

  // Transaction : count + update atomiques pour réduire la race condition
  try {
    const updated = await prisma.$transaction(async (tx) => {
      // Re-vérifier le dernier OWNER à l'intérieur de la transaction
      if (
        targetMembership.role === UserRole.OWNER &&
        role !== UserRole.OWNER
      ) {
        const ownerCount = await tx.userOrganization.count({
          where: { organizationId, role: UserRole.OWNER },
        })
        if (ownerCount <= 1) {
          throw new BusinessRuleError(
            "Impossible de modifier le rôle du dernier propriétaire de l'organisation",
          )
        }
      }
      return tx.userOrganization.update({
        where: { userId_organizationId: { userId: targetUserId, organizationId } },
        data:   {
          role,
          modulePermissions: Prisma.JsonNull,
        },
        select: memberSelect,
      })
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.UPDATE,
      resourceType:   "ORGANIZATION_MEMBER",
      resourceId:     updated.id,
      before:         { role: targetMembership.role },
      after:          { role },
    })

    return { success: true, data: updated }
  } catch (error) {
    if (error instanceof BusinessRuleError) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Impossible de modifier le rôle" }
  }
}

// ---------------------------------------------------------------------------
// 3.b updateUserModulePermissions
// ---------------------------------------------------------------------------

export async function updateUserModulePermissions(
  data: unknown,
): Promise<ActionResult<OrgMember>> {
  const sessionResult = await requireSession()
  if (!sessionResult.success) return sessionResult

  const parsed = updateUserModulePermissionsSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: "Donnees invalides" }
  }

  const { organizationId, targetUserId, modulePermissions } = parsed.data
  const actorId = sessionResult.data.user.id

  const membershipResult = await requireMembership(actorId, organizationId)
  if (!membershipResult.success) return membershipResult
  const moduleAccessResult = requireModuleAccess(membershipResult.data, "TEAM")
  if (!moduleAccessResult.success) return moduleAccessResult

  if (!canPerformAction(membershipResult.data.role, "INVITE_USER")) {
    return { success: false, error: "Permission refusee" }
  }

  if (targetUserId === actorId) {
    return { success: false, error: "Vous ne pouvez pas modifier vos propres acces ici" }
  }

  const targetMembership = await prisma.userOrganization.findUnique({
    where: { userId_organizationId: { userId: targetUserId, organizationId } },
    select: {
      id: true,
      role: true,
      modulePermissions: true,
    },
  })

  if (!targetMembership) {
    return { success: false, error: "Membre introuvable dans cette organisation" }
  }

  if (targetMembership.role === UserRole.OWNER) {
    return { success: false, error: "Le proprietaire conserve deja un acces complet" }
  }

  const normalizedPermissions = modulePermissions === null
    ? Prisma.JsonNull
    : [...new Set(["DASHBOARD", ...modulePermissions])] as AppModule[]

  const updated = await prisma.userOrganization.update({
    where: { userId_organizationId: { userId: targetUserId, organizationId } },
    data: {
      modulePermissions: normalizedPermissions,
    },
    select: memberSelect,
  })

  await createAuditLog({
    userId: actorId,
    organizationId,
    action: AuditAction.UPDATE,
    resourceType: "ORGANIZATION_MEMBER_ACCESS",
    resourceId: updated.id,
    before: {
      modulePermissions: parseModulePermissions(targetMembership.modulePermissions),
    },
    after: {
      modulePermissions: modulePermissions,
    },
  })

  return { success: true, data: updated }
}

export async function updateUserNotificationPreference(
  data: unknown,
): Promise<ActionResult<OrgMember>> {
  const sessionResult = await requireSession()
  if (!sessionResult.success) return sessionResult

  const parsed = updateUserNotificationPreferenceSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: "Donnees invalides" }
  }

  const { organizationId, targetUserId, emailNotificationsEnabled } = parsed.data
  const actorId = sessionResult.data.user.id

  const membershipResult = await requireMembership(actorId, organizationId)
  if (!membershipResult.success) return membershipResult
  const moduleAccessResult = requireModuleAccess(membershipResult.data, "TEAM")
  if (!moduleAccessResult.success) return moduleAccessResult

  if (!canPerformAction(membershipResult.data.role, "INVITE_USER")) {
    return { success: false, error: "Permission refusee" }
  }

  const targetMembership = await prisma.userOrganization.findUnique({
    where: { userId_organizationId: { userId: targetUserId, organizationId } },
    select: {
      id: true,
      emailNotificationsEnabled: true,
    },
  })

  if (!targetMembership) {
    return { success: false, error: "Membre introuvable dans cette organisation" }
  }

  const updated = await prisma.userOrganization.update({
    where: { userId_organizationId: { userId: targetUserId, organizationId } },
    data: {
      emailNotificationsEnabled,
    },
    select: memberSelect,
  })

  await createAuditLog({
    userId: actorId,
    organizationId,
    action: AuditAction.UPDATE,
    resourceType: "ORGANIZATION_MEMBER_NOTIFICATION_PREFERENCE",
    resourceId: updated.id,
    before: {
      emailNotificationsEnabled: targetMembership.emailNotificationsEnabled,
    },
    after: {
      emailNotificationsEnabled,
    },
  })

  return { success: true, data: updated }
}

// ---------------------------------------------------------------------------
// 4. removeUserFromOrganization
// ---------------------------------------------------------------------------

/**
 * Retire un utilisateur d'une organisation.
 *
 * Retourne `{ success: true, data: undefined }` — conforme à ActionResult<void>
 * où `T = void` implique que data est undefined. L'appelant n'a pas besoin
 * d'inspecter data en cas de succès, seulement de vérifier success.
 *
 * Règles :
 * - L'acteur doit avoir la permission INVITE_USER
 * - L'acteur ne peut pas se retirer lui-même
 * - Impossible de retirer le dernier OWNER (vérifié dans $transaction)
 */
export async function removeUserFromOrganization(
  data: unknown,
): Promise<ActionResult<void>> {
  const sessionResult = await requireSession()
  if (!sessionResult.success) return sessionResult

  const parsed = removeUserFromOrganizationSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: "Données invalides" }
  }

  const { organizationId, targetUserId } = parsed.data
  const actorId = sessionResult.data.user.id

  const membershipResult = await requireMembership(actorId, organizationId)
  if (!membershipResult.success) return membershipResult
  const moduleAccessResult = requireModuleAccess(membershipResult.data, "TEAM")
  if (!moduleAccessResult.success) return moduleAccessResult

  if (!canPerformAction(membershipResult.data.role, "INVITE_USER")) {
    return { success: false, error: "Permission refusée" }
  }

  if (targetUserId === actorId) {
    return {
      success: false,
      error:   "Vous ne pouvez pas vous retirer vous-même de l'organisation",
    }
  }

  // Récupérer la cible avant transaction (message d'erreur précis si absente)
  const targetMembership = await prisma.userOrganization.findUnique({
    where: { userId_organizationId: { userId: targetUserId, organizationId } },
  })
  if (!targetMembership) {
    return { success: false, error: "Membre introuvable dans cette organisation" }
  }

  // Transaction : count + delete atomiques pour réduire la race condition
  try {
    await prisma.$transaction(async (tx) => {
      if (targetMembership.role === UserRole.OWNER) {
        const ownerCount = await tx.userOrganization.count({
          where: { organizationId, role: UserRole.OWNER },
        })
        if (ownerCount <= 1) {
          throw new BusinessRuleError(
            "Impossible de retirer le dernier propriétaire de l'organisation",
          )
        }
      }
      await tx.userOrganization.delete({
        where: { userId_organizationId: { userId: targetUserId, organizationId } },
      })
    })

    await createAuditLog({
      userId:         actorId,
      organizationId,
      action:         AuditAction.DELETE,
      resourceType:   "ORGANIZATION_MEMBER",
      resourceId:     targetMembership.id,
      before:         { userId: targetUserId, role: targetMembership.role },
    })

    return { success: true, data: undefined }
  } catch (error) {
    if (error instanceof BusinessRuleError) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Impossible de retirer le membre" }
  }
}
