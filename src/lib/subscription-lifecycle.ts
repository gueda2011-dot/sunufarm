import type { Prisma } from "@/src/generated/prisma/client"
import { SubscriptionPlan, SubscriptionStatus } from "@/src/generated/prisma/client"
import { PLAN_DEFINITIONS, TRIAL_AI_CREDITS, TRIAL_DAYS, UNLIMITED_AI } from "@/src/lib/subscriptions"

type SubscriptionWriter = Prisma.TransactionClient

export function buildSubscriptionPeriodEnd(start: Date, days = 30): Date {
  const periodEnd = new Date(start)
  periodEnd.setDate(periodEnd.getDate() + days)
  return periodEnd
}

export async function activateOrganizationSubscription(
  db: SubscriptionWriter,
  input: {
    organizationId: string
    plan: SubscriptionPlan
    amountFcfa?: number
    now?: Date
    periodStart?: Date
  },
) {
  const now = input.now ?? new Date()
  const periodStart = input.periodStart ?? now
  const amountFcfa = input.amountFcfa ?? PLAN_DEFINITIONS[input.plan].monthlyPriceFcfa

  return db.subscription.upsert({
    where: { organizationId: input.organizationId },
    update: {
      plan: input.plan,
      status: SubscriptionStatus.ACTIVE,
      amountFcfa,
      currentPeriodStart: periodStart,
      currentPeriodEnd: buildSubscriptionPeriodEnd(periodStart),
      trialEndsAt: null,
      aiCreditsTotal: UNLIMITED_AI,
      aiCreditsUsed: 0,
      canceledAt: null,
    },
    create: {
      organizationId: input.organizationId,
      plan: input.plan,
      status: SubscriptionStatus.ACTIVE,
      amountFcfa,
      startedAt: now,
      currentPeriodStart: periodStart,
      currentPeriodEnd: buildSubscriptionPeriodEnd(periodStart),
      trialEndsAt: null,
      aiCreditsTotal: UNLIMITED_AI,
      aiCreditsUsed: 0,
    },
  })
}

export async function startOrganizationTrial(
  db: SubscriptionWriter,
  input: {
    organizationId: string
    now?: Date
    trialEndsAt?: Date
  },
) {
  const now = input.now ?? new Date()
  const trialEndsAt = input.trialEndsAt ?? new Date(now.getTime() + TRIAL_DAYS * 86_400_000)

  await db.subscription.upsert({
    where: { organizationId: input.organizationId },
    update: {
      plan: SubscriptionPlan.BASIC,
      status: SubscriptionStatus.TRIAL,
      amountFcfa: 0,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      trialEndsAt,
      aiCreditsTotal: TRIAL_AI_CREDITS,
      aiCreditsUsed: 0,
      canceledAt: null,
    },
    create: {
      organizationId: input.organizationId,
      plan: SubscriptionPlan.BASIC,
      status: SubscriptionStatus.TRIAL,
      amountFcfa: 0,
      startedAt: now,
      trialEndsAt,
      aiCreditsTotal: TRIAL_AI_CREDITS,
      aiCreditsUsed: 0,
    },
  })

  return { trialEndsAt }
}
