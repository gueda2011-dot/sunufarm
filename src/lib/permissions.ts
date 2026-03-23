/**
 * SunuFarm — Helpers de permissions
 *
 * Logique MVP : hiérarchie de rôles + matrice explicite par action + accès ferme.
 * Conçu pour être simple, lisible, et remplaçable par un système plus fin en V2.
 */

import type {
  PlatformRole as PrismaPlatformRole,
  UserRole,
} from "@/src/generated/prisma/client"

// ---------------------------------------------------------------------------
// Hiérarchie des rôles
// ---------------------------------------------------------------------------

/**
 * Niveau numérique par rôle.
 * Utilisé uniquement pour les comparaisons générales (ex : "au moins MANAGER").
 * Ne pas utiliser pour les vérifications d'actions métier — voir ACTION_ALLOWED_ROLES.
 */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  SUPER_ADMIN: 99,
  OWNER:       70,
  MANAGER:     60,
  ACCOUNTANT:  40,
  VET:         40,
  TECHNICIAN:  30,
  DATA_ENTRY:  20,
  VIEWER:      10,
}

export function getRoleLevel(role: UserRole): number {
  return ROLE_HIERARCHY[role] ?? 0
}

/**
 * L'utilisateur possède-t-il au moins le niveau du rôle requis ?
 * À utiliser pour des comparaisons générales (ex : "au moins MANAGER").
 * Pour les droits métier précis, utiliser canPerformAction().
 */
export function hasMinimumRole(userRole: UserRole, required: UserRole): boolean {
  return getRoleLevel(userRole) >= getRoleLevel(required)
}

// ---------------------------------------------------------------------------
// Matrice explicite des actions par rôle
//
// Chaque action liste les rôles qui y sont autorisés.
// Pas de déduction implicite par niveau — chaque droit est explicite.
// ACCOUNTANT et VET ont le même niveau mais des droits distincts.
// ---------------------------------------------------------------------------

const ACTION_ALLOWED_ROLES = {
  // Lots
  CREATE_BATCH: ["SUPER_ADMIN", "OWNER", "MANAGER"],
  UPDATE_BATCH: ["SUPER_ADMIN", "OWNER", "MANAGER"],
  CLOSE_BATCH:  ["SUPER_ADMIN", "OWNER", "MANAGER"],
  DELETE_BATCH: ["SUPER_ADMIN", "OWNER"],

  // Saisie journalière
  CREATE_DAILY_RECORD: ["SUPER_ADMIN", "OWNER", "MANAGER", "TECHNICIAN", "DATA_ENTRY"],
  UPDATE_DAILY_RECORD: ["SUPER_ADMIN", "OWNER", "MANAGER", "TECHNICIAN"],

  // Stock
  CREATE_FEED_MOVEMENT:     ["SUPER_ADMIN", "OWNER", "MANAGER", "TECHNICIAN"],
  CREATE_MEDICINE_MOVEMENT: ["SUPER_ADMIN", "OWNER", "MANAGER", "TECHNICIAN"],

  // Ventes et achats
  CREATE_SALE:     ["SUPER_ADMIN", "OWNER", "MANAGER"],
  CREATE_PURCHASE: ["SUPER_ADMIN", "OWNER", "MANAGER"],

  // Finances — ACCOUNTANT uniquement parmi les rôles spécialisés
  CREATE_EXPENSE: ["SUPER_ADMIN", "OWNER", "MANAGER", "ACCOUNTANT"],
  VIEW_FINANCES:  ["SUPER_ADMIN", "OWNER", "MANAGER", "ACCOUNTANT"],

  // Santé — VET uniquement parmi les rôles spécialisés
  CREATE_VACCINATION: ["SUPER_ADMIN", "OWNER", "MANAGER", "VET"],
  CREATE_TREATMENT:   ["SUPER_ADMIN", "OWNER", "MANAGER", "VET"],

  // Administration
  INVITE_USER:  ["SUPER_ADMIN", "OWNER"],
  UPDATE_ORG:   ["SUPER_ADMIN", "OWNER"],
  MANAGE_FARMS: ["SUPER_ADMIN", "OWNER", "MANAGER"],
} as const satisfies Record<string, readonly UserRole[]>

export type Action = keyof typeof ACTION_ALLOWED_ROLES

/**
 * L'utilisateur peut-il effectuer cette action ?
 * Basé sur la liste explicite ACTION_ALLOWED_ROLES — pas de déduction par niveau.
 */
export function canPerformAction(userRole: UserRole, action: Action): boolean {
  const allowed = ACTION_ALLOWED_ROLES[action] as readonly string[]
  return allowed.includes(userRole)
}

// ---------------------------------------------------------------------------
// Permissions plateforme
//
// Separees des permissions tenant pour eviter tout bypass implicite du
// multi-tenant. A utiliser avec requirePlatformSuperAdmin().
// ---------------------------------------------------------------------------

const PLATFORM_ACTION_ALLOWED_ROLES = {
  VIEW_ADMIN: ["SUPER_ADMIN"],
  VIEW_ALL_ORGANIZATIONS: ["SUPER_ADMIN"],
  MANAGE_PLATFORM_USERS: ["SUPER_ADMIN"],
  IMPERSONATE_USER: ["SUPER_ADMIN"],
} as const satisfies Record<string, readonly PrismaPlatformRole[]>

export type PlatformAction = keyof typeof PLATFORM_ACTION_ALLOWED_ROLES

export function canPerformPlatformAction(
  platformRole: PrismaPlatformRole,
  action: PlatformAction,
): boolean {
  const allowed = PLATFORM_ACTION_ALLOWED_ROLES[action] as readonly string[]
  return allowed.includes(platformRole)
}

// ---------------------------------------------------------------------------
// Permissions par ferme
// ---------------------------------------------------------------------------

export interface FarmPermission {
  farmId:    string
  canRead:   boolean
  canWrite:  boolean
  canDelete: boolean
}

export type FarmRight = keyof Omit<FarmPermission, "farmId">

/**
 * Parse le champ farmPermissions (Json Prisma → tableau typé).
 * Ignore silencieusement les entrées incomplètes ou mal typées.
 * Valide que farmId est une string et que les trois droits sont des booléens stricts.
 */
export function parseFarmPermissions(raw: unknown): FarmPermission[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is FarmPermission => {
    if (typeof item !== "object" || item === null) return false
    const p = item as Record<string, unknown>
    return (
      typeof p.farmId    === "string"  &&
      typeof p.canRead   === "boolean" &&
      typeof p.canWrite  === "boolean" &&
      typeof p.canDelete === "boolean"
    )
  })
}

/**
 * L'utilisateur a-t-il le droit demandé sur cette ferme ?
 *
 * Règles :
 * - SUPER_ADMIN : accès total à toutes les fermes de la plateforme, sans restriction.
 * - OWNER : accès total à toutes les fermes de son organisation.
 * - MANAGER : lecture libre sur toutes les fermes de son organisation ;
 *             écriture et suppression selon les entrées JSON farmPermissions.
 * - ACCOUNTANT, VET, TECHNICIAN, DATA_ENTRY, VIEWER :
 *             accès selon les entrées JSON farmPermissions uniquement.
 */
export function canAccessFarm(
  userRole: UserRole,
  farmPermissions: unknown,
  farmId: string,
  right: FarmRight = "canRead",
): boolean {
  if (userRole === "SUPER_ADMIN" || userRole === "OWNER") return true

  if (userRole === "MANAGER" && right === "canRead") return true

  const permissions = parseFarmPermissions(farmPermissions)
  const entry = permissions.find((p) => p.farmId === farmId)

  return entry?.[right] === true
}
