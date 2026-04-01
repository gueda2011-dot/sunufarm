"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import prisma from "@/src/lib/prisma"
import {
  requireSession,
  requireOrganizationModuleContext,
  requireRole,
  type ActionResult,
} from "@/src/lib/auth"
import {
  actionSuccess,
  conflict,
  forbidden,
  invalidInput,
  notFound,
  technicalError,
} from "@/src/lib/action-result"
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
  UNLIMITED_AI,
} from "@/src/lib/subscriptions"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { createPaymentTransaction } from "@/src/lib/payments"
import type { AuditRequestContext } from "@/src/lib/request-security"
import {
  activateOrganizationSubscription,
  startOrganizationTrial,
} from "@/src/lib/subscription-lifecycle"
import {
  hasActivePaidPlan,
  hasUnlimitedAiAccess,
  resolveAiCreditsRemaining,
} from "@/src/lib/subscription-rules"
import { getAdminBaseUrl, sendAdminAlertEmail } from "@/src/lib/admin-alerts"
import { createAdminEventNotifications } from "@/src/lib/admin-event-notifications"

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
    const parsed = createSubscriptionPaymentSchema.safeParse(data)
    if (!parsed.success) {
      return invalidInput()
    }

    const {
      organizationId,
      requestedPlan,
      paymentMethod,
      paymentReference,
      notes,
    } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "SETTINGS")
    if (!accessResult.success) return accessResult
    const actorId = accessResult.data.session.user.id
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    })

    const currentSubscription = await getOrganizationSubscription(organizationId)
    if (currentSubscription.plan === requestedPlan) {
      return conflict("Votre organisation est deja sur ce plan.", "PLAN_ALREADY_ACTIVE")
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
        ...conflict(
          "Une demande de paiement est deja en attente pour ce plan.",
          "PENDING_PAYMENT_EXISTS",
        ),
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

    await sendAdminAlertEmail({
      title: "Nouvelle demande de paiement",
      intro: "Une organisation a soumis une nouvelle demande de paiement d'abonnement.",
      details: [
        { label: "Organisation ID", value: organizationId },
        { label: "Plan demande", value: requestedPlan },
        { label: "Montant", value: `${PLAN_DEFINITIONS[requestedPlan].monthlyPriceFcfa.toLocaleString("fr-SN")} FCFA` },
        { label: "Methode", value: paymentMethod },
      ],
      actionLabel: "Voir l'organisation",
      actionUrl: getAdminBaseUrl(`/admin/organizations/${organizationId}`),
    })

    await createAdminEventNotifications({
      organizationId,
      title: "Nouvelle demande de paiement",
      message:
        `${organization?.name ?? "Une organisation"} a demande le plan ${requestedPlan} ` +
        `pour ${PLAN_DEFINITIONS[requestedPlan].monthlyPriceFcfa.toLocaleString("fr-SN")} FCFA.`,
      resourceType: "SUBSCRIPTION_PAYMENT_REQUEST",
      resourceId: payment.id,
      link: `/admin/organizations/${organizationId}`,
      excludeUserIds: [actorId],
      metadata: {
        requestedPlan,
        amountFcfa: PLAN_DEFINITIONS[requestedPlan].monthlyPriceFcfa,
        paymentMethod,
        paymentId: payment.id,
        transactionId: transaction.id,
      },
    })

    revalidatePath("/settings")

    return actionSuccess({
      paymentId: payment.id,
      transactionId: transaction.id,
      checkoutToken: transaction.checkoutToken ?? null,
    })
  } catch {
    return technicalError("Impossible d'enregistrer la demande de paiement.")
  }
}

export async function confirmSubscriptionPayment(
  data: unknown,
  auditContext?: AuditRequestContext,
): Promise<ActionResult<{ plan: SubscriptionPlan }>> {
  try {
    const parsed = manageSubscriptionPaymentSchema.safeParse(data)
    if (!parsed.success) {
      return invalidInput()
    }

    const { organizationId, paymentId } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "SETTINGS")
    if (!accessResult.success) return accessResult
    const actorId = accessResult.data.session.user.id
    const ownerRoleResult = requireRole(
      accessResult.data.membership,
      [UserRole.OWNER],
      "Seul un proprietaire peut confirmer un paiement.",
    )
    if (!ownerRoleResult.success) return ownerRoleResult

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
      return notFound("Paiement en attente introuvable.", "SUBSCRIPTION_PAYMENT_NOT_FOUND")
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
    await prisma.$transaction(async (tx) => {
      await tx.subscriptionPayment.update({
        where: { id: payment.id },
        data: {
          status: SubscriptionPaymentStatus.CONFIRMED,
          confirmedById: actorId,
          confirmedAt: now,
        },
      })

      await activateOrganizationSubscription(tx, {
        organizationId,
        plan: payment.requestedPlan,
        amountFcfa: payment.amountFcfa,
        now,
        periodStart,
      })
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

    return actionSuccess({ plan: payment.requestedPlan })
  } catch {
    return technicalError("Impossible de confirmer ce paiement.")
  }
}

export async function rejectSubscriptionPayment(
  data: unknown,
  auditContext?: AuditRequestContext,
): Promise<ActionResult<void>> {
  try {
    const parsed = manageSubscriptionPaymentSchema.safeParse(data)
    if (!parsed.success) {
      return invalidInput()
    }

    const { organizationId, paymentId } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "SETTINGS")
    if (!accessResult.success) return accessResult
    const actorId = accessResult.data.session.user.id
    const ownerRoleResult = requireRole(
      accessResult.data.membership,
      [UserRole.OWNER],
      "Seul un proprietaire peut refuser un paiement.",
    )
    if (!ownerRoleResult.success) return ownerRoleResult

    const payment = await prisma.subscriptionPayment.findFirst({
      where: {
        id: paymentId,
        organizationId,
        status: SubscriptionPaymentStatus.PENDING,
      },
      select: { id: true },
    })

    if (!payment) {
      return notFound("Paiement en attente introuvable.", "SUBSCRIPTION_PAYMENT_NOT_FOUND")
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

    return actionSuccess(undefined)
  } catch {
    return technicalError("Impossible de refuser ce paiement.")
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
    if (!parsed.success) return invalidInput()

    const { organizationId } = parsed.data
    const actorId = sessionResult.data.user.id

    const isSuperAdmin = await prisma.userOrganization.findFirst({
      where: { userId: actorId, role: UserRole.SUPER_ADMIN },
      select: { id: true },
    })
    if (!isSuperAdmin) {
      return forbidden("Seul un super admin peut demarrer un essai.")
    }

    const org = await prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { id: true },
    })
    if (!org) {
      return notFound("Organisation introuvable.", "ORG_NOT_FOUND")
    }

    const existingSubscription = await prisma.subscription.findUnique({
      where: { organizationId },
      select: {
        status: true,
        amountFcfa: true,
        currentPeriodEnd: true,
      },
    })

    if (hasActivePaidPlan(existingSubscription)) {
      return {
        ...conflict(
          "Impossible de demarrer un essai sur une organisation avec un abonnement payant actif.",
          "ACTIVE_PAID_PLAN_EXISTS",
        ),
      }
    }

    const now = new Date()
    const { trialEndsAt } = await startOrganizationTrial(prisma, {
      organizationId,
      now,
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

    return actionSuccess({ trialEndsAt })
  } catch {
    return technicalError("Impossible de demarrer l'essai.")
  }
}

export async function consumeAiCredit(
  data: unknown,
): Promise<ActionResult<{ creditsRemaining: number }>> {
  try {
    const parsed = consumeAiCreditSchema.safeParse(data)
    if (!parsed.success) return invalidInput()

    const { organizationId } = parsed.data
    const accessResult = await requireOrganizationModuleContext(organizationId, "SETTINGS")
    if (!accessResult.success) return accessResult

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
        return { ok: false as const, error: notFound("Abonnement introuvable.", "SUBSCRIPTION_NOT_FOUND") }
      }

      if (hasUnlimitedAiAccess(sub.plan, sub.status)) {
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
          error: conflict(
            "Vos credits IA sont epuises. Passez au plan Pro pour des analyses illimitees.",
            "AI_CREDITS_EXHAUSTED",
          ),
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
        return { ok: false as const, error: notFound("Abonnement introuvable.", "SUBSCRIPTION_NOT_FOUND") }
      }

      return {
        ok: true as const,
        creditsRemaining: resolveAiCreditsRemaining({
          plan: sub.plan,
          status: sub.status,
          aiCreditsTotal: refreshed.aiCreditsTotal,
          aiCreditsUsed: refreshed.aiCreditsUsed,
        }),
      }
    })

    if (!result.ok) {
      return result.error
    }

    return actionSuccess({ creditsRemaining: result.creditsRemaining })
  } catch {
    return technicalError("Impossible de consommer un credit IA.")
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
      return invalidInput()
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
      return forbidden("Seul un super admin peut modifier cet abonnement.")
    }

    const organization = await prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { id: true, name: true },
    })

    if (!organization) {
      return notFound("Organisation introuvable.", "ORG_NOT_FOUND")
    }

    const now = new Date()
    await activateOrganizationSubscription(prisma, {
      organizationId,
      plan,
      amountFcfa: PLAN_DEFINITIONS[plan].monthlyPriceFcfa,
      now,
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

    return actionSuccess({ plan })
  } catch {
    return technicalError("Impossible de mettre a jour l'abonnement.")
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
      return invalidInput()
    }

    const actorId = sessionResult.data.user.id
    const isSuperAdmin = await prisma.userOrganization.findFirst({
      where: { userId: actorId, role: UserRole.SUPER_ADMIN },
      select: { id: true },
    })

    if (!isSuperAdmin) {
      return forbidden("Seul un super admin peut confirmer une transaction.")
    }

    const transaction = await prisma.paymentTransaction.findUnique({
      where: { id: parsed.data.transactionId },
      select: {
        id: true,
        organizationId: true,
        requestedPlan: true,
      },
    })

    if (!transaction) {
      return notFound("Transaction introuvable.", "TRANSACTION_NOT_FOUND")
    }

    const { confirmPaymentTransaction } = await import("@/src/lib/payments")
    await confirmPaymentTransaction({
      transactionId: transaction.id,
      providerStatus: "MANUAL_CONFIRMED",
      excludeUserIds: [actorId],
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

    await sendAdminAlertEmail({
      title: "Paiement confirme",
      intro: "Une transaction d'abonnement vient d'etre confirmee.",
      details: [
        { label: "Organisation ID", value: transaction.organizationId },
        { label: "Transaction ID", value: transaction.id },
        { label: "Statut", value: "CONFIRMED_MANUALLY" },
      ],
      actionLabel: "Voir l'organisation",
      actionUrl: getAdminBaseUrl(`/admin/organizations/${transaction.organizationId}`),
    })

    revalidatePath("/admin")
    revalidatePath(`/admin/organizations/${transaction.organizationId}`)
    revalidatePath("/settings")

    return actionSuccess({ transactionId: transaction.id })
  } catch {
    return technicalError("Impossible de confirmer cette transaction.")
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
      return invalidInput()
    }

    const actorId = sessionResult.data.user.id
    const isSuperAdmin = await prisma.userOrganization.findFirst({
      where: { userId: actorId, role: UserRole.SUPER_ADMIN },
      select: { id: true },
    })

    if (!isSuperAdmin) {
      return forbidden("Seul un super admin peut refuser une transaction.")
    }

    const transaction = await prisma.paymentTransaction.findUnique({
      where: { id: parsed.data.transactionId },
      select: {
        id: true,
        organizationId: true,
        subscriptionPaymentId: true,
        requestedPlan: true,
      },
    })

    if (!transaction) {
      return notFound("Transaction introuvable.", "TRANSACTION_NOT_FOUND")
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

    await sendAdminAlertEmail({
      title: "Paiement rejete",
      intro: "Une transaction d'abonnement a ete rejetee.",
      details: [
        { label: "Organisation ID", value: transaction.organizationId },
        { label: "Transaction ID", value: transaction.id },
        { label: "Statut", value: "REJECTED_MANUALLY" },
      ],
      actionLabel: "Voir l'organisation",
      actionUrl: getAdminBaseUrl(`/admin/organizations/${transaction.organizationId}`),
    })

    await createAdminEventNotifications({
      organizationId: transaction.organizationId,
      title: "Paiement rejete",
      message: `La transaction ${transaction.id} pour le plan ${transaction.requestedPlan} a ete rejetee.`,
      resourceType: "PAYMENT_TRANSACTION_REJECTED",
      resourceId: transaction.id,
      link: `/admin/organizations/${transaction.organizationId}`,
      excludeUserIds: [actorId],
      metadata: {
        transactionId: transaction.id,
        requestedPlan: transaction.requestedPlan,
        status: "MANUAL_REJECTED",
      },
    })

    revalidatePath("/admin")
    revalidatePath(`/admin/organizations/${transaction.organizationId}`)
    revalidatePath("/settings")

    return actionSuccess({ transactionId: transaction.id })
  } catch {
    return technicalError("Impossible de refuser cette transaction.")
  }
}
