"use server"

import { redirect } from "next/navigation"
import { auth } from "@/src/auth"
import prisma from "@/src/lib/prisma"
import { logger } from "@/src/lib/logger"
import { generateNotificationsForOrganization } from "@/src/actions/notifications"
import { sendOrganizationNotificationDigestEmails } from "@/src/lib/notification-emails"
import { sendOrganizationNotificationPushes } from "@/src/lib/push-notifications"

export interface TriggerNotificationsResult {
  success: boolean
  organizationsProcessed: number
  notificationsCreated: number
  emailsSent: number
  pushSent: number
  pushInvalidated: number
  error?: string
}

export async function adminTriggerNotifications(): Promise<TriggerNotificationsResult> {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const isSuperAdmin = await prisma.userOrganization.findFirst({
    where: { userId: session.user.id, role: "SUPER_ADMIN" },
    select: { id: true },
  })

  if (!isSuperAdmin) {
    return { success: false, organizationsProcessed: 0, notificationsCreated: 0, emailsSent: 0, pushSent: 0, pushInvalidated: 0, error: "Permission refusee" }
  }

  const organizations = await prisma.organization.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  })

  let organizationsProcessed = 0
  let notificationsCreated = 0
  let emailsSent = 0
  let pushSent = 0
  let pushInvalidated = 0

  for (const organization of organizations) {
    const runStartedAt = new Date()

    try {
      const result = await generateNotificationsForOrganization(organization.id)
      notificationsCreated += result.created
      organizationsProcessed += 1

      if (result.created > 0) {
        const emailResult = await sendOrganizationNotificationDigestEmails({
          organizationId: organization.id,
          createdAfter: runStartedAt,
        })
        emailsSent += emailResult.sent

        const pushResult = await sendOrganizationNotificationPushes({
          organizationId: organization.id,
          createdAfter: runStartedAt,
        })
        pushSent += pushResult.sent
        pushInvalidated += pushResult.invalidated
      }
    } catch (error) {
      logger.error("admin.trigger_notifications_failed_for_org", {
        organizationId: organization.id,
        organizationName: organization.name,
        error,
      })
    }
  }

  return {
    success: true,
    organizationsProcessed,
    notificationsCreated,
    emailsSent,
    pushSent,
    pushInvalidated,
  }
}
