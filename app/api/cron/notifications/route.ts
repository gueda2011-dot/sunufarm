import prisma from "@/src/lib/prisma"
import { getServerEnv } from "@/src/lib/env"
import { logger } from "@/src/lib/logger"
import { getRequestId } from "@/src/lib/request-security"
import { generateNotificationsForOrganization } from "@/src/actions/notifications"
import { sendOrganizationNotificationDigestEmails } from "@/src/lib/notification-emails"
import { sendOrganizationNotificationPushes } from "@/src/lib/push-notifications"

export const dynamic = "force-dynamic"

function isAuthorized(request: Request) {
  const env = getServerEnv()
  const authHeader = request.headers.get("authorization")

  // Exiger le secret dans tous les environnements — pas de fallback permissif
  if (!env.CRON_SECRET) {
    return false
  }

  return authHeader === `Bearer ${env.CRON_SECRET}`
}

export async function GET(request: Request) {
  const requestId = getRequestId(request.headers)

  if (!isAuthorized(request)) {
    logger.warn("notifications.cron_unauthorized", { requestId })
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  logger.info("notifications.cron_started", { requestId })

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
      logger.error("notifications.cron_failed_for_organization", {
        requestId,
        organizationId: organization.id,
        organizationName: organization.name,
        error,
      })
    }
  }

  logger.info("notifications.cron_completed", {
    requestId,
    organizationsProcessed,
    notificationsCreated,
    emailsSent,
    pushSent,
    pushInvalidated,
  })

  return Response.json({
    success: true,
    data: {
      organizationsProcessed,
      notificationsCreated,
      emailsSent,
      pushSent,
      pushInvalidated,
    },
  })
}
