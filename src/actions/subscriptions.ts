"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import prisma from "@/src/lib/prisma"
import {
  requireSession,
  requireMembership,
  type ActionResult,
} from "@/src/lib/auth"
import { createAuditLog, AuditAction } from "@/src/lib/audit"
import {
  PaymentMethod,
  SubscriptionPaymentStatus,
  SubscriptionPlan,
  UserRole,
} from "@/src/generated/prisma/client"
import { requiredIdSchema } from "@/src/lib/validators"
import {
  PLAN_DEFINITIONS,
} from "@/src/lib/subscriptions"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"

const createSubscriptionPaymentSchema = z.object({
  organizationId: requiredIdSchema,
  requestedPlan: z.nativeEnum(SubscriptionPlan),
  paymentMethod: z.nativeEnum(PaymentMethod),
  paymentReference: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
})

const manageSubscriptionPaymentSchema = z.object({
  organizationId: requiredIdSchema,
  paymentId: requiredIdSchema,
})

export async function createSubscriptionPaymentRequest(
  data: unknown,
): Promise<ActionResult<{ paymentId: string }>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = createSubscriptionPaymentSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const {
      organizationId,
      requestedPlan,
      paymentMethod,
      paymentReference,
      notes,
    } = parsed.data
    const actorId = sessionResult.data.user.id

    const membershipResult = await requireMembership(actorId, organizationId)
    if (!membershipResult.success) return membershipResult

    const currentSubscription = await getOrganizationSubscription(organizationId)
    if (currentSubscription.plan === requestedPlan) {
      return { success: false, error: "Votre organisation est deja sur ce plan." }
    }

    const existingPending = await prisma.subscriptionPayment.findFirst({
      where: {
        organizationId,
        requestedPlan,
        status: SubscriptionPaymentStatus.PENDING,
      },
      select: { id: true },
    })

    if (existingPending) {
      return {
        success: false,
        error: "Une demande de paiement est deja en attente pour ce plan.",
      }
    }

    const payment = await prisma.subscriptionPayment.create({
      data: {
        organizationId,
        requestedPlan,
        amountFcfa: PLAN_DEFINITIONS[requestedPlan].monthlyPriceFcfa,
        paymentMethod,
        paymentReference: paymentReference || null,
        notes: notes || null,
        requestedById: actorId,
        paidAt: new Date(),
      },
      select: { id: true },
    })

    await createAuditLog({
      userId: actorId,
      organizationId,
      action: AuditAction.CREATE,
      resourceType: "SUBSCRIPTION_PAYMENT",
      resourceId: payment.id,
      after: {
        requestedPlan,
        paymentMethod,
        paymentReference: paymentReference || null,
      },
    })

    revalidatePath("/settings")

    return {
      success: true,
      data: { paymentId: payment.id },
    }
  } catch {
    return {
      success: false,
      error: "Impossible d'enregistrer la demande de paiement.",
    }
  }
}

export async function confirmSubscriptionPayment(
  data: unknown,
): Promise<ActionResult<{ plan: SubscriptionPlan }>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = manageSubscriptionPaymentSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const { organizationId, paymentId } = parsed.data
    const actorId = sessionResult.data.user.id

    const membershipResult = await requireMembership(actorId, organizationId)
    if (!membershipResult.success) return membershipResult

    if (membershipResult.data.role !== UserRole.OWNER) {
      return { success: false, error: "Seul un proprietaire peut confirmer un paiement." }
    }

    const payment = await prisma.subscriptionPayment.findFirst({
      where: {
        id: paymentId,
        organizationId,
        status: SubscriptionPaymentStatus.PENDING,
      },
      select: {
        id: true,
        requestedPlan: true,
        amountFcfa: true,
      },
    })

    if (!payment) {
      return { success: false, error: "Paiement en attente introuvable." }
    }

    const existingSubscription = await prisma.subscription.findUnique({
      where: { organizationId },
      select: {
        id: true,
        plan: true,
        currentPeriodEnd: true,
      },
    })

    const now = new Date()
    const isRenewal =
      existingSubscription?.plan === payment.requestedPlan
      && existingSubscription.currentPeriodEnd != null
      && existingSubscription.currentPeriodEnd > now

    const periodStart = isRenewal && existingSubscription?.currentPeriodEnd
      ? existingSubscription.currentPeriodEnd
      : now
    const periodEnd = new Date(periodStart)
    periodEnd.setDate(periodEnd.getDate() + 30)

    await prisma.$transaction(async (tx) => {
      await tx.subscriptionPayment.update({
        where: { id: payment.id },
        data: {
          status: SubscriptionPaymentStatus.CONFIRMED,
          confirmedById: actorId,
          confirmedAt: now,
        },
      })

      if (existingSubscription) {
        await tx.subscription.update({
          where: { organizationId },
          data: {
            plan: payment.requestedPlan,
            status: "ACTIVE",
            amountFcfa: payment.amountFcfa,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            canceledAt: null,
          },
        })
      } else {
        await tx.subscription.create({
          data: {
            organizationId,
            plan: payment.requestedPlan,
            status: "ACTIVE",
            amountFcfa: payment.amountFcfa,
            startedAt: now,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
          },
        })
      }
    })

    await createAuditLog({
      userId: actorId,
      organizationId,
      action: AuditAction.UPDATE,
      resourceType: "SUBSCRIPTION_PAYMENT",
      resourceId: payment.id,
      after: {
        status: SubscriptionPaymentStatus.CONFIRMED,
        requestedPlan: payment.requestedPlan,
      },
    })

    revalidatePath("/settings")

    return {
      success: true,
      data: { plan: payment.requestedPlan },
    }
  } catch {
    return { success: false, error: "Impossible de confirmer ce paiement." }
  }
}

export async function rejectSubscriptionPayment(
  data: unknown,
): Promise<ActionResult<void>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = manageSubscriptionPaymentSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const { organizationId, paymentId } = parsed.data
    const actorId = sessionResult.data.user.id

    const membershipResult = await requireMembership(actorId, organizationId)
    if (!membershipResult.success) return membershipResult

    if (membershipResult.data.role !== UserRole.OWNER) {
      return { success: false, error: "Seul un proprietaire peut refuser un paiement." }
    }

    const payment = await prisma.subscriptionPayment.findFirst({
      where: {
        id: paymentId,
        organizationId,
        status: SubscriptionPaymentStatus.PENDING,
      },
      select: { id: true },
    })

    if (!payment) {
      return { success: false, error: "Paiement en attente introuvable." }
    }

    await prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        status: SubscriptionPaymentStatus.REJECTED,
        confirmedById: actorId,
        rejectedAt: new Date(),
      },
    })

    await createAuditLog({
      userId: actorId,
      organizationId,
      action: AuditAction.UPDATE,
      resourceType: "SUBSCRIPTION_PAYMENT",
      resourceId: payment.id,
      after: { status: SubscriptionPaymentStatus.REJECTED },
    })

    revalidatePath("/settings")

    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Impossible de refuser ce paiement." }
  }
}
