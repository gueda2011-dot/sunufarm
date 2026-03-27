import { cookies } from "next/headers"
import prisma from "@/src/lib/prisma"
import type { UserRole } from "@/src/generated/prisma/client"

export const ACTIVE_ORG_COOKIE = "sunufarm_active_org"

export interface OrganizationMembershipSummary {
  organizationId: string
  role: UserRole
  organization: {
    id: string
    name: string
  }
}

export function pickActiveMembership(
  memberships: OrganizationMembershipSummary[],
  preferredOrganizationId?: string | null,
): OrganizationMembershipSummary | null {
  if (memberships.length === 0) return null

  if (preferredOrganizationId) {
    const preferred = memberships.find(
      (membership) => membership.organizationId === preferredOrganizationId,
    )
    if (preferred) return preferred
  }

  return memberships[0]
}

export async function getUserMemberships(
  userId: string,
): Promise<OrganizationMembershipSummary[]> {
  return prisma.userOrganization.findMany({
    where: { userId },
    select: {
      organizationId: true,
      role: true,
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { organization: { name: "asc" } },
  })
}

export async function getCurrentOrganizationContext(userId: string) {
  const memberships = await getUserMemberships(userId)
  const preferredOrganizationId =
    (await cookies()).get(ACTIVE_ORG_COOKIE)?.value ?? null

  return {
    memberships,
    activeMembership: pickActiveMembership(memberships, preferredOrganizationId),
    preferredOrganizationId,
  }
}
