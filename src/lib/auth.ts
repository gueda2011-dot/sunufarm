/**
 * SunuFarm — Helpers d'authentification et d'ActionResult
 *
 * Ce fichier expose uniquement des helpers réutilisables par les Server Actions.
 * La configuration NextAuth (providers, callbacks, adapter) appartient à src/auth.ts.
 *
 * Dépendance manquante : next-auth@beta
 *   npm install next-auth@beta
 *
 * Hypothèses sur la session NextAuth v5 :
 *   - auth() est exporté depuis src/auth.ts (configuration à créer)
 *   - session.user.id est exposé via le callback session() dans src/auth.ts
 *   - Exemple minimal de callback requis :
 *       callbacks: {
 *         session({ session, token }) {
 *           session.user.id = token.sub!
 *           return session
 *         }
 *       }
 *
 * Pattern d'utilisation dans une Server Action :
 *
 *   export async function createFarm(data: unknown): Promise<ActionResult<Farm>> {
 *     const sessionResult = await requireSession()
 *     if (!sessionResult.success) return sessionResult
 *     const { data: session } = sessionResult
 *
 *     const membershipResult = await requireMembership(
 *       session.user.id,
 *       parsed.data.organizationId,
 *     )
 *     if (!membershipResult.success) return membershipResult
 *     const { data: membership } = membershipResult
 *
 *     if (!canPerformAction(membership.role, "MANAGE_FARMS")) {
 *       return { success: false, error: "Permission refusée" }
 *     }
 *     // ...
 *   }
 */

import { auth } from "@/src/auth"
import prisma from "@/src/lib/prisma"
import type { UserOrganization } from "@/src/generated/prisma/client"

// ---------------------------------------------------------------------------
// ActionResult — type discriminant pour toutes les Server Actions
//
// Convention :
//   success: true  → data contient le résultat typé
//   success: false → error est un message humain en français
//                    fieldErrors (optionnel) mappe un champ Zod à ses erreurs
//                    (utilisé en V2 pour les retours de formulaire granulaires)
// ---------------------------------------------------------------------------

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

// ---------------------------------------------------------------------------
// Types session
//
// AppSession reflète la forme attendue après le callback session() NextAuth.
// Définir ici plutôt que d'importer next-auth/types directement permet
// d'isoler les Server Actions d'une éventuelle migration d'auth provider.
// ---------------------------------------------------------------------------

export interface SessionUser {
  /** ID Prisma (CUID) — injecté via callback session() dans src/auth.ts */
  id: string
  email: string
  name: string | null
}

export interface AppSession {
  user: SessionUser
  /** ISO date d'expiration de la session */
  expires: string
}

// ---------------------------------------------------------------------------
// Helpers session
// ---------------------------------------------------------------------------

/**
 * Retourne la session courante ou null.
 *
 * Utiliser dans les composants serveur pour des rendus conditionnels.
 * Pour les Server Actions, préférer requireSession() qui retourne un ActionResult.
 */
export async function getSession(): Promise<AppSession | null> {
  const session = await auth()
  // auth() retourne null si l'utilisateur n'est pas connecté
  // user.id est requis — si absent, la config NextAuth est incomplète
  if (!session?.user?.id) return null
  return session as unknown as AppSession
}

/**
 * Retourne la session dans un ActionResult.
 *
 * Retourne { success: false } si l'utilisateur n'est pas authentifié.
 * À appeler en premier dans chaque Server Action protégée.
 *
 * @example
 *   const sessionResult = await requireSession()
 *   if (!sessionResult.success) return sessionResult
 *   const { data: session } = sessionResult
 */
export async function requireSession(): Promise<ActionResult<AppSession>> {
  const session = await getSession()
  if (!session) {
    return { success: false, error: "Non authentifié" }
  }
  return { success: true, data: session }
}

// ---------------------------------------------------------------------------
// Types membership
// ---------------------------------------------------------------------------

/**
 * Projection de UserOrganization utilisée dans les Server Actions.
 * farmPermissions est le champ Json Prisma — à parser avec parseFarmPermissions().
 */
export type MembershipWithRole = Pick<
  UserOrganization,
  "userId" | "organizationId" | "role" | "farmPermissions"
>

// ---------------------------------------------------------------------------
// Helpers membership (UserOrganization)
// ---------------------------------------------------------------------------

/**
 * Retourne l'appartenance d'un utilisateur à une organisation, ou null.
 *
 * Utiliser pour les vérifications souples (ex : lecture conditionnelle).
 * Pour les Server Actions, préférer requireMembership() qui retourne un ActionResult.
 */
export async function getMembership(
  userId: string,
  organizationId: string,
): Promise<MembershipWithRole | null> {
  const membership = await prisma.userOrganization.findFirst({
    where: { userId, organizationId },
    select: {
      userId:         true,
      organizationId: true,
      role:           true,
      farmPermissions: true,
    },
  })
  return membership
}

/**
 * Retourne l'appartenance dans un ActionResult.
 *
 * Retourne { success: false } si l'utilisateur n'appartient pas à l'organisation.
 * À appeler après requireSession() dans chaque Server Action.
 *
 * Note : ne vérifie pas le rôle — utiliser canPerformAction() après cet appel.
 *
 * @example
 *   const membershipResult = await requireMembership(session.user.id, organizationId)
 *   if (!membershipResult.success) return membershipResult
 *   const { data: membership } = membershipResult
 *
 *   if (!canPerformAction(membership.role, "CREATE_BATCH")) {
 *     return { success: false, error: "Permission refusée" }
 *   }
 */
export async function requireMembership(
  userId: string,
  organizationId: string,
): Promise<ActionResult<MembershipWithRole>> {
  const membership = await getMembership(userId, organizationId)
  if (!membership) {
    return { success: false, error: "Accès refusé à cette organisation" }
  }
  return { success: true, data: membership }
}
