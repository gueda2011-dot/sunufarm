import { SubscriptionPlan, SubscriptionStatus } from "@/src/generated/prisma/client"
import { UNLIMITED_AI } from "@/src/lib/subscriptions"

type SubscriptionSnapshot = {
  status: SubscriptionStatus | string
  amountFcfa: number | null
  currentPeriodEnd: Date | null
}

type AiCreditSnapshot = {
  plan: SubscriptionPlan
  status: SubscriptionStatus | string
  aiCreditsTotal: number
  aiCreditsUsed: number
}

export function hasUnlimitedAiAccess(
  plan: SubscriptionPlan,
  status: SubscriptionStatus | string,
): boolean {
  return (
    status === SubscriptionStatus.ACTIVE &&
    (plan === SubscriptionPlan.PRO || plan === SubscriptionPlan.BUSINESS)
  )
}

export function getRemainingAiCredits(
  aiCreditsTotal: number,
  aiCreditsUsed: number,
): number {
  return Math.max(0, aiCreditsTotal - aiCreditsUsed)
}

export function resolveAiCreditsRemaining(subscription: AiCreditSnapshot): number {
  if (hasUnlimitedAiAccess(subscription.plan, subscription.status)) {
    return UNLIMITED_AI
  }

  return getRemainingAiCredits(subscription.aiCreditsTotal, subscription.aiCreditsUsed)
}

export function hasActivePaidPlan(
  subscription: SubscriptionSnapshot | null | undefined,
  now = new Date(),
): boolean {
  if (!subscription || subscription.status !== SubscriptionStatus.ACTIVE) {
    return false
  }

  if ((subscription.amountFcfa ?? 0) > 0) {
    return true
  }

  return subscription.currentPeriodEnd != null && subscription.currentPeriodEnd > now
}
