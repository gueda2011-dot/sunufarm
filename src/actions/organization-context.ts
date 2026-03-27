"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { z } from "zod"
import {
  requireSession,
  type ActionResult,
} from "@/src/lib/auth"
import { ACTIVE_ORG_COOKIE, getUserMemberships } from "@/src/lib/active-organization"
import { requiredIdSchema } from "@/src/lib/validators"

const selectActiveOrganizationSchema = z.object({
  organizationId: requiredIdSchema,
})

export async function selectActiveOrganization(
  data: unknown,
): Promise<ActionResult<{ organizationId: string }>> {
  const sessionResult = await requireSession()
  if (!sessionResult.success) return sessionResult

  const parsed = selectActiveOrganizationSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: "Organisation invalide" }
  }

  const memberships = await getUserMemberships(sessionResult.data.user.id)
  const target = memberships.find(
    (membership) => membership.organizationId === parsed.data.organizationId,
  )

  if (!target) {
    return { success: false, error: "Acces refuse a cette organisation" }
  }

  ;(await cookies()).set(ACTIVE_ORG_COOKIE, target.organizationId, {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 180,
  })

  revalidatePath("/", "layout")

  return {
    success: true,
    data: { organizationId: target.organizationId },
  }
}
