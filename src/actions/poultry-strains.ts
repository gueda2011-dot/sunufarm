"use server"

import { z } from "zod"
import prisma from "@/src/lib/prisma"
import { createAuditLog, AuditAction } from "@/src/lib/audit"
import { requireMembership, requireSession, type ActionResult } from "@/src/lib/auth"
import { canPerformAction } from "@/src/lib/permissions"
import { requiredIdSchema } from "@/src/lib/validators"

const updatePoultryStrainSchema = z.object({
  organizationId: requiredIdSchema,
  strainId: requiredIdSchema,
  isActive: z.boolean(),
  name: z.string().min(1).max(120).optional(),
  notes: z.string().max(1000).nullable().optional(),
})

export async function updatePoultryStrain(
  data: unknown,
): Promise<ActionResult<{ id: string; isActive: boolean }>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = updatePoultryStrainSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const { organizationId, strainId, isActive, name, notes } = parsed.data
    const actorId = sessionResult.data.user.id

    const membershipResult = await requireMembership(actorId, organizationId)
    if (!membershipResult.success) return membershipResult

    if (!canPerformAction(membershipResult.data.role, "MANAGE_FARMS")) {
      return { success: false, error: "Permission refusee" }
    }

    const existing = await prisma.poultryStrain.findUnique({
      where: { id: strainId },
      select: {
        id: true,
        name: true,
        isActive: true,
        notes: true,
      },
    })

    if (!existing) {
      return { success: false, error: "Souche introuvable" }
    }

    const strain = await prisma.poultryStrain.update({
      where: { id: strainId },
      data: {
        isActive,
        ...(name !== undefined ? { name } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
      select: {
        id: true,
        isActive: true,
      },
    })

    await createAuditLog({
      userId: actorId,
      organizationId,
      action: AuditAction.UPDATE,
      resourceType: "POULTRY_STRAIN",
      resourceId: strainId,
      before: existing,
      after: {
        isActive,
        ...(name !== undefined ? { name } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
    })

    return { success: true, data: strain }
  } catch {
    return {
      success: false,
      error: "Impossible de mettre a jour la souche avicole",
    }
  }
}
