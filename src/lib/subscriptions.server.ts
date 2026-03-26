import prisma from "@/src/lib/prisma"
import {
  SubscriptionPlan,
  SubscriptionStatus,
} from "@/src/generated/prisma/client"
import { getPlanDefinition } from "@/src/lib/subscriptions"

export interface OrganizationSubscriptionSummary {
  plan: SubscriptionPlan
  status: SubscriptionStatus
  amountFcfa: number
  label: string
  promise: string
  maxActiveBatches: number
  maxFarms: number
  recommended?: boolean
  highlights: string[]
}

export async function getOrganizationSubscription(
  organizationId: string,
): Promise<OrganizationSubscriptionSummary> {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
    select: {
      plan: true,
      status: true,
      amountFcfa: true,
    },
  })

  const plan = subscription?.plan ?? SubscriptionPlan.BASIC
  const definition = getPlanDefinition(plan)

  return {
    plan,
    status: subscription?.status ?? SubscriptionStatus.ACTIVE,
    amountFcfa: subscription?.amountFcfa ?? definition.monthlyPriceFcfa,
    label: definition.label,
    promise: definition.promise,
    maxActiveBatches: definition.maxActiveBatches,
    maxFarms: definition.maxFarms,
    recommended: definition.recommended,
    highlights: definition.highlights,
  }
}
