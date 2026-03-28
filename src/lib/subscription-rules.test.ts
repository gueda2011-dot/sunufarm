import { describe, expect, it } from "vitest"
import { SubscriptionPlan, SubscriptionStatus } from "@/src/generated/prisma/client"
import {
  getRemainingAiCredits,
  hasActivePaidPlan,
  hasUnlimitedAiAccess,
  resolveAiCreditsRemaining,
} from "@/src/lib/subscription-rules"
import { UNLIMITED_AI } from "@/src/lib/subscriptions"

describe("subscription-rules", () => {
  it("detecte correctement l acces IA illimite", () => {
    expect(hasUnlimitedAiAccess(SubscriptionPlan.PRO, SubscriptionStatus.ACTIVE)).toBe(true)
    expect(hasUnlimitedAiAccess(SubscriptionPlan.BUSINESS, SubscriptionStatus.ACTIVE)).toBe(true)
    expect(hasUnlimitedAiAccess(SubscriptionPlan.BASIC, SubscriptionStatus.ACTIVE)).toBe(false)
    expect(hasUnlimitedAiAccess(SubscriptionPlan.PRO, SubscriptionStatus.TRIAL)).toBe(false)
  })

  it("calcule les credits restants sans passer sous zero", () => {
    expect(getRemainingAiCredits(3, 1)).toBe(2)
    expect(getRemainingAiCredits(3, 5)).toBe(0)
  })

  it("renvoie la sentinelle illimitee pour les plans actifs elegibles", () => {
    expect(
      resolveAiCreditsRemaining({
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.ACTIVE,
        aiCreditsTotal: 100,
        aiCreditsUsed: 80,
      }),
    ).toBe(UNLIMITED_AI)
  })

  it("renvoie les credits restants pour les plans limites", () => {
    expect(
      resolveAiCreditsRemaining({
        plan: SubscriptionPlan.BASIC,
        status: SubscriptionStatus.TRIAL,
        aiCreditsTotal: 3,
        aiCreditsUsed: 1,
      }),
    ).toBe(2)
  })

  it("refuse un essai sur un abonnement payant actif", () => {
    const now = new Date("2026-03-28T10:00:00.000Z")

    expect(
      hasActivePaidPlan(
        {
          plan: SubscriptionPlan.PRO,
          status: SubscriptionStatus.ACTIVE,
          amountFcfa: 10_000,
          currentPeriodEnd: null,
        },
        now,
      ),
    ).toBe(true)

    expect(
      hasActivePaidPlan(
        {
          plan: SubscriptionPlan.BASIC,
          status: SubscriptionStatus.ACTIVE,
          amountFcfa: 0,
          currentPeriodEnd: new Date("2026-03-29T10:00:00.000Z"),
        },
        now,
      ),
    ).toBe(true)
  })

  it("autorise l essai quand il n y a plus de plan payant actif", () => {
    const now = new Date("2026-03-28T10:00:00.000Z")

    expect(
      hasActivePaidPlan(
        {
          plan: SubscriptionPlan.PRO,
          status: SubscriptionStatus.CANCELED,
          amountFcfa: 10_000,
          currentPeriodEnd: new Date("2026-03-29T10:00:00.000Z"),
        },
        now,
      ),
    ).toBe(false)

    expect(
      hasActivePaidPlan(
        {
          plan: SubscriptionPlan.BASIC,
          status: SubscriptionStatus.ACTIVE,
          amountFcfa: 0,
          currentPeriodEnd: new Date("2026-03-27T10:00:00.000Z"),
        },
        now,
      ),
    ).toBe(false)
  })
})
