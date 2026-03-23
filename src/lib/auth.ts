/**
 * SunuFarm - Helpers d'authentification et d'ActionResult.
 *
 * NextAuth reste la source d'identite reelle. L'impersonation, quand elle sera
 * activee, sera resolue ici via cookie signe + verification DB.
 */

import { createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import type { Session } from "next-auth"
import { auth } from "@/src/auth"
import prisma from "@/src/lib/prisma"
import type {
  PlatformRole,
  UserOrganization,
} from "@/src/generated/prisma/client"

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

export interface SessionUser {
  id: string
  email: string
  name: string | null
  platformRole: PlatformRole
}

export interface AppSession {
  user: SessionUser
  expires: string
  actorUserId: string
  effectiveUserId: string
  isImpersonating: boolean
  impersonatedUserId: string | null
  impersonatedOrganizationId: string | null
  impersonationSessionId: string | null
  impersonatedUserName: string | null
  impersonatedUserEmail: string | null
}

export type MembershipWithRole = Pick<
  UserOrganization,
  "userId" | "organizationId" | "role" | "farmPermissions"
>

type ActiveImpersonationRecord = {
  id: string
  targetUserId: string
  targetOrganizationId: string
  targetUser: {
    id: string
    name: string | null
    email: string
    deletedAt: Date | null
  }
}

const IMPERSONATION_COOKIE_NAME = "sunufarm_impersonation"

function getImpersonationCookieSecret(): string | null {
  return process.env.IMPERSONATION_COOKIE_SECRET ?? null
}

function signImpersonationSessionId(sessionId: string, secret: string): string {
  return createHmac("sha256", secret).update(sessionId).digest("base64url")
}

function verifyImpersonationCookieValue(value: string): string | null {
  const secret = getImpersonationCookieSecret()
  if (!secret) return null

  const [sessionId, signature] = value.split(".")
  if (!sessionId || !signature) return null

  const expectedSignature = signImpersonationSessionId(sessionId, secret)
  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (signatureBuffer.length !== expectedBuffer.length) {
    return null
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null
  }

  return sessionId
}

async function getImpersonationCookieSessionId(): Promise<string | null> {
  const cookieStore = await cookies()
  const rawValue = cookieStore.get(IMPERSONATION_COOKIE_NAME)?.value ?? null
  if (!rawValue) return null
  return verifyImpersonationCookieValue(rawValue)
}

async function getActiveImpersonationSession(
  actorUserId: string,
  impersonationSessionId: string | null,
): Promise<ActiveImpersonationRecord | null> {
  if (!impersonationSessionId) return null

  return prisma.adminImpersonationSession.findFirst({
    where: {
      id: impersonationSessionId,
      adminUserId: actorUserId,
      endedAt: null,
      targetUser: {
        deletedAt: null,
      },
    },
    select: {
      id: true,
      targetUserId: true,
      targetOrganizationId: true,
      targetUser: {
        select: {
          id: true,
          name: true,
          email: true,
          deletedAt: true,
        },
      },
    },
  })
}

function buildActorSession(
  session: Session & {
    user: Session["user"] & {
      id: string
      platformRole: PlatformRole
    }
  },
): AppSession {
  const actorUserId = session.user.id

  return {
    user: {
      id: actorUserId,
      email: session.user.email ?? "",
      name: session.user.name ?? null,
      platformRole: session.user.platformRole ?? "NONE",
    },
    expires: session.expires,
    actorUserId,
    effectiveUserId: actorUserId,
    isImpersonating: false,
    impersonatedUserId: null,
    impersonatedOrganizationId: null,
    impersonationSessionId: null,
    impersonatedUserName: null,
    impersonatedUserEmail: null,
  }
}

export async function getSession(): Promise<AppSession | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  const baseSession = buildActorSession(session)
  const impersonationSessionId = await getImpersonationCookieSessionId()
  const impersonation = await getActiveImpersonationSession(
    baseSession.actorUserId,
    impersonationSessionId,
  )

  if (!impersonation) {
    return baseSession
  }

  return {
    ...baseSession,
    effectiveUserId: impersonation.targetUserId,
    isImpersonating: true,
    impersonatedUserId: impersonation.targetUserId,
    impersonatedOrganizationId: impersonation.targetOrganizationId,
    impersonationSessionId: impersonation.id,
    impersonatedUserName: impersonation.targetUser.name,
    impersonatedUserEmail: impersonation.targetUser.email,
  }
}

export async function requireSession(): Promise<ActionResult<AppSession>> {
  const session = await getSession()
  if (!session) {
    return { success: false, error: "Non authentifie" }
  }
  return { success: true, data: session }
}

export function isPlatformSuperAdmin(session: AppSession): boolean {
  return session.user.platformRole === "SUPER_ADMIN"
}

export function isImpersonating(session: AppSession): boolean {
  return session.isImpersonating
}

export function getEffectiveUserId(session: AppSession): string {
  return session.effectiveUserId
}

export async function requirePlatformSuperAdmin(): Promise<ActionResult<AppSession>> {
  const sessionResult = await requireSession()
  if (!sessionResult.success) return sessionResult

  const session = sessionResult.data
  if (!isPlatformSuperAdmin(session)) {
    return { success: false, error: "Acces plateforme refuse" }
  }

  if (session.isImpersonating) {
    return {
      success: false,
      error: "Les actions plateforme sont interdites pendant une impersonation",
    }
  }

  return { success: true, data: session }
}

export async function requireActiveImpersonationSession(
  session: AppSession,
): Promise<
  ActionResult<{
    id: string
    targetOrganizationId: string
    targetUserId: string
  }>
> {
  if (!session.isImpersonating || !session.impersonationSessionId) {
    return { success: false, error: "Aucune impersonation active" }
  }

  const impersonation = await prisma.adminImpersonationSession.findFirst({
    where: {
      id: session.impersonationSessionId,
      adminUserId: session.actorUserId,
      targetUserId: session.effectiveUserId,
      targetOrganizationId: session.impersonatedOrganizationId ?? undefined,
      endedAt: null,
    },
    select: {
      id: true,
      targetOrganizationId: true,
      targetUserId: true,
    },
  })

  if (!impersonation) {
    return {
      success: false,
      error: "Session d'impersonation invalide ou fermee",
    }
  }

  return { success: true, data: impersonation }
}

export async function getMembership(
  userId: string,
  organizationId: string,
): Promise<MembershipWithRole | null> {
  return prisma.userOrganization.findFirst({
    where: { userId, organizationId },
    select: {
      userId: true,
      organizationId: true,
      role: true,
      farmPermissions: true,
    },
  })
}

export async function requireMembership(
  userId: string,
  organizationId: string,
): Promise<ActionResult<MembershipWithRole>> {
  const membership = await getMembership(userId, organizationId)
  if (!membership) {
    return { success: false, error: "Acces refuse a cette organisation" }
  }
  return { success: true, data: membership }
}

export async function requireOrganizationAccess(
  organizationId: string,
): Promise<
  ActionResult<{
    session: AppSession
    membership: MembershipWithRole
    effectiveUserId: string
  }>
> {
  const sessionResult = await requireSession()
  if (!sessionResult.success) return sessionResult

  const session = sessionResult.data

  if (session.isImpersonating) {
    const activeImpersonationResult =
      await requireActiveImpersonationSession(session)
    if (!activeImpersonationResult.success) {
      return activeImpersonationResult
    }

    if (activeImpersonationResult.data.targetOrganizationId !== organizationId) {
      return { success: false, error: "Acces refuse a cette organisation" }
    }

    const membership = await getMembership(session.effectiveUserId, organizationId)
    if (!membership) {
      return { success: false, error: "Acces refuse a cette organisation" }
    }

    return {
      success: true,
      data: {
        session,
        membership,
        effectiveUserId: session.effectiveUserId,
      },
    }
  }

  const membership = await getMembership(session.user.id, organizationId)
  if (!membership) {
    return { success: false, error: "Acces refuse a cette organisation" }
  }

  return {
    success: true,
    data: {
      session,
      membership,
      effectiveUserId: session.user.id,
    },
  }
}
