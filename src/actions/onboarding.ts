"use server"

import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { Prisma } from "@/src/generated/prisma"
import prisma from "@/src/lib/prisma"
import { auth } from "@/src/auth"
import {
  requireSession,
  type ActionResult,
} from "@/src/lib/auth"
import { createAuditLog, AuditAction } from "@/src/lib/audit"
import { phoneSchema } from "@/src/lib/validators"
import { slugify } from "@/src/lib/utils"
import {
  SubscriptionPlan,
  SubscriptionStatus,
  UserRole,
} from "@/src/generated/prisma/client"
import {
  TRIAL_AI_CREDITS,
  TRIAL_DAYS,
} from "@/src/lib/subscriptions"
import { logger } from "@/src/lib/logger"

const registerUserSchema = z.object({
  name: z.string().trim().min(2, "Nom requis").max(120, "Nom trop long"),
  email: z.string().trim().email("Adresse email invalide"),
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caracteres")
    .regex(/[a-z]/, "Ajoutez au moins une lettre minuscule")
    .regex(/[A-Z]/, "Ajoutez au moins une lettre majuscule")
    .regex(/[0-9]/, "Ajoutez au moins un chiffre"),
  confirmPassword: z.string().min(1, "Confirmez votre mot de passe"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
})

const completeOnboardingSchema = z.object({
  organizationName: z
    .string()
    .trim()
    .min(2, "Nom de l'exploitation requis")
    .max(120, "Nom trop long"),
  farmName: z
    .string()
    .trim()
    .min(2, "Nom de la premiere ferme requis")
    .max(120, "Nom trop long"),
  phone: phoneSchema,
  address: z.string().trim().max(255, "Adresse trop longue").optional(),
})

async function buildUniqueOrganizationSlug(name: string): Promise<string> {
  const baseSlug = slugify(name) || "exploitation"

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`
    const existing = await prisma.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })

    if (!existing) {
      return candidate
    }
  }

  return `${baseSlug}-${Date.now().toString().slice(-6)}`
}

export async function registerUserAccount(
  data: unknown,
): Promise<ActionResult<{ userId: string }>> {
  try {
    const session = await auth()
    if (session?.user?.id) {
      return {
        success: false,
        error: "Vous etes deja connecte. Terminez d'abord votre configuration.",
      }
    }

    const parsed = registerUserSchema.safeParse(data)
    if (!parsed.success) {
      return {
        success: false,
        error: "Donnees invalides",
        fieldErrors: parsed.error.flatten().fieldErrors,
      }
    }

    const email = parsed.data.email.trim().toLowerCase()
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, deletedAt: true },
    })

    if (existingUser) {
      return {
        success: false,
        error: "Un compte existe deja avec cette adresse email.",
      }
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12)
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name.trim(),
        email,
        passwordHash,
      },
      select: { id: true },
    })

    return { success: true, data: { userId: user.id } }
  } catch {
    return {
      success: false,
      error: "Impossible de creer votre compte pour le moment.",
    }
  }
}

export async function completeOnboarding(
  data: unknown,
): Promise<ActionResult<{ organizationId: string }>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = completeOnboardingSchema.safeParse(data)
    if (!parsed.success) {
      return {
        success: false,
        error: "Donnees invalides",
        fieldErrors: parsed.error.flatten().fieldErrors,
      }
    }

    const userId = sessionResult.data.user.id
    const existingMembership = await prisma.userOrganization.findFirst({
      where: { userId },
      select: { organizationId: true, role: true },
    })

    if (existingMembership?.role === UserRole.SUPER_ADMIN) {
      return {
        success: false,
        error: "Les super admins utilisent deja l'espace plateforme.",
      }
    }

    if (existingMembership) {
      return {
        success: false,
        error: "Votre organisation est deja configuree.",
      }
    }

    const organizationName = parsed.data.organizationName.trim()
    const farmName = parsed.data.farmName.trim()
    const phone = parsed.data.phone?.trim() || null
    const address = parsed.data.address?.trim() || null
    const slug = await buildUniqueOrganizationSlug(organizationName)

    const now = new Date()
    const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 86_400_000)

    const created = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: organizationName,
          slug,
          currency: "XOF",
          locale: "fr-SN",
          timezone: "Africa/Dakar",
          phone,
          address,
        },
        select: { id: true, name: true },
      })

      await tx.farm.create({
        data: {
          organizationId: organization.id,
          name: farmName,
          address,
        },
      })

      await tx.userOrganization.create({
        data: {
          userId,
          organizationId: organization.id,
          role: UserRole.OWNER,
        },
      })

      const subscription = await tx.subscription.create({
        data: {
          organizationId: organization.id,
          plan: SubscriptionPlan.BASIC,
          status: SubscriptionStatus.TRIAL,
          amountFcfa: 0,
          startedAt: now,
          trialEndsAt,
          aiCreditsTotal: TRIAL_AI_CREDITS,
          aiCreditsUsed: 0,
        },
        select: { id: true },
      })

      return {
        organizationId: organization.id,
        organizationName: organization.name,
        subscriptionId: subscription.id,
      }
    })

    await createAuditLog({
      userId,
      organizationId: created.organizationId,
      action: AuditAction.CREATE,
      resourceType: "ORGANIZATION",
      resourceId: created.organizationId,
      after: { name: created.organizationName, slug },
    })

    await createAuditLog({
      userId,
      organizationId: created.organizationId,
      action: AuditAction.CREATE,
      resourceType: "SUBSCRIPTION",
      resourceId: created.subscriptionId,
      after: {
        plan: SubscriptionPlan.BASIC,
        status: SubscriptionStatus.TRIAL,
        trialEndsAt,
      },
    })

    revalidatePath("/dashboard")
    revalidatePath("/settings")

    return {
      success: true,
      data: { organizationId: created.organizationId },
    }
  } catch (error) {
    logger.error("onboarding.complete_failed", { error })

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return {
          success: false,
          error: "Une exploitation avec des informations similaires existe deja. Reessayez avec un autre nom.",
        }
      }

      if (error.code === "P2021" || error.code === "P2022") {
        return {
          success: false,
          error: "La base de donnees de production n'est pas a jour pour terminer la configuration. Lancez les migrations Prisma puis reessayez.",
        }
      }
    }

    return {
      success: false,
      error: "Impossible de finaliser votre configuration pour le moment.",
    }
  }
}
