import { describe, expect, it, vi } from "vitest"
import type { Prisma } from "@/src/generated/prisma/client"
import { SubscriptionPlan, SubscriptionStatus } from "@/src/generated/prisma/client"
import {
  activateOrganizationSubscription,
  buildSubscriptionPeriodEnd,
  startOrganizationTrial,
} from "@/src/lib/subscription-lifecycle"
import { PLAN_DEFINITIONS, TRIAL_AI_CREDITS, TRIAL_DAYS, UNLIMITED_AI } from "@/src/lib/subscriptions"

function createDbMock() {
  const upsert = vi.fn()

  return {
    db: {
      subscription: { upsert },
    } as unknown as Prisma.TransactionClient,
    upsert,
  }
}

describe("subscription-lifecycle", () => {
  it("calcule la fin de periode a 30 jours par defaut", () => {
    const start = new Date("2026-03-28T00:00:00.000Z")

    expect(buildSubscriptionPeriodEnd(start)).toEqual(new Date("2026-04-27T00:00:00.000Z"))
  })

  it("active un abonnement payant avec un payload coherent", async () => {
    const { db, upsert } = createDbMock()
    upsert.mockResolvedValue({ id: "sub-1" })

    const now = new Date("2026-03-28T10:00:00.000Z")
    const periodStart = new Date("2026-03-29T00:00:00.000Z")

    await activateOrganizationSubscription(db, {
      organizationId: "org-1",
      plan: SubscriptionPlan.PRO,
      now,
      periodStart,
    })

    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      update: {
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.ACTIVE,
        amountFcfa: PLAN_DEFINITIONS.PRO.monthlyPriceFcfa,
        currentPeriodStart: periodStart,
        currentPeriodEnd: new Date("2026-04-28T00:00:00.000Z"),
        trialEndsAt: null,
        aiCreditsTotal: UNLIMITED_AI,
        aiCreditsUsed: 0,
        canceledAt: null,
      },
      create: {
        organizationId: "org-1",
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.ACTIVE,
        amountFcfa: PLAN_DEFINITIONS.PRO.monthlyPriceFcfa,
        startedAt: now,
        currentPeriodStart: periodStart,
        currentPeriodEnd: new Date("2026-04-28T00:00:00.000Z"),
        trialEndsAt: null,
        aiCreditsTotal: UNLIMITED_AI,
        aiCreditsUsed: 0,
      },
    })
  })

  it("demarre un essai avec les bons credits et sans periode payante", async () => {
    const { db, upsert } = createDbMock()
    upsert.mockResolvedValue({ id: "sub-2" })

    const now = new Date("2026-03-28T10:00:00.000Z")
    const trialEndsAt = new Date("2026-04-04T10:00:00.000Z")

    const result = await startOrganizationTrial(db, {
      organizationId: "org-1",
      now,
      trialEndsAt,
    })

    expect(result).toEqual({ trialEndsAt })
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
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
        organizationId: "org-1",
        plan: SubscriptionPlan.BASIC,
        status: SubscriptionStatus.TRIAL,
        amountFcfa: 0,
        startedAt: now,
        trialEndsAt,
        aiCreditsTotal: TRIAL_AI_CREDITS,
        aiCreditsUsed: 0,
      },
    })
  })

  it("calcule la fin d essai automatiquement si elle n est pas fournie", async () => {
    const { db, upsert } = createDbMock()
    upsert.mockResolvedValue({ id: "sub-3" })

    const now = new Date("2026-03-28T10:00:00.000Z")

    const result = await startOrganizationTrial(db, {
      organizationId: "org-1",
      now,
    })

    expect(result.trialEndsAt).toEqual(new Date(now.getTime() + TRIAL_DAYS * 86_400_000))
  })
})
