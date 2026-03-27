"use server"

import { redirect } from "next/navigation"
import { unstable_update, auth } from "@/src/auth"
import prisma from "@/src/lib/prisma"
import { createAuditLog, AuditAction } from "@/src/lib/audit"
import type { ActionResult } from "@/src/lib/auth"

async function getSuperAdminActor() {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false as const, error: "Non authentifie" }
  }

  const actorId = session.actor?.id || session.user.id
  const adminMembership = await prisma.userOrganization.findFirst({
    where: {
      userId: actorId,
      role: "SUPER_ADMIN",
    },
    select: {
      organizationId: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  })

  if (!adminMembership) {
    return { success: false as const, error: "Seul un super admin peut utiliser l'impersonation." }
  }

  return {
    success: true as const,
    data: {
      organizationId: adminMembership.organizationId,
      actor: adminMembership.user,
      session,
    },
  }
}

export async function startAdminImpersonation(
  targetUserId: string,
): Promise<ActionResult<void>> {
  const actorResult = await getSuperAdminActor()
  if (!actorResult.success) return actorResult

  const { actor, organizationId, session } = actorResult.data

  if (targetUserId === actor.id) {
    return { success: false, error: "Tu es deja connecte avec ce compte admin." }
  }

  const targetUser = await prisma.user.findFirst({
    where: {
      id: targetUserId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      organizations: {
        select: {
          role: true,
          organization: {
            select: {
              name: true,
            },
          },
        },
        take: 1,
      },
    },
  })

  if (!targetUser) {
    return { success: false, error: "Utilisateur introuvable." }
  }

  const targetSuperAdminMembership = await prisma.userOrganization.findFirst({
    where: {
      userId: targetUser.id,
      role: "SUPER_ADMIN",
    },
    select: { id: true },
  })

  if (targetSuperAdminMembership) {
    return { success: false, error: "L'impersonation d'un super admin est desactivee." }
  }

  await unstable_update({
    user: {
      id: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
    },
    actor: {
      id: actor.id,
      email: actor.email,
      name: actor.name,
    },
    impersonation: {
      active: true,
      adminId: actor.id,
      adminEmail: actor.email,
      adminName: actor.name,
      targetUserId: targetUser.id,
      targetUserEmail: targetUser.email,
      targetUserName: targetUser.name,
    },
  })

  await createAuditLog({
    userId: actor.id,
    organizationId,
    action: AuditAction.LOGIN,
    resourceType: "IMPERSONATION_SESSION",
    resourceId: targetUser.id,
    after: {
      adminId: actor.id,
      adminEmail: actor.email,
      targetUserId: targetUser.id,
      targetUserEmail: targetUser.email,
      targetOrganization: targetUser.organizations[0]?.organization.name ?? null,
      previousTargetUserId: session.impersonation?.targetUserId ?? null,
    },
  })

  redirect("/dashboard")
}

export async function stopAdminImpersonation(): Promise<ActionResult<void>> {
  const actorResult = await getSuperAdminActor()
  if (!actorResult.success) return actorResult

  const { actor, organizationId, session } = actorResult.data
  if (!session.impersonation?.active) {
    redirect("/admin")
  }

  await unstable_update({
    user: {
      id: actor.id,
      email: actor.email,
      name: actor.name,
    },
    actor: {
      id: actor.id,
      email: actor.email,
      name: actor.name,
    },
    impersonation: null,
  })

  await createAuditLog({
    userId: actor.id,
    organizationId,
    action: AuditAction.LOGOUT,
    resourceType: "IMPERSONATION_SESSION",
    resourceId: session.impersonation.targetUserId,
    before: {
      targetUserId: session.impersonation.targetUserId,
      targetUserEmail: session.impersonation.targetUserEmail,
    },
  })

  redirect("/admin")
}
