"use server"

import { createHmac } from "node:crypto"
import { cookies } from "next/headers"
import { z } from "zod"
import prisma from "@/src/lib/prisma"
import {
  isPlatformSuperAdmin,
  requireActiveImpersonationSession,
  requirePlatformSuperAdmin,
  requireSession,
  type ActionResult,
} from "@/src/lib/auth"
import { createAuditLog, AuditAction } from "@/src/lib/audit"
import { canPerformPlatformAction } from "@/src/lib/permissions"
import { requiredIdSchema } from "@/src/lib/validators"

const IMPERSONATION_COOKIE_NAME = "sunufarm_impersonation"

const organizationIdSchema = z.object({
  organizationId: requiredIdSchema,
})

const startImpersonationSchema = z.object({
  targetOrganizationId: requiredIdSchema,
  targetUserId: requiredIdSchema,
  reason: z
    .string()
    .trim()
    .min(10, "Le motif est obligatoire")
    .max(500, "Le motif est trop long"),
})

export interface AdminOrganizationSummary {
  id: string
  name: string
  slug: string
  usersCount: number
  farmsCount: number
  createdAt: Date
}

export interface AdminOrganizationUserSummary {
  membershipId: string
  userId: string
  name: string | null
  email: string
  role: string
  createdAt: Date
  updatedAt: Date
}

function getImpersonationCookieSecret(): string | null {
  return process.env.IMPERSONATION_COOKIE_SECRET ?? null
}

function buildSignedImpersonationCookieValue(sessionId: string): string | null {
  const secret = getImpersonationCookieSecret()
  if (!secret) return null

  const signature = createHmac("sha256", secret)
    .update(sessionId)
    .digest("base64url")

  return `${sessionId}.${signature}`
}

export async function getAdminOrganizations(): Promise<
  ActionResult<AdminOrganizationSummary[]>
> {
  const sessionResult = await requirePlatformSuperAdmin()
  if (!sessionResult.success) return sessionResult

  if (!canPerformPlatformAction(sessionResult.data.user.platformRole, "VIEW_ADMIN")) {
    return { success: false, error: "Acces plateforme refuse" }
  }

  const organizations = await prisma.organization.findMany({
    where: {
      deletedAt: null,
    },
    orderBy: {
      name: "asc",
    },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      _count: {
        select: {
          users: true,
          farms: true,
        },
      },
    },
  })

  return {
    success: true,
    data: organizations.map((organization) => ({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      usersCount: organization._count.users,
      farmsCount: organization._count.farms,
      createdAt: organization.createdAt,
    })),
  }
}

export async function getOrganizationUsersForAdmin(
  data: unknown,
): Promise<ActionResult<AdminOrganizationUserSummary[]>> {
  const sessionResult = await requirePlatformSuperAdmin()
  if (!sessionResult.success) return sessionResult

  if (
    !canPerformPlatformAction(
      sessionResult.data.user.platformRole,
      "VIEW_ALL_ORGANIZATIONS",
    )
  ) {
    return { success: false, error: "Acces plateforme refuse" }
  }

  const parsed = organizationIdSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: "Donnees invalides" }
  }

  const organization = await prisma.organization.findFirst({
    where: {
      id: parsed.data.organizationId,
      deletedAt: null,
    },
    select: {
      id: true,
    },
  })

  if (!organization) {
    return { success: false, error: "Organisation introuvable" }
  }

  const memberships = await prisma.userOrganization.findMany({
    where: {
      organizationId: parsed.data.organizationId,
      user: {
        deletedAt: null,
      },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  })

  return {
    success: true,
    data: memberships.map((membership) => ({
      membershipId: membership.id,
      userId: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
      role: membership.role,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt,
    })),
  }
}

export async function startImpersonation(
  data: unknown,
): Promise<
  ActionResult<{
    impersonationSessionId: string
    targetOrganizationId: string
    targetUserId: string
  }>
> {
  const sessionResult = await requirePlatformSuperAdmin()
  if (!sessionResult.success) return sessionResult

  if (
    !canPerformPlatformAction(sessionResult.data.user.platformRole, "IMPERSONATE_USER")
  ) {
    return { success: false, error: "Acces plateforme refuse" }
  }

  const parsed = startImpersonationSchema.safeParse(data)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Donnees invalides",
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const activeSession = await prisma.adminImpersonationSession.findFirst({
    where: {
      adminUserId: sessionResult.data.user.id,
      endedAt: null,
    },
    select: {
      id: true,
    },
  })

  if (activeSession) {
    return {
      success: false,
      error: "Une impersonation est deja active pour cet administrateur",
    }
  }

  const targetMembership = await prisma.userOrganization.findFirst({
    where: {
      userId: parsed.data.targetUserId,
      organizationId: parsed.data.targetOrganizationId,
      user: {
        deletedAt: null,
      },
    },
    select: {
      userId: true,
      organizationId: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          deletedAt: true,
        },
      },
    },
  })

  if (!targetMembership || targetMembership.user.deletedAt) {
    return {
      success: false,
      error: "Utilisateur cible introuvable dans cette organisation",
    }
  }

  if (!getImpersonationCookieSecret()) {
    return {
      success: false,
      error: "Configuration d'impersonation incomplete sur le serveur",
    }
  }

  const impersonation = await prisma.adminImpersonationSession.create({
    data: {
      adminUserId: sessionResult.data.user.id,
      targetUserId: parsed.data.targetUserId,
      targetOrganizationId: parsed.data.targetOrganizationId,
      reason: parsed.data.reason,
    },
    select: {
      id: true,
      startedAt: true,
    },
  })

  const signedCookieValue = buildSignedImpersonationCookieValue(impersonation.id)
  if (!signedCookieValue) {
    await prisma.adminImpersonationSession.update({
      where: { id: impersonation.id },
      data: { endedAt: new Date() },
    })
    return {
      success: false,
      error: "Configuration d'impersonation incomplete sur le serveur",
    }
  }

  const cookieStore = await cookies()
  cookieStore.set(IMPERSONATION_COOKIE_NAME, signedCookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  })

  await createAuditLog({
    userId: sessionResult.data.user.id,
    organizationId: parsed.data.targetOrganizationId,
    actorUserId: sessionResult.data.actorUserId,
    effectiveUserId: parsed.data.targetUserId,
    impersonationSessionId: impersonation.id,
    action: AuditAction.CREATE,
    resourceType: "ADMIN_IMPERSONATION_SESSION",
    resourceId: impersonation.id,
    after: {
      targetOrganizationId: parsed.data.targetOrganizationId,
      targetUserId: parsed.data.targetUserId,
      targetUserName: targetMembership.user.name,
      targetUserEmail: targetMembership.user.email,
      reason: parsed.data.reason,
      startedAt: impersonation.startedAt,
    },
  })

  return {
    success: true,
    data: {
      impersonationSessionId: impersonation.id,
      targetOrganizationId: parsed.data.targetOrganizationId,
      targetUserId: parsed.data.targetUserId,
    },
  }
}

export async function stopImpersonation(): Promise<
  ActionResult<{ stopped: true }>
> {
  const sessionResult = await requireSession()
  if (!sessionResult.success) return sessionResult

  const session = sessionResult.data
  if (!isPlatformSuperAdmin(session)) {
    return { success: false, error: "Acces plateforme refuse" }
  }

  const cookieStore = await cookies()

  if (!session.isImpersonating) {
    cookieStore.delete(IMPERSONATION_COOKIE_NAME)
    return { success: true, data: { stopped: true } }
  }

  const activeImpersonationResult =
    await requireActiveImpersonationSession(session)

  if (!activeImpersonationResult.success) {
    cookieStore.delete(IMPERSONATION_COOKIE_NAME)
    return { success: true, data: { stopped: true } }
  }

  const endedAt = new Date()

  await prisma.adminImpersonationSession.updateMany({
    where: {
      id: activeImpersonationResult.data.id,
      adminUserId: session.actorUserId,
      endedAt: null,
    },
    data: {
      endedAt,
    },
  })

  cookieStore.delete(IMPERSONATION_COOKIE_NAME)

  await createAuditLog({
    userId: session.actorUserId,
    organizationId: activeImpersonationResult.data.targetOrganizationId,
    actorUserId: session.actorUserId,
    effectiveUserId: session.effectiveUserId,
    impersonationSessionId: activeImpersonationResult.data.id,
    action: AuditAction.UPDATE,
    resourceType: "ADMIN_IMPERSONATION_SESSION",
    resourceId: activeImpersonationResult.data.id,
    after: {
      endedAt,
    },
  })

  return { success: true, data: { stopped: true } }
}
