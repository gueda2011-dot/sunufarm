"use server"

import { z } from "zod"
import { Prisma } from "@/src/generated/prisma"
import prisma from "@/src/lib/prisma"
import {
  requireSession,
  requireMembership,
  type ActionResult,
} from "@/src/lib/auth"
import { optionalIdSchema } from "@/src/lib/validators"
import {
  isDraftPayloadTooLarge,
  sanitizeDraftPayload,
} from "@/src/lib/server-drafts"

const formDraftSchema = z.object({
  formKey: z.string().min(1).max(120),
  organizationId: optionalIdSchema,
})

const saveFormDraftSchema = formDraftSchema.extend({
  title: z.string().max(120).optional(),
  payload: z.record(z.string(), z.unknown()),
})

export interface SavedFormDraft {
  formKey: string
  title: string | null
  payload: Record<string, unknown>
  updatedAt: Date
}

async function validateOptionalDraftOrganization(
  userId: string,
  organizationId?: string | null,
): Promise<ActionResult<void>> {
  if (!organizationId) {
    return { success: true, data: undefined }
  }

  const membershipResult = await requireMembership(userId, organizationId)
  if (!membershipResult.success) return membershipResult

  return { success: true, data: undefined }
}

export async function getFormDraft(
  data: unknown,
): Promise<ActionResult<SavedFormDraft | null>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = formDraftSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Brouillon invalide" }
    }

    const accessResult = await validateOptionalDraftOrganization(
      sessionResult.data.user.id,
      parsed.data.organizationId,
    )
    if (!accessResult.success) return accessResult

    const draft = await prisma.formDraft.findUnique({
      where: {
        userId_formKey: {
          userId: sessionResult.data.user.id,
          formKey: parsed.data.formKey,
        },
      },
      select: {
        formKey: true,
        title: true,
        payload: true,
        updatedAt: true,
      },
    })

    if (!draft) {
      return { success: true, data: null }
    }

    return {
      success: true,
      data: {
        formKey: draft.formKey,
        title: draft.title,
        payload: draft.payload as Record<string, unknown>,
        updatedAt: draft.updatedAt,
      },
    }
  } catch {
    return { success: false, error: "Impossible de recuperer le brouillon" }
  }
}

export async function saveFormDraft(
  data: unknown,
): Promise<ActionResult<SavedFormDraft>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = saveFormDraftSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Brouillon invalide" }
    }

    const accessResult = await validateOptionalDraftOrganization(
      sessionResult.data.user.id,
      parsed.data.organizationId,
    )
    if (!accessResult.success) return accessResult

    const payload = sanitizeDraftPayload(parsed.data.payload) as Prisma.InputJsonValue

    if (isDraftPayloadTooLarge(payload)) {
      return { success: false, error: "Le brouillon est trop volumineux" }
    }

    const draft = await prisma.formDraft.upsert({
      where: {
        userId_formKey: {
          userId: sessionResult.data.user.id,
          formKey: parsed.data.formKey,
        },
      },
      update: {
        organizationId: parsed.data.organizationId ?? null,
        title: parsed.data.title ?? null,
        payload,
      },
      create: {
        userId: sessionResult.data.user.id,
        organizationId: parsed.data.organizationId ?? null,
        formKey: parsed.data.formKey,
        title: parsed.data.title ?? null,
        payload,
      },
      select: {
        formKey: true,
        title: true,
        payload: true,
        updatedAt: true,
      },
    })

    return {
      success: true,
      data: {
        formKey: draft.formKey,
        title: draft.title,
        payload: draft.payload as Record<string, unknown>,
        updatedAt: draft.updatedAt,
      },
    }
  } catch {
    return { success: false, error: "Impossible d'enregistrer le brouillon" }
  }
}

export async function clearFormDraft(
  data: unknown,
): Promise<ActionResult<void>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = formDraftSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Brouillon invalide" }
    }

    const accessResult = await validateOptionalDraftOrganization(
      sessionResult.data.user.id,
      parsed.data.organizationId,
    )
    if (!accessResult.success) return accessResult

    await prisma.formDraft.deleteMany({
      where: {
        userId: sessionResult.data.user.id,
        formKey: parsed.data.formKey,
      },
    })

    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Impossible de supprimer le brouillon" }
  }
}
