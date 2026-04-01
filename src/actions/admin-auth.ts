"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import prisma from "@/src/lib/prisma"
import { type ActionResult } from "@/src/lib/auth"
import { actionSuccess, forbidden, invalidInput, technicalError, unauthenticated } from "@/src/lib/action-result"
import { logger } from "@/src/lib/logger"
import { getSession } from "@/src/lib/auth"
import { sendVerificationEmailForAddress } from "@/src/actions/auth-recovery"
import { isEmailDeliveryConfigured } from "@/src/lib/email"

const resendVerificationSchema = z.object({
  userId: z.string().min(1, "Utilisateur requis"),
})

async function requireSuperAdmin() {
  const session = await getSession()
  if (!session?.user?.id) {
    return unauthenticated()
  }

  const membership = await prisma.userOrganization.findFirst({
    where: {
      userId: session.user.id,
      role: "SUPER_ADMIN",
    },
    select: { userId: true },
  })

  if (!membership) {
    return forbidden("Seul un super admin peut gerer les confirmations email.")
  }

  return actionSuccess({ session })
}

export async function adminResendVerificationEmail(
  input: unknown,
): Promise<ActionResult<{ email: string }>> {
  const authResult = await requireSuperAdmin()
  if (!authResult.success) return authResult

  const parsed = resendVerificationSchema.safeParse(input)
  if (!parsed.success) {
    return invalidInput(
      "Donnees invalides.",
      parsed.error.flatten().fieldErrors,
    )
  }

  if (!isEmailDeliveryConfigured()) {
    return technicalError("L'envoi d'emails n'est pas configure sur cet environnement.")
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: parsed.data.userId },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        deletedAt: true,
      },
    })

    if (!user || user.deletedAt) {
      return invalidInput("Compte introuvable.")
    }

    if (user.emailVerified) {
      return actionSuccess({ email: user.email })
    }

    const emailResult = await sendVerificationEmailForAddress(user.email)
    if (!emailResult.success) {
      return technicalError(emailResult.error)
    }

    revalidatePath("/admin")

    return actionSuccess({ email: user.email })
  } catch (error) {
    logger.error("admin.resend_verification_email_failed", {
      error,
      userId: parsed.data.userId,
    })

    return technicalError("Impossible de renvoyer l'email de confirmation pour le moment.")
  }
}

export async function adminResendVerificationEmailsBatch(): Promise<ActionResult<{ sent: number }>> {
  const authResult = await requireSuperAdmin()
  if (!authResult.success) return authResult

  if (!isEmailDeliveryConfigured()) {
    return technicalError("L'envoi d'emails n'est pas configure sur cet environnement.")
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        emailVerified: null,
      },
      select: {
        id: true,
        email: true,
      },
      take: 50,
      orderBy: { createdAt: "desc" },
    })

    let sent = 0

    for (const user of users) {
      const result = await sendVerificationEmailForAddress(user.email)
      if (result.success) {
        sent += 1
      } else {
        logger.warn("admin.resend_verification_email_batch_item_failed", {
          userId: user.id,
          email: user.email,
          error: result.error,
        })
      }
    }

    revalidatePath("/admin")

    return actionSuccess({ sent })
  } catch (error) {
    logger.error("admin.resend_verification_email_batch_failed", { error })
    return technicalError("Impossible de relancer les confirmations email pour le moment.")
  }
}
