import prisma from "@/src/lib/prisma"
import { logger } from "@/src/lib/logger"
import { getFirebaseAdminMessaging, isFirebaseAdminConfigured } from "@/src/lib/firebase-admin"
import { PushDevicePlatform } from "@/src/generated/prisma/client"

const INVALID_FCM_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
])

interface RegisterPushDeviceInput {
  userId: string
  organizationId: string
  token: string
  platform?: PushDevicePlatform
  deviceLabel?: string | null
  userAgent?: string | null
}

interface DeactivatePushDeviceInput {
  userId: string
  organizationId: string
  token: string
}

interface PushMessageInput {
  title: string
  body: string
  link?: string
  organizationId: string
  resourceType?: string | null
  resourceId?: string | null
  notificationId?: string | null
  data?: Record<string, string | null | undefined>
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

function toStringData(data: Record<string, string | null | undefined>) {
  return Object.fromEntries(
    Object.entries(data).flatMap(([key, value]) => (
      value === undefined || value === null ? [] : [[key, value]]
    )),
  )
}

function inferNotificationLink(input: {
  resourceType?: string | null
  resourceId?: string | null
}) {
  if (input.resourceType === "FEED_STOCK" || input.resourceType === "MEDICINE_STOCK" || input.resourceType === "MEDICINE_STOCK_EXPIRY") {
    return "/stock"
  }

  if (input.resourceType === "BATCH" && input.resourceId) {
    return `/batches/${input.resourceId}`
  }

  return "/dashboard"
}

export async function registerPushDevice(input: RegisterPushDeviceInput) {
  const device = await prisma.userPushDevice.upsert({
    where: {
      organizationId_token: {
        organizationId: input.organizationId,
        token: input.token,
      },
    },
    update: {
      userId: input.userId,
      platform: input.platform ?? PushDevicePlatform.WEB,
      deviceLabel: input.deviceLabel ?? undefined,
      userAgent: input.userAgent ?? undefined,
      isActive: true,
      lastSeenAt: new Date(),
    },
    create: {
      userId: input.userId,
      organizationId: input.organizationId,
      token: input.token,
      platform: input.platform ?? PushDevicePlatform.WEB,
      deviceLabel: input.deviceLabel ?? undefined,
      userAgent: input.userAgent ?? undefined,
      isActive: true,
      lastSeenAt: new Date(),
    },
    select: {
      id: true,
      token: true,
      isActive: true,
      platform: true,
      deviceLabel: true,
      lastSeenAt: true,
    },
  })

  logger.info("push.device_registered", {
    organizationId: input.organizationId,
    userId: input.userId,
    platform: device.platform,
    deviceId: device.id,
  })

  return device
}

export async function deactivatePushDevice(input: DeactivatePushDeviceInput) {
  const result = await prisma.userPushDevice.updateMany({
    where: {
      userId: input.userId,
      organizationId: input.organizationId,
      token: input.token,
      isActive: true,
    },
    data: {
      isActive: false,
    },
  })

  if (result.count > 0) {
    logger.info("push.device_deactivated", {
      organizationId: input.organizationId,
      userId: input.userId,
      deactivatedDevices: result.count,
    })
  }

  return result.count
}

async function deactivatePushDevicesByIds(deviceIds: string[]) {
  if (deviceIds.length === 0) return 0

  const devices = await prisma.userPushDevice.findMany({
    where: {
      id: { in: deviceIds },
    },
    select: {
      token: true,
    },
  })

  const tokens = [...new Set(devices.map((device) => device.token))]

  const result = await prisma.userPushDevice.updateMany({
    where: {
      OR: [
        { id: { in: deviceIds } },
        ...(tokens.length > 0 ? [{ token: { in: tokens } }] : []),
      ],
      isActive: true,
    },
    data: {
      isActive: false,
    },
  })

  if (result.count > 0) {
    logger.warn("push.devices_deactivated_invalid_token", {
      deactivatedDevices: result.count,
      deviceIds,
    })
  }

  return result.count
}

export async function sendPushNotification(
  devices: Array<{ id: string; token: string }>,
  message: PushMessageInput,
) {
  if (!isFirebaseAdminConfigured()) {
    return {
      success: true as const,
      skipped: true as const,
      sent: 0,
      invalidated: 0,
    }
  }

  if (devices.length === 0) {
    return {
      success: true as const,
      skipped: false as const,
      sent: 0,
      invalidated: 0,
    }
  }

  const messaging = getFirebaseAdminMessaging()
  let sent = 0
  const invalidDeviceIds: string[] = []

  for (const chunk of chunkArray(devices, 500)) {
    const response = await messaging.sendEachForMulticast({
      tokens: chunk.map((device) => device.token),
      data: toStringData({
        title: message.title,
        body: message.body,
        link: message.link ?? inferNotificationLink(message),
        organizationId: message.organizationId,
        resourceType: message.resourceType,
        resourceId: message.resourceId,
        notificationId: message.notificationId,
        ...message.data,
      }),
      webpush: {
        headers: {
          Urgency: "high",
        },
        fcmOptions: {
          link: message.link ?? inferNotificationLink(message),
        },
      },
    })

    response.responses.forEach((result, index) => {
      if (result.success) {
        sent += 1
        return
      }

      const code = result.error?.code ?? "unknown"
      const device = chunk[index]

      logger.warn("push.send_failed", {
        organizationId: message.organizationId,
        deviceId: device?.id,
        code,
        errorMessage: result.error?.message,
      })

      if (device && INVALID_FCM_TOKEN_CODES.has(code)) {
        invalidDeviceIds.push(device.id)
      }
    })
  }

  const invalidated = await deactivatePushDevicesByIds(invalidDeviceIds)

  return {
    success: true as const,
    skipped: false as const,
    sent,
    invalidated,
  }
}

export async function sendPushNotificationToUser(input: {
  organizationId: string
  userId: string
  message: PushMessageInput
}) {
  const devices = await prisma.userPushDevice.findMany({
    where: {
      organizationId: input.organizationId,
      userId: input.userId,
      isActive: true,
    },
    select: {
      id: true,
      token: true,
    },
  })

  return sendPushNotification(devices, input.message)
}

export async function sendOrganizationNotificationPushes(args: {
  organizationId: string
  createdAfter: Date
}) {
  if (!isFirebaseAdminConfigured()) {
    return { success: true as const, sent: 0, invalidated: 0, skipped: true as const }
  }

  const notifications = await prisma.notification.findMany({
    where: {
      organizationId: args.organizationId,
      createdAt: { gte: args.createdAfter },
    },
    select: {
      id: true,
      userId: true,
      title: true,
      message: true,
      resourceType: true,
      resourceId: true,
      organization: {
        select: {
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  if (notifications.length === 0) {
    return { success: true as const, sent: 0, invalidated: 0, skipped: false as const }
  }

  const devices = await prisma.userPushDevice.findMany({
    where: {
      organizationId: args.organizationId,
      isActive: true,
      userId: { in: [...new Set(notifications.map((notification) => notification.userId))] },
    },
    select: {
      id: true,
      userId: true,
      token: true,
    },
  })

  if (devices.length === 0) {
    return { success: true as const, sent: 0, invalidated: 0, skipped: false as const }
  }

  const devicesByUser = new Map<string, Array<{ id: string; token: string }>>()
  for (const device of devices) {
    const group = devicesByUser.get(device.userId)
    if (group) {
      group.push({ id: device.id, token: device.token })
      continue
    }

    devicesByUser.set(device.userId, [{ id: device.id, token: device.token }])
  }

  let sent = 0
  let invalidated = 0
  const organizationName = notifications[0]?.organization.name ?? "SunuFarm"
  const notificationsByUser = new Map<string, typeof notifications>()

  for (const notification of notifications) {
    const group = notificationsByUser.get(notification.userId)
    if (group) {
      group.push(notification)
      continue
    }

    notificationsByUser.set(notification.userId, [notification])
  }

  for (const [userId, userNotifications] of notificationsByUser.entries()) {
    const userDevices = devicesByUser.get(userId)
    if (!userDevices || userDevices.length === 0) continue

    const latestNotification = userNotifications[0]
    const count = userNotifications.length
    const result = await sendPushNotification(userDevices, {
      organizationId: args.organizationId,
      title: count > 1
        ? `${count} nouvelles alertes SunuFarm`
        : latestNotification.title,
      body: count > 1
        ? `De nouvelles alertes terrain vous attendent pour ${organizationName}.`
        : latestNotification.message,
      notificationId: latestNotification.id,
      resourceType: latestNotification.resourceType,
      resourceId: latestNotification.resourceId,
      data: {
        count: String(count),
      },
    })

    sent += result.sent
    invalidated += result.invalidated
  }

  return {
    success: true as const,
    sent,
    invalidated,
    skipped: false as const,
  }
}
