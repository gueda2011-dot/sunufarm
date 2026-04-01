import prisma from "@/src/lib/prisma"
import { logger } from "@/src/lib/logger"
import { sendPushNotificationToUser } from "@/src/lib/push-notifications"
import {
  NotificationStatus,
  NotificationType,
  Prisma,
  UserRole,
} from "@/src/generated/prisma/client"

function calendarDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

interface AdminEventNotificationInput {
  organizationId: string
  title: string
  message: string
  resourceType: string
  resourceId: string
  metadata?: Record<string, unknown>
  link?: string
  excludeUserIds?: string[]
}

export async function createAdminEventNotifications(
  input: AdminEventNotificationInput,
) {
  const targetMembers = await prisma.userOrganization.findMany({
    where: {
      organizationId: input.organizationId,
      role: UserRole.SUPER_ADMIN,
      user: { deletedAt: null },
      ...(input.excludeUserIds && input.excludeUserIds.length > 0
        ? { userId: { notIn: input.excludeUserIds } }
        : {}),
    },
    select: {
      userId: true,
    },
  })

  if (targetMembers.length === 0) {
    return {
      created: 0,
      pushSent: 0,
      pushInvalidated: 0,
      targetedUserIds: [] as string[],
    }
  }

  const targetUserIds = targetMembers.map((member) => member.userId)
  const todayStart = calendarDayStart(new Date())
  const existingNotifications = await prisma.notification.findMany({
    where: {
      organizationId: input.organizationId,
      userId: { in: targetUserIds },
      type: NotificationType.AUTRE,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      status: { in: [NotificationStatus.NON_LU, NotificationStatus.LU] },
      createdAt: { gte: todayStart },
    },
    select: {
      userId: true,
    },
  })

  const existingUserIds = new Set(existingNotifications.map((notification) => notification.userId))
  const userIdsToNotify = targetUserIds.filter((userId) => !existingUserIds.has(userId))

  if (userIdsToNotify.length === 0) {
    return {
      created: 0,
      pushSent: 0,
      pushInvalidated: 0,
      targetedUserIds: targetUserIds,
    }
  }

  const createdNotifications = await prisma.$transaction(
    userIdsToNotify.map((userId) => prisma.notification.create({
      data: {
        organizationId: input.organizationId,
        userId,
        type: NotificationType.AUTRE,
        title: input.title,
        message: input.message,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        ...(input.metadata !== undefined
          ? { metadata: input.metadata as Prisma.InputJsonValue }
          : {}),
      },
      select: {
        id: true,
        userId: true,
        title: true,
        message: true,
        resourceType: true,
        resourceId: true,
      },
    })),
  )

  let pushSent = 0
  let pushInvalidated = 0

  for (const notification of createdNotifications) {
    try {
      const pushResult = await sendPushNotificationToUser({
        organizationId: input.organizationId,
        userId: notification.userId,
        message: {
          organizationId: input.organizationId,
          title: notification.title,
          body: notification.message,
          resourceType: notification.resourceType,
          resourceId: notification.resourceId,
          notificationId: notification.id,
          link: input.link,
          data: {
            channel: "admin-event",
          },
        },
      })

      pushSent += pushResult.sent
      pushInvalidated += pushResult.invalidated
    } catch (error) {
      logger.error("admin_event_notifications.push_failed", {
        organizationId: input.organizationId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        userId: notification.userId,
        error,
      })
    }
  }

  return {
    created: createdNotifications.length,
    pushSent,
    pushInvalidated,
    targetedUserIds: targetUserIds,
  }
}
