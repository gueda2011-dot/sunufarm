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
  TRIAL_DAYS,
  TRIAL_AI_CREDITS,
  UNLIMITED_AI,
} from "@/src/lib/subscriptions"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { createPaymentTransaction } from "@/src/lib/payments"
import type { AuditRequestContext } from "@/src/lib/request-security"

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

const adminUpdateOrganizationSubscriptionSchema = z.object({
  organizationId: requiredIdSchema,
  plan: z.nativeEnum(SubscriptionPlan),
})

const adminStartTrialSchema = z.object({
  organizationId: requiredIdSchema,
})

const consumeAiCreditSchema = z.object({
  organizationId: requiredIdSchema,
})

const managePaymentTransactionSchema = z.object({
  transactionId: requiredIdSchema,
})

export async function createSubscriptionPaymentRequest(
  data: unknown,
  auditContext?: AuditRequestContext,
): Promise<ActionResult<{ paymentId: string; transactionId: string; checkoutToken: string | null }>> {
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

    const transaction = await createPaymentTransaction({
      organizationId,
      userId: actorId,
      subscriptionPaymentId: payment.id,
      requestedPlan,
      amountFcfa: PLAN_DEFINITIONS[requestedPlan].monthlyPriceFcfa,
      paymentMethod,
    })

    await createAuditLog({
      userId: actorId,
      organizationId,
      action: AuditAction.CREATE,
      resourceType: "SUBSCRIPTION_PAYMENT",
      resourceId: payment.id,
      ipAddress: auditContext?.ipAddress,
      userAgent: auditContext?.userAgent,
      after: {
        requestedPlan,
        paymentMethod,
        paymentReference: paymentReference || null,
        transactionId: transaction.id,
      },
    })

    revalidatePath("/settings")

    return {
      success: true,
      data: {
        paymentId: payment.id,
        transactionId: transaction.id,
        checkoutToken: transaction.checkoutToken ?? null,
      },
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
  auditContext?: AuditRequestContext,
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
      existingSubscription?.plan === payment.requestedPlan &&
      existingSubscription.currentPeriodEnd != null &&
      existingSubscription.currentPeriodEnd > now

    const periodStart =
      isRenewal && existingSubscription?.currentPeriodEnd
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
            trialEndsAt: null,
            aiCreditsTotal: UNLIMITED_AI,
            aiCreditsUsed: 0,
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
            trialEndsAt: null,
            aiCreditsTotal: UNLIMITED_AI,
            aiCreditsUsed: 0,
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
      ipAddress: auditContext?.ipAddress,
      userAgent: auditContext?.userAgent,
      after: {
        status: SubscriptionPaymentStatus.CONFIRMED,
        requestedPlan: payment.requestedPlan,
      },
    })

    revalidatePath("/settings")
    revalidatePath("/admin")
    revalidatePath(`/admin/organizations/${organizationId}`)

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
  auditContext?: AuditRequestContext,
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
      ipAddress: auditContext?.ipAddress,
      userAgent: auditContext?.userAgent,
      after: { status: SubscriptionPaymentStatus.REJECTED },
    })

    revalidatePath("/settings")

    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Impossible de refuser ce paiement." }
  }
}

export async function adminStartTrial(
  data: unknown,
  auditContext?: AuditRequestContext,
): Promise<ActionResult<{ trialEndsAt: Date }>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = adminStartTrialSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: "Donnees invalides" }

    const { organizationId } = parsed.data
    const actorId = sessionResult.data.user.id

    const isSuperAdmin = await prisma.userOrganization.findFirst({
      where: { userId: actorId, role: UserRole.SUPER_ADMIN },
      select: { id: true },
    })
    if (!isSuperAdmin) {
      return { success: false, error: "Seul un super admin peut demarrer un essai." }
    }

    const org = await prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { id: true },
    })
    if (!org) {
      return { success: false, error: "Organisation introuvable." }
    }

    const existingSubscription = await prisma.subscription.findUnique({
      where: { organizationId },
      select: {
        status: true,
        amountFcfa: true,
        currentPeriodEnd: true,
      },
    })

    const hasActivePaidPlan =
      existingSubscription?.status === "ACTIVE" &&
      (
        (existingSubscription.amountFcfa ?? 0) > 0 ||
        (
          existingSubscription.currentPeriodEnd != null &&
          existingSubscription.currentPeriodEnd > new Date()
        )
      )

    if (hasActivePaidPlan) {
      return {
        success: false,
        error: "Impossible de demarrer un essai sur une organisation avec un abonnement payant actif.",
      }
    }

    const now = new Date()
    const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 86_400_000)

    await prisma.subscription.upsert({
      where: { organizationId },
      update: {
        plan: SubscriptionPlan.BASIC,
        status: "TRIAL",
        amountFcfa: 0,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        trialEndsAt,
        aiCreditsTotal: TRIAL_AI_CREDITS,
        aiCreditsUsed: 0,
        canceledAt: null,
      },
      create: {
        organizationId,
        plan: SubscriptionPlan.BASIC,
        status: "TRIAL",
        amountFcfa: 0,
        startedAt: now,
        trialEndsAt,
        aiCreditsTotal: TRIAL_AI_CREDITS,
        aiCreditsUsed: 0,
      },
    })

    await createAuditLog({
      userId: actorId,
      organizationId,
      action: AuditAction.UPDATE,
      resourceType: "SUBSCRIPTION",
      resourceId: organizationId,
      ipAddress: auditContext?.ipAddress,
      userAgent: auditContext?.userAgent,
      after: { plan: SubscriptionPlan.BASIC, status: "TRIAL", trialEndsAt },
    })

    revalidatePath("/admin")
    revalidatePath(`/admin/organizations/${organizationId}`)

    return { success: true, data: { trialEndsAt } }
  } catch {
    return { success: false, error: "Impossible de demarrer l'essai." }
  }
}

export async function consumeAiCredit(
  data: unknown,
): Promise<ActionResult<{ creditsRemaining: number }>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = consumeAiCreditSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: "Donnees invalides" }

    const { organizationId } = parsed.data
    const actorId = sessionResult.data.user.id

    const membershipResult = await requireMembership(actorId, organizationId)
    if (!membershipResult.success) return membershipResult

    const result = await prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.findUnique({
        where: { organizationId },
        select: {
          id: true,
          plan: true,
          status: true,
          aiCreditsTotal: true,
          aiCreditsUsed: true,
        },
      })

      if (!sub) {
        return { ok: false as const, error: "Abonnement introuvable." }
      }

      const hasUnlimitedAI =
        (sub.plan === SubscriptionPlan.PRO || sub.plan === SubscriptionPlan.BUSINESS) &&
        sub.status === "ACTIVE"

      if (hasUnlimitedAI) {
        return { ok: true as const, creditsRemaining: UNLIMITED_AI }
      }

      const updated = await tx.subscription.updateMany({
        where: {
          id: sub.id,
          aiCreditsUsed: { lt: sub.aiCreditsTotal },
        },
        data: {
          aiCreditsUsed: { increment: 1 },
        },
      })

      if (updated.count === 0) {
        return {
          ok: false as const,
          error: "Vos credits IA sont epuises. Passez au plan Pro pour des analyses illimitees.",
        }
      }

      const refreshed = await tx.subscription.findUnique({
        where: { id: sub.id },
        select: {
          aiCreditsTotal: true,
          aiCreditsUsed: true,
        },
      })

      if (!refreshed) {
        return { ok: false as const, error: "Abonnement introuvable." }
      }

      return {
        ok: true as const,
        creditsRemaining: Math.max(0, refreshed.aiCreditsTotal - refreshed.aiCreditsUsed),
      }
    })

    if (!result.ok) {
      return { success: false, error: result.error }
    }

    return { success: true, data: { creditsRemaining: result.creditsRemaining } }
  } catch {
    return { success: false, error: "Impossible de consommer un credit IA." }
  }
}

export async function adminUpdateOrganizationSubscription(
  data: unknown,
  auditContext?: AuditRequestContext,
): Promise<ActionResult<{ plan: SubscriptionPlan }>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = adminUpdateOrganizationSubscriptionSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const { organizationId, plan } = parsed.data
    const actorId = sessionResult.data.user.id

    const superAdminMembership = await prisma.userOrganization.findFirst({
      where: {
        userId: actorId,
        role: UserRole.SUPER_ADMIN,
      },
      select: { id: true },
    })

    if (!superAdminMembership) {
      return { success: false, error: "Seul un super admin peut modifier cet abonnement." }
    }

    const organization = await prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { id: true, name: true },
    })

    if (!organization) {
      return { success: false, error: "Organisation introuvable." }
    }

    const now = new Date()
    const periodEnd = new Date(now)
    periodEnd.setDate(periodEnd.getDate() + 30)

    await prisma.subscription.upsert({
      where: { organizationId },
      update: {
        plan,
        status: "ACTIVE",
        amountFcfa: PLAN_DEFINITIONS[plan].monthlyPriceFcfa,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        trialEndsAt: null,
        aiCreditsTotal: UNLIMITED_AI,
        aiCreditsUsed: 0,
        canceledAt: null,
      },
      create: {
        organizationId,
        plan,
        status: "ACTIVE",
        amountFcfa: PLAN_DEFINITIONS[plan].monthlyPriceFcfa,
        startedAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        trialEndsAt: null,
        aiCreditsTotal: UNLIMITED_AI,
        aiCreditsUsed: 0,
      },
    })

    await createAuditLog({
      userId: actorId,
      organizationId,
      action: AuditAction.UPDATE,
      resourceType: "SUBSCRIPTION",
      resourceId: organizationId,
      ipAddress: auditContext?.ipAddress,
      userAgent: auditContext?.userAgent,
      after: {
        plan,
        amountFcfa: PLAN_DEFINITIONS[plan].monthlyPriceFcfa,
      },
    })

    revalidatePath("/admin")
    revalidatePath(`/admin/organizations/${organizationId}`)

    return {
      success: true,
      data: { plan },
    }
  } catch {
    return { success: false, error: "Impossible de mettre a jour l'abonnement." }
  }
}

export async function adminConfirmPaymentTransaction(
  data: unknown,
  auditContext?: AuditRequestContext,
): Promise<ActionResult<{ transactionId: string }>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = managePaymentTransactionSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const actorId = sessionResult.data.user.id
    const isSuperAdmin = await prisma.userOrganization.findFirst({
      where: { userId: actorId, role: UserRole.SUPER_ADMIN },
      select: { id: true },
    })

    if (!isSuperAdmin) {
      return { success: false, error: "Seul un super admin peut confirmer une transaction." }
    }

    const transaction = await prisma.paymentTransaction.findUnique({
      where: { id: parsed.data.transactionId },
      select: {
        id: true,
        organizationId: true,
      },
    })

    if (!transaction) {
      return { success: false, error: "Transaction introuvable." }
    }

    const { confirmPaymentTransaction } = await import("@/src/lib/payments")
    await confirmPaymentTransaction({
      transactionId: transaction.id,
      providerStatus: "MANUAL_CONFIRMED",
    })

    await createAuditLog({
      userId: actorId,
      organizationId: transaction.organizationId,
      action: AuditAction.UPDATE,
      resourceType: "PAYMENT_TRANSACTION",
      resourceId: transaction.id,
      ipAddress: auditContext?.ipAddress,
      userAgent: auditContext?.userAgent,
      after: { status: "CONFIRMED_MANUALLY" },
    })

    revalidatePath("/admin")
    revalidatePath(`/admin/organizations/${transaction.organizationId}`)
    revalidatePath("/settings")

    return { success: true, data: { transactionId: transaction.id } }
  } catch {
    return { success: false, error: "Impossible de confirmer cette transaction." }
  }
}

export async function adminRejectPaymentTransaction(
  data: unknown,
  auditContext?: AuditRequestContext,
): Promise<ActionResult<{ transactionId: string }>> {
  try {
    const sessionResult = await requireSession()
    if (!sessionResult.success) return sessionResult

    const parsed = managePaymentTransactionSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: "Donnees invalides" }
    }

    const actorId = sessionResult.data.user.id
    const isSuperAdmin = await prisma.userOrganization.findFirst({
      where: { userId: actorId, role: UserRole.SUPER_ADMIN },
      select: { id: true },
    })

    if (!isSuperAdmin) {
      return { success: false, error: "Seul un super admin peut refuser une transaction." }
    }

    const transaction = await prisma.paymentTransaction.findUnique({
      where: { id: parsed.data.transactionId },
      select: {
        id: true,
        organizationId: true,
        subscriptionPaymentId: true,
      },
    })

    if (!transaction) {
      return { success: false, error: "Transaction introuvable." }
    }

    await prisma.$transaction(async (tx) => {
      await tx.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          status: "FAILED",
          providerStatus: "MANUAL_REJECTED",
          failedAt: new Date(),
        },
      })

      if (transaction.subscriptionPaymentId) {
        await tx.subscriptionPayment.update({
          where: { id: transaction.subscriptionPaymentId },
          data: {
            status: "REJECTED",
            rejectedAt: new Date(),
          },
        })
      }
    })

    await createAuditLog({
      userId: actorId,
      organizationId: transaction.organizationId,
      action: AuditAction.UPDATE,
      resourceType: "PAYMENT_TRANSACTION",
      resourceId: transaction.id,
      ipAddress: auditContext?.ipAddress,
      userAgent: auditContext?.userAgent,
      after: { status: "REJECTED_MANUALLY" },
    })

    revalidatePath("/admin")
    revalidatePath(`/admin/organizations/${transaction.organizationId}`)
    revalidatePath("/settings")

    return { success: true, data: { transactionId: transaction.id } }
  } catch {
    return { success: false, error: "Impossible de refuser cette transaction." }
  }
}
