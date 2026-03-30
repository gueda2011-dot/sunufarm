"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import {
  requireOrganizationModuleContext,
  type ActionResult,
} from "@/src/lib/auth"
import { createAuditLog, AuditAction } from "@/src/lib/audit"
import { requiredIdSchema } from "@/src/lib/validators"
import { logServerActionError } from "@/src/lib/logger"
import { registerPushDevice, deactivatePushDevice } from "@/src/lib/push-notifications"
import { PushDevicePlatform } from "@/src/generated/prisma/client"

const registerPushDeviceSchema = z.object({
  organizationId: requiredIdSchema,
  token: z.string().min(20, "Token push invalide."),
  platform: z.nativeEnum(PushDevicePlatform).default(PushDevicePlatform.WEB),
  deviceLabel: z.string().trim().max(120).optional(),
  userAgent: z.string().trim().max(500).optional(),
})

const deactivatePushDeviceSchema = z.object({
  organizationId: requiredIdSchema,
  token: z.string().min(20, "Token push invalide."),
})

export async function registerCurrentUserPushDevice(
  data: unknown,
): Promise<ActionResult<{ id: string; isActive: boolean }>> {
  try {
    const parsed = registerPushDeviceSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const accessResult = await requireOrganizationModuleContext(
      parsed.data.organizationId,
      "DASHBOARD",
    )
    if (!accessResult.success) return accessResult

    const device = await registerPushDevice({
      userId: accessResult.data.session.user.id,
      organizationId: parsed.data.organizationId,
      token: parsed.data.token,
      platform: parsed.data.platform,
      deviceLabel: parsed.data.deviceLabel,
      userAgent: parsed.data.userAgent,
    })

    await createAuditLog({
      userId: accessResult.data.session.user.id,
      organizationId: parsed.data.organizationId,
      action: AuditAction.CREATE,
      resourceType: "USER_PUSH_DEVICE",
      resourceId: device.id,
      after: {
        platform: device.platform,
        deviceLabel: device.deviceLabel,
        isActive: device.isActive,
      },
    })

    revalidatePath("/", "layout")

    return {
      success: true,
      data: {
        id: device.id,
        isActive: device.isActive,
      },
    }
  } catch (error) {
    logServerActionError("push.register_device_failed", error)
    return { success: false, error: "Impossible d'activer les notifications push." }
  }
}

export async function deactivateCurrentUserPushDevice(
  data: unknown,
): Promise<ActionResult<{ deactivated: number }>> {
  try {
    const parsed = deactivatePushDeviceSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const accessResult = await requireOrganizationModuleContext(
      parsed.data.organizationId,
      "DASHBOARD",
    )
    if (!accessResult.success) return accessResult

    const deactivated = await deactivatePushDevice({
      userId: accessResult.data.session.user.id,
      organizationId: parsed.data.organizationId,
      token: parsed.data.token,
    })

    if (deactivated > 0) {
      await createAuditLog({
        userId: accessResult.data.session.user.id,
        organizationId: parsed.data.organizationId,
        action: AuditAction.UPDATE,
        resourceType: "USER_PUSH_DEVICE",
        resourceId: parsed.data.token,
        after: {
          deactivated,
          isActive: false,
        },
      })
    }

    revalidatePath("/", "layout")

    return {
      success: true,
      data: {
        deactivated,
      },
    }
  } catch (error) {
    logServerActionError("push.deactivate_device_failed", error)
    return { success: false, error: "Impossible de desactiver ce device push." }
  }
}
