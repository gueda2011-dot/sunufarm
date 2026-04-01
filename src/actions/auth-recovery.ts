"use server"

import bcrypt from "bcryptjs"
import { headers } from "next/headers"
import { z } from "zod"
import prisma from "@/src/lib/prisma"
import { type ActionResult } from "@/src/lib/auth"
import { logger } from "@/src/lib/logger"
import { getClientIpFromHeaders, applyRateLimit } from "@/src/lib/rate-limit"
import {
  consumePasswordResetToken,
  issueEmailVerificationToken,
  issuePasswordResetToken,
} from "@/src/lib/auth-tokens"
import {
  getAppBaseUrl,
  isEmailDeliveryConfigured,
  sendTransactionalEmail,
} from "@/src/lib/email"
import { normalizePhoneNumber } from "@/src/lib/validators"

const emailSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse email invalide"),
})

const loginVerificationRecoverySchema = z.object({
  identifier: z.string().trim().min(3, "Email ou numero requis"),
  password: z.string().min(1, "Mot de passe requis"),
})

const resetPasswordSchema = z.object({
  token: z.string().min(20, "Lien invalide"),
  password: z
    .string()
    .min(8, "8 caracteres minimum")
    .regex(/[a-z]/, "Ajoutez une minuscule")
    .regex(/[A-Z]/, "Ajoutez une majuscule")
    .regex(/[0-9]/, "Ajoutez un chiffre"),
  confirmPassword: z.string().min(1, "Confirmation requise"),
}).refine((data) => data.password === data.confirmPassword, {
  path: ["confirmPassword"],
  message: "Les mots de passe ne correspondent pas",
})

function buildAuthEmailLayout(title: string, intro: string, actionLabel: string, actionUrl: string) {
  const html = `
    <div style="font-family: Arial, sans-serif; background:#f6f7f9; padding:32px;">
      <div style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:16px; padding:32px; border:1px solid #e5e7eb;">
        <div style="font-size:24px; font-weight:700; color:#111827; margin-bottom:12px;">SunuFarm</div>
        <h1 style="font-size:22px; line-height:1.3; color:#111827; margin:0 0 16px;">${title}</h1>
        <p style="font-size:15px; line-height:1.6; color:#4b5563; margin:0 0 24px;">${intro}</p>
        <a href="${actionUrl}" style="display:inline-block; background:#16a34a; color:#ffffff; text-decoration:none; padding:14px 22px; border-radius:12px; font-weight:600;">
          ${actionLabel}
        </a>
        <p style="font-size:13px; line-height:1.6; color:#6b7280; margin:24px 0 0;">
          Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :<br />
          <a href="${actionUrl}" style="color:#16a34a;">${actionUrl}</a>
        </p>
      </div>
    </div>
  `

  const text = `${title}\n\n${intro}\n\n${actionLabel}: ${actionUrl}`

  return { html, text }
}

async function enforceRateLimit(scope: string, email: string) {
  const headersList = await headers()
  const ip = getClientIpFromHeaders(headersList)

  return applyRateLimit({
    key: `${scope}:${ip}:${email}`,
    limit: 5,
    windowMs: 15 * 60 * 1000,
  })
}

export async function sendVerificationEmailForAddress(email: string) {
  const { token } = await issueEmailVerificationToken(email)
  const verifyUrl = `${getAppBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`
  const mail = buildAuthEmailLayout(
    "Confirmez votre adresse email",
    "Cliquez sur le bouton ci-dessous pour activer votre compte SunuFarm et terminer votre inscription.",
    "Confirmer mon adresse",
    verifyUrl,
  )

  return sendTransactionalEmail({
    to: email,
    subject: "Confirmez votre adresse email SunuFarm",
    html: mail.html,
    text: mail.text,
  })
}

export async function requestEmailVerification(
  data: unknown,
): Promise<ActionResult<{ delivered: boolean }>> {
  const parsed = emailSchema.safeParse(data)
  if (!parsed.success) {
    return {
      success: false,
      error: "Adresse email invalide.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  if (!isEmailDeliveryConfigured()) {
    return {
      success: false,
      error: "L'envoi d'emails n'est pas encore configure sur cet environnement.",
    }
  }

  const rateLimit = await enforceRateLimit("email-verification", parsed.data.email)
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: "Trop de tentatives. Reessayez dans quelques minutes.",
    }
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        email: parsed.data.email,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        emailVerified: true,
      },
    })

    if (!user || user.emailVerified) {
      return { success: true, data: { delivered: true } }
    }

    const emailResult = await sendVerificationEmailForAddress(user.email)
    if (!emailResult.success) {
      return {
        success: false,
        error: emailResult.error,
      }
    }

    return { success: true, data: { delivered: true } }
  } catch (error) {
    logger.error("auth.request_email_verification_failed", { error })
    return {
      success: false,
      error: "Impossible d'envoyer l'email de confirmation pour le moment.",
    }
  }
}

export async function detectPendingEmailVerification(
  data: unknown,
): Promise<ActionResult<{ verificationRequired: boolean; email?: string }>> {
  const parsed = loginVerificationRecoverySchema.safeParse(data)

  if (!parsed.success) {
    return {
      success: false,
      error: "Donnees invalides.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  try {
    const identifier = parsed.data.identifier.trim()
    const normalizedEmail = identifier.toLowerCase()
    const normalizedPhone = normalizePhoneNumber(identifier)

    const user = await prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { email: normalizedEmail },
          { phone: normalizedPhone || "__never__" },
        ],
      },
      select: {
        email: true,
        emailVerified: true,
        passwordHash: true,
      },
    })

    if (!user || !user.passwordHash) {
      return {
        success: true,
        data: { verificationRequired: false },
      }
    }

    const passwordValid = await bcrypt.compare(
      parsed.data.password,
      user.passwordHash,
    )

    if (!passwordValid || user.emailVerified) {
      return {
        success: true,
        data: { verificationRequired: false },
      }
    }

    return {
      success: true,
      data: {
        verificationRequired: true,
        email: user.email,
      },
    }
  } catch (error) {
    logger.error("auth.detect_pending_email_verification_failed", { error })
    return {
      success: false,
      error: "Impossible de verifier l'etat du compte pour le moment.",
    }
  }
}

export async function requestPasswordReset(
  data: unknown,
): Promise<ActionResult<{ delivered: boolean }>> {
  const parsed = emailSchema.safeParse(data)
  if (!parsed.success) {
    return {
      success: false,
      error: "Adresse email invalide.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  if (!isEmailDeliveryConfigured()) {
    return {
      success: false,
      error: "L'envoi d'emails n'est pas encore configure sur cet environnement.",
    }
  }

  const rateLimit = await enforceRateLimit("password-reset", parsed.data.email)
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: "Trop de tentatives. Reessayez dans quelques minutes.",
    }
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        email: parsed.data.email,
        deletedAt: null,
      },
      select: {
        email: true,
      },
    })

    if (user) {
      const { token } = await issuePasswordResetToken(user.email)
      const resetUrl = `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`
      const mail = buildAuthEmailLayout(
        "Reinitialisez votre mot de passe",
        "Une demande de reinitialisation de mot de passe a ete recue pour votre compte SunuFarm.",
        "Choisir un nouveau mot de passe",
        resetUrl,
      )

      const emailResult = await sendTransactionalEmail({
        to: user.email,
        subject: "Reinitialisation de votre mot de passe SunuFarm",
        html: mail.html,
        text: mail.text,
      })

      if (!emailResult.success) {
        return {
          success: false,
          error: emailResult.error,
        }
      }
    }

    return { success: true, data: { delivered: true } }
  } catch (error) {
    logger.error("auth.request_password_reset_failed", { error })
    return {
      success: false,
      error: "Impossible d'envoyer l'email de reinitialisation pour le moment.",
    }
  }
}

export async function resetPasswordWithToken(
  data: unknown,
): Promise<ActionResult<{ email: string }>> {
  const parsed = resetPasswordSchema.safeParse(data)
  if (!parsed.success) {
    return {
      success: false,
      error: "Donnees invalides.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  try {
    const result = await consumePasswordResetToken(
      parsed.data.token,
      parsed.data.password,
    )

    if (!result.valid || !result.email) {
      return {
        success: false,
        error: result.reason === "expired"
          ? "Ce lien de reinitialisation a expire."
          : "Ce lien de reinitialisation est invalide.",
      }
    }

    return {
      success: true,
      data: { email: result.email },
    }
  } catch (error) {
    logger.error("auth.reset_password_failed", { error })
    return {
      success: false,
      error: "Impossible de reinitialiser le mot de passe pour le moment.",
    }
  }
}
