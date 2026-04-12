/**
 * SunuFarm — Lecture abonnement organisation (Server-side uniquement)
 *
 * Règles trial :
 *   - status TRIAL + trialEndsAt dans le futur  → plan effectif = PRO
 *   - status TRIAL + trialEndsAt passé ou null  → plan effectif = plan stocké (BASIC)
 *   - status ACTIVE + plan PRO/BUSINESS          → IA illimitée, features complètes
 *   - Tout autre cas                             → BASIC features
 *
 * Le champ `plan` retourné est TOUJOURS le plan effectif (ce que l'utilisateur
 * peut faire maintenant). Le plan stocké en DB est disponible via `rawPlan`.
 * Tous les appels hasPlanFeature(subscription.plan, ...) fonctionnent sans
 * modification grâce à cette abstraction.
 */

import prisma from "@/src/lib/prisma"
import {
  SubscriptionPlan,
  SubscriptionStatus,
} from "@/src/generated/prisma/client"
import {
  getPlanDefinition,
  TRIAL_AI_CREDITS,
  UNLIMITED_AI,
} from "@/src/lib/subscriptions"
import {
  getCommercialPlanDefinition,
  type CommercialPlan,
} from "@/src/lib/offer-catalog"

// ---------------------------------------------------------------------------
// Type retourné
// ---------------------------------------------------------------------------

export interface OrganizationSubscriptionSummary {
  /** Plan effectif — PRO si essai actif, sinon plan réel. Utilisé pour hasPlanFeature(). */
  plan:               SubscriptionPlan
  /** Plan stocké dans la DB (peut différer de plan pendant l'essai) */
  rawPlan:            SubscriptionPlan
  /** Plan commercial exposé à l'utilisateur dans la roadmap pricing Phase 1. */
  commercialPlan:     CommercialPlan
  status:             SubscriptionStatus
  hasSubscriptionRecord: boolean
  hasPaidAccess:      boolean
  amountFcfa:         number
  label:              string
  billingLabel:       string
  currentPlanLabel:   string
  promise:            string
  audience:           string
  valueHeadline:      string
  maxActiveBatches:   number
  maxFarms:           number
  recommended?:       boolean
  highlights:         string[]

  // ── Essai gratuit ────────────────────────────────────────────────────────
  /** True si l'essai est en cours (status TRIAL + date non expirée) */
  isTrialActive:      boolean
  /** True si l'essai a expiré */
  isTrialExpired:     boolean
  /** Date de fin d'essai (null si jamais en essai) */
  trialEndsAt:        Date | null
  /** Jours restants (null si pas d'essai actif) */
  trialDaysRemaining: number | null

  // ── Crédits IA ───────────────────────────────────────────────────────────
  /** -1 = illimité (plans payants actifs) */
  aiCreditsTotal:     number
  aiCreditsUsed:      number
  /** Crédits restants — 0 si épuisé, Infinity si illimité */
  aiCreditsRemaining: number
  /** True si le plan donne accès à l'IA sans limite de crédits */
  hasUnlimitedAI:     boolean
}

// ---------------------------------------------------------------------------
// Helper interne
// ---------------------------------------------------------------------------

function trialDaysLeft(trialEndsAt: Date): number {
  const msLeft = trialEndsAt.getTime() - Date.now()
  return Math.max(0, Math.ceil(msLeft / 86_400_000))
}

function resolveCommercialPlan(params: {
  hasSubscriptionRecord: boolean
  rawPlan: SubscriptionPlan
  status: SubscriptionStatus
  isTrialActive: boolean
  amountFcfa: number | null | undefined
  currentPeriodEnd: Date | null | undefined
  now: Date
}): { commercialPlan: CommercialPlan; hasPaidAccess: boolean } {
  if (params.isTrialActive) {
    return {
      commercialPlan: "PRO",
      hasPaidAccess: false,
    }
  }

  const hasPaidAccess =
    params.hasSubscriptionRecord &&
    params.status === SubscriptionStatus.ACTIVE &&
    (
      (params.amountFcfa ?? 0) > 0 ||
      (params.currentPeriodEnd != null && params.currentPeriodEnd > params.now)
    )

  if (params.rawPlan === SubscriptionPlan.BUSINESS && hasPaidAccess) {
    return { commercialPlan: "BUSINESS", hasPaidAccess }
  }

  if (params.rawPlan === SubscriptionPlan.PRO && hasPaidAccess) {
    return { commercialPlan: "PRO", hasPaidAccess }
  }

  if (params.rawPlan === SubscriptionPlan.BASIC && hasPaidAccess) {
    return { commercialPlan: "STARTER", hasPaidAccess }
  }

  return { commercialPlan: "FREE", hasPaidAccess: false }
}

// ---------------------------------------------------------------------------
// Fonction principale
// ---------------------------------------------------------------------------

export async function getOrganizationSubscription(
  organizationId: string,
): Promise<OrganizationSubscriptionSummary> {
  const now = new Date()
  const subscription = await prisma.subscription.findUnique({
    where:  { organizationId },
    select: {
      plan:           true,
      status:         true,
      amountFcfa:     true,
      currentPeriodEnd: true,
      trialEndsAt:    true,
      aiCreditsTotal: true,
      aiCreditsUsed:  true,
    },
  })

  const hasSubscriptionRecord = subscription != null
  const rawPlan   = subscription?.plan   ?? SubscriptionPlan.BASIC
  const status    = subscription?.status ?? SubscriptionStatus.CANCELED
  const trialEndsAt = subscription?.trialEndsAt ?? null

  // ── Calcul état trial ──────────────────────────────────────────────────
  const isTrialActive =
    status === SubscriptionStatus.TRIAL &&
    trialEndsAt !== null &&
    trialEndsAt > now

  const isTrialExpired =
    status === SubscriptionStatus.TRIAL &&
    (trialEndsAt === null || trialEndsAt <= now)

  const trialDaysRemaining = isTrialActive && trialEndsAt
    ? trialDaysLeft(trialEndsAt)
    : null

  // Plan effectif : PRO si trial actif, sinon plan réel
  const effectivePlan: SubscriptionPlan = isTrialActive
    ? SubscriptionPlan.PRO
    : rawPlan

  const definition = getPlanDefinition(effectivePlan)
  const {
    commercialPlan,
    hasPaidAccess,
  } = resolveCommercialPlan({
    hasSubscriptionRecord,
    rawPlan,
    status,
    isTrialActive,
    amountFcfa: subscription?.amountFcfa,
    currentPeriodEnd: subscription?.currentPeriodEnd,
    now,
  })
  const commercialDefinition = getCommercialPlanDefinition(commercialPlan)

  // ── Calcul crédits IA ─────────────────────────────────────────────────
  const aiCreditsTotal = subscription?.aiCreditsTotal ?? TRIAL_AI_CREDITS
  const aiCreditsUsed  = subscription?.aiCreditsUsed  ?? 0

  // IA illimitée = plan PRO ou BUSINESS payant et actif (pas trial)
  const hasUnlimitedAI =
    (rawPlan === SubscriptionPlan.PRO || rawPlan === SubscriptionPlan.BUSINESS) &&
    status === SubscriptionStatus.ACTIVE

  const aiCreditsRemaining = hasUnlimitedAI
    ? UNLIMITED_AI // sentinelle -1 = illimité
    : Math.max(0, aiCreditsTotal - aiCreditsUsed)

  const amountFcfa = isTrialActive
    ? 0
    : subscription?.amountFcfa && subscription.amountFcfa > 0
      ? subscription.amountFcfa
      : commercialDefinition.monthlyPriceFcfa

  const billingLabel = isTrialActive
    ? "Essai gratuit"
    : commercialDefinition.label

  const currentPlanLabel = isTrialActive
    ? `${commercialDefinition.label} (essai gratuit)`
    : commercialDefinition.label

  return {
    plan:               effectivePlan,
    rawPlan,
    commercialPlan,
    status,
    hasSubscriptionRecord,
    hasPaidAccess,
    amountFcfa,
    label:              commercialDefinition.label,
    billingLabel,
    currentPlanLabel,
    promise:            commercialDefinition.promise,
    audience:           commercialDefinition.audience,
    valueHeadline:      commercialDefinition.valueHeadline,
    maxActiveBatches:   definition.maxActiveBatches,
    maxFarms:           definition.maxFarms,
    recommended:        commercialDefinition.recommended,
    highlights:         commercialDefinition.highlights,
    isTrialActive,
    isTrialExpired,
    trialEndsAt,
    trialDaysRemaining,
    aiCreditsTotal,
    aiCreditsUsed,
    aiCreditsRemaining,
    hasUnlimitedAI,
  }
}
