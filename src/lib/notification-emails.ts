import prisma from "@/src/lib/prisma"
import {
  getAppBaseUrl,
  isEmailDeliveryConfigured,
  sendTransactionalEmail,
} from "@/src/lib/email"
import { logger } from "@/src/lib/logger"

function buildDigestEmail(input: {
  organizationName: string
  recipientName: string
  notifications: Array<{
    title: string
    message: string
  }>
}) {
  const dashboardUrl = `${getAppBaseUrl()}/dashboard`
  const introName = input.recipientName.trim() || "Equipe"
  const itemsHtml = input.notifications
    .map((notification) => (
      `<li style="margin-bottom:12px;"><strong>${notification.title}</strong><br />${notification.message}</li>`
    ))
    .join("")

  const itemsText = input.notifications
    .map((notification) => `- ${notification.title}: ${notification.message}`)
    .join("\n")

  return {
    subject: `[SunuFarm] ${input.notifications.length} nouvelle(s) alerte(s) - ${input.organizationName}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
        <h2 style="color:#14532d;">Bonjour ${introName},</h2>
        <p>De nouvelles alertes ont ete detectees automatiquement pour <strong>${input.organizationName}</strong>.</p>
        <ul style="padding-left:20px;">${itemsHtml}</ul>
        <p>
          <a href="${dashboardUrl}" style="display:inline-block;background:#166534;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;">
            Ouvrir SunuFarm
          </a>
        </p>
      </div>
    `,
    text: [
      `Bonjour ${introName},`,
      "",
      `De nouvelles alertes ont ete detectees automatiquement pour ${input.organizationName}.`,
      "",
      itemsText,
      "",
      `Ouvrir SunuFarm: ${dashboardUrl}`,
    ].join("\n"),
  }
}

export async function sendOrganizationNotificationDigestEmails(args: {
  organizationId: string
  createdAfter: Date
}) {
  if (!isEmailDeliveryConfigured()) {
    return { success: true as const, sent: 0, skipped: true as const }
  }

  const notifications = await prisma.notification.findMany({
    where: {
      organizationId: args.organizationId,
      createdAt: { gte: args.createdAfter },
    },
    select: {
      title: true,
      message: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      organization: {
        select: {
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  if (notifications.length === 0) {
    return { success: true as const, sent: 0, skipped: false as const }
  }

  const notificationPreferences = await prisma.userOrganization.findMany({
    where: {
      organizationId: args.organizationId,
      emailNotificationsEnabled: true,
      user: {
        deletedAt: null,
      },
    },
    select: {
      userId: true,
    },
  })

  const enabledUserIds = new Set(notificationPreferences.map((membership) => membership.userId))
  if (enabledUserIds.size === 0) {
    return { success: true as const, sent: 0, skipped: false as const }
  }

  const organizationName = notifications[0]?.organization.name ?? "SunuFarm"
  const groupedByUser = new Map<string, {
    email: string
    name: string
    notifications: Array<{ title: string; message: string }>
  }>()

  for (const notification of notifications) {
    if (!enabledUserIds.has(notification.user.id)) continue

    const email = notification.user.email?.trim()
    if (!email) continue

    const existing = groupedByUser.get(notification.user.id)
    if (existing) {
      existing.notifications.push({
        title: notification.title,
        message: notification.message,
      })
      continue
    }

    groupedByUser.set(notification.user.id, {
      email,
      name: notification.user.name ?? "",
      notifications: [{
        title: notification.title,
        message: notification.message,
      }],
    })
  }

  let sent = 0

  for (const recipient of groupedByUser.values()) {
    const mail = buildDigestEmail({
      organizationName,
      recipientName: recipient.name,
      notifications: recipient.notifications,
    })

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

    logger.warn("notifications.digest_email_failed", {
      organizationId: args.organizationId,
      recipientEmail: recipient.email,
      notificationsCount: recipient.notifications.length,
    })
  }

  return {
    success: true as const,
    sent,
    skipped: false as const,
  }
}
