import prisma from "@/src/lib/prisma"
import { getAppBaseUrl, isEmailDeliveryConfigured, sendTransactionalEmail } from "@/src/lib/email"
import { getServerEnv } from "@/src/lib/env"
import { logger } from "@/src/lib/logger"
import { UserRole } from "@/src/generated/prisma/client"

interface AdminAlertRecipient {
  email: string
  name: string
}

interface AdminAlertInput {
  title: string
  intro: string
  details: Array<{ label: string; value: string }>
  actionLabel?: string
  actionUrl?: string
}

function parseConfiguredAdminAlertEmails(raw?: string) {
  if (!raw) return []

  return [...new Set(
    raw
      .split(/[;,]/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  )]
}

export async function resolveAdminAlertRecipients(): Promise<AdminAlertRecipient[]> {
  const configuredEmails = parseConfiguredAdminAlertEmails(getServerEnv().ADMIN_ALERT_EMAILS)

  if (configuredEmails.length > 0) {
    return configuredEmails.map((email) => ({
      email,
      name: "Admin",
    }))
  }

  const superAdmins = await prisma.userOrganization.findMany({
    where: {
      role: UserRole.SUPER_ADMIN,
      user: {
        deletedAt: null,
      },
    },
    select: {
      user: {
        select: {
          email: true,
          name: true,
        },
      },
    },
  })

  const recipients = new Map<string, AdminAlertRecipient>()
  for (const membership of superAdmins) {
    const email = membership.user.email?.trim().toLowerCase()
    if (!email) continue

    const existing = recipients.get(email)
    if (existing) continue

    recipients.set(email, {
      email,
      name: membership.user.name?.trim() || "Admin",
    })
  }

  return [...recipients.values()]
}

function buildAdminAlertEmail(input: AdminAlertInput) {
  const detailsHtml = input.details
    .map((detail) => `<li style="margin-bottom:10px;"><strong>${detail.label} :</strong> ${detail.value}</li>`)
    .join("")
  const detailsText = input.details
    .map((detail) => `- ${detail.label}: ${detail.value}`)
    .join("\n")

  const actionHtml = input.actionLabel && input.actionUrl
    ? `
      <p>
        <a href="${input.actionUrl}" style="display:inline-block;background:#166534;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;">
          ${input.actionLabel}
        </a>
      </p>
    `
    : ""

  const actionText = input.actionLabel && input.actionUrl
    ? `\n\n${input.actionLabel}: ${input.actionUrl}`
    : ""

  return {
    subject: `[SunuFarm] ${input.title}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
        <h2 style="color:#14532d;">${input.title}</h2>
        <p>${input.intro}</p>
        <ul style="padding-left:20px;">${detailsHtml}</ul>
        ${actionHtml}
      </div>
    `,
    text: `${input.title}\n\n${input.intro}\n\n${detailsText}${actionText}`,
  }
}

export async function sendAdminAlertEmail(input: AdminAlertInput) {
  try {
    if (!isEmailDeliveryConfigured()) {
      return { success: true as const, sent: 0, skipped: true as const }
    }

    const recipients = await resolveAdminAlertRecipients()
    if (recipients.length === 0) {
      logger.warn("admin_alerts.no_recipients", { title: input.title })
      return { success: true as const, sent: 0, skipped: true as const }
    }

    const mail = buildAdminAlertEmail(input)
    let sent = 0

    for (const recipient of recipients) {
      const result = await sendTransactionalEmail({
        to: recipient.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      })

      if (result.success) {
        sent += 1
        continue
      }

      logger.warn("admin_alerts.send_failed", {
        title: input.title,
        recipientEmail: recipient.email,
      })
    }

    return { success: true as const, sent, skipped: false as const }
  } catch (error) {
    logger.error("admin_alerts.unexpected_failure", {
      title: input.title,
      error,
    })

    return { success: false as const, sent: 0, skipped: true as const }
  }
}

export function getAdminBaseUrl(path: string) {
  return `${getAppBaseUrl()}${path}`
}
