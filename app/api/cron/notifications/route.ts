import prisma from "@/src/lib/prisma"
import { getServerEnv } from "@/src/lib/env"
import { logger } from "@/src/lib/logger"
import { generateNotificationsForOrganization } from "@/src/actions/notifications"
import { sendOrganizationNotificationDigestEmails } from "@/src/lib/notification-emails"

export const dynamic = "force-dynamic"

function isAuthorized(request: Request) {
  const env = getServerEnv()
  const authHeader = request.headers.get("authorization")

  if (!env.CRON_SECRET) {
    return env.NODE_ENV !== "production"
  }

  return authHeader === `Bearer ${env.CRON_SECRET}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const organizations = await prisma.organization.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  })

  let organizationsProcessed = 0
  let notificationsCreated = 0
  let emailsSent = 0

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
      }
    } catch (error) {
      logger.error("notifications.cron_failed_for_organization", {
        organizationId: organization.id,
        organizationName: organization.name,
        error,
      })
    }
  }

  logger.info("notifications.cron_completed", {
    organizationsProcessed,
    notificationsCreated,
    emailsSent,
  })

  return Response.json({
    success: true,
    data: {
      organizationsProcessed,
      notificationsCreated,
      emailsSent,
    },
  })
}
