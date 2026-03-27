import { Resend } from "resend"
import { logger } from "@/src/lib/logger"

export interface TransactionalEmailInput {
  to: string
  subject: string
  html: string
  text: string
}

let resendClient: Resend | null = null

export function isEmailDeliveryConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM)
}

export function getAppBaseUrl() {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.AUTH_URL,
    process.env.NEXTAUTH_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    "http://localhost:3000",
  ]

  for (const candidate of candidates) {
    if (!candidate) continue

    try {
      const url = new URL(candidate)
      return url.origin
    } catch {
      continue
    }
  }

  return "http://localhost:3000"
}

function getResendClient() {
  if (!process.env.RESEND_API_KEY) return null

  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY)
  }

  return resendClient
}

export async function sendTransactionalEmail(input: TransactionalEmailInput) {
  const client = getResendClient()
  const from = process.env.MAIL_FROM

  if (!client || !from) {
    logger.warn("email.not_configured", {
      to: input.to,
      subject: input.subject,
    })

    return {
      success: false as const,
      error: "L'envoi d'emails n'est pas configure sur cet environnement.",
    }
  }

  try {
    await client.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    })

    return { success: true as const }
  } catch (error) {
    logger.error("email.send_failed", {
      error,
      to: input.to,
      subject: input.subject,
    })

    return {
      success: false as const,
      error: "Impossible d'envoyer l'email pour le moment.",
    }
  }
}
