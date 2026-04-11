import type { OrganizationSubscriptionSummary } from "@/src/lib/subscriptions.server"
import type { CommercialPlan } from "@/src/lib/offer-catalog"
import { getCommercialPlanDefinition } from "@/src/lib/offer-catalog"
import { getPlanEntitlements, type SubscriptionEntitlement } from "@/src/lib/entitlements"

export type GateAccess = "full" | "preview" | "blocked" | "locked"

export interface GateResolution {
  entitlement: SubscriptionEntitlement
  access: GateAccess
  currentPlan: CommercialPlan
  currentPlanLabel: string
  upgradePlan: CommercialPlan | null
  requiredPlanLabel: string | null
  reason: string
  cta: string
  usage: number | null
  limit: number | null
  watermark: boolean
}

interface GateOptions {
  usage?: number
  hasMinimumData?: boolean
  previewEnabled?: boolean
  reason?: string
}

function buildGateResolution(
  subscription: OrganizationSubscriptionSummary,
  entitlement: SubscriptionEntitlement,
  input: Omit<GateResolution, "entitlement" | "currentPlan" | "currentPlanLabel">,
): GateResolution {
  return {
    entitlement,
    currentPlan: subscription.commercialPlan,
    currentPlanLabel: subscription.currentPlanLabel,
    ...input,
  }
}

function getUpgradeLabel(upgradePlan: CommercialPlan | null): string | null {
  if (!upgradePlan) return null
  return getCommercialPlanDefinition(upgradePlan).label
}

export function resolveEntitlementGate(
  subscription: OrganizationSubscriptionSummary,
  entitlement: SubscriptionEntitlement,
  options: GateOptions = {},
): GateResolution {
  const planEntitlements = getPlanEntitlements(subscription.commercialPlan)
  const usage = options.usage ?? null
  const hasMinimumData = options.hasMinimumData ?? true
  const previewEnabled = options.previewEnabled ?? false
  const reason = options.reason

  switch (entitlement) {
    case "ACTIVE_BATCH_LIMIT": {
      const limit = planEntitlements.limits.activeBatchLimit
      if (limit === null || usage === null || usage < limit) {
        return buildGateResolution(subscription, entitlement, {
          access: "full",
          upgradePlan: null,
          requiredPlanLabel: null,
          reason: reason ?? "Capacite de lots disponible.",
          cta: "Vous pouvez continuer.",
          usage,
          limit,
          watermark: false,
        })
      }

      return buildGateResolution(subscription, entitlement, {
        access: "locked",
        upgradePlan: "STARTER",
        requiredPlanLabel: getUpgradeLabel("STARTER"),
        reason:
          reason ??
          `La limite actuelle est de ${limit} lot actif. Passez a Starter pour debloquer plus de capacite.`,
        cta: "Debloquer plus de lots",
        usage,
        limit,
        watermark: false,
      })
    }
    case "FARM_LIMIT": {
      const limit = planEntitlements.limits.farmLimit
      if (limit === null || usage === null || usage < limit) {
        return buildGateResolution(subscription, entitlement, {
          access: "full",
          upgradePlan: null,
          requiredPlanLabel: null,
          reason: reason ?? "Capacite de fermes disponible.",
          cta: "Vous pouvez continuer.",
          usage,
          limit,
          watermark: false,
        })
      }

      return buildGateResolution(subscription, entitlement, {
        access: "locked",
        upgradePlan: "BUSINESS",
        requiredPlanLabel: getUpgradeLabel("BUSINESS"),
        reason:
          reason ??
          `La limite actuelle est de ${limit} ferme. Passez a Business pour gerer plusieurs fermes.`,
        cta: "Passer a Business",
        usage,
        limit,
        watermark: false,
      })
    }
    case "FULL_HISTORY": {
      const hasAccess = planEntitlements.flags.FULL_HISTORY
      return buildGateResolution(subscription, entitlement, {
        access: hasAccess ? "full" : "locked",
        upgradePlan: hasAccess ? null : "STARTER",
        requiredPlanLabel: hasAccess ? null : getUpgradeLabel("STARTER"),
        reason:
          reason ??
          (hasAccess
            ? "Historique complet disponible."
            : "L historique complet est disponible a partir du plan Starter. Le plan Gratuit affiche les 7 dernieres saisies."),
        cta: hasAccess ? "Acces disponible" : "Debloquer l historique complet",
        usage: null,
        limit: null,
        watermark: false,
      })
    }
    case "ADVANCED_REPORTS": {
      const hasAccess = planEntitlements.flags.ADVANCED_REPORTS
      if (!hasMinimumData) {
        return buildGateResolution(subscription, entitlement, {
          access: "blocked",
          upgradePlan: hasAccess ? null : "PRO",
          requiredPlanLabel: hasAccess ? null : getUpgradeLabel("PRO"),
          reason: reason ?? "Pas assez de donnees pour produire une lecture mensuelle utile.",
          cta: "Continuez les saisies pour activer cette lecture",
          usage: null,
          limit: null,
          watermark: subscription.commercialPlan === "STARTER",
        })
      }

      if (hasAccess) {
        return buildGateResolution(subscription, entitlement, {
          access: "full",
          upgradePlan: null,
          requiredPlanLabel: null,
          reason: reason ?? "Les rapports avances sont disponibles.",
          cta: "Acces disponible",
          usage: null,
          limit: null,
          watermark: false,
        })
      }

      return buildGateResolution(subscription, entitlement, {
        access: previewEnabled ? "preview" : "locked",
        upgradePlan: "PRO",
        requiredPlanLabel: getUpgradeLabel("PRO"),
        reason:
          reason ??
          (previewEnabled
            ? "La tendance mensuelle est visible, mais la lecture complete et les exports avances restent reserves au plan Pro."
            : "Les rapports mensuels et exports avances sont disponibles a partir du plan Pro."),
        cta: previewEnabled ? "Debloquer les rapports complets" : "Debloquer les rapports",
        usage: null,
        limit: null,
        watermark: subscription.commercialPlan === "STARTER",
      })
    }
    case "GLOBAL_DASHBOARD":
    case "TEAM_ROLES":
    case "BATCH_COMPARISON":
    case "ACCOUNTING_EXPORT": {
      const hasAccess = planEntitlements.flags[entitlement]
      return buildGateResolution(subscription, entitlement, {
        access: hasAccess ? "full" : "locked",
        upgradePlan: hasAccess ? null : "BUSINESS",
        requiredPlanLabel: hasAccess ? null : getUpgradeLabel("BUSINESS"),
        reason:
          reason ??
          (hasAccess
            ? "Capacite Business disponible."
            : "Cette capacite est reservee au plan Business."),
        cta: hasAccess ? "Acces disponible" : "Passer a Business",
        usage: null,
        limit: null,
        watermark: false,
      })
    }
    case "ADVANCED_HEALTH":
    case "PREDICTIVE_STOCK_ALERTS":
    case "PREDICTIVE_HEALTH_ALERTS":
    case "PREDICTIVE_MARGIN_ALERTS": {
      const hasAccess = planEntitlements.flags[entitlement]
      if (!hasMinimumData) {
        return buildGateResolution(subscription, entitlement, {
          access: "blocked",
          upgradePlan: hasAccess ? null : "PRO",
          requiredPlanLabel: hasAccess ? null : getUpgradeLabel("PRO"),
          reason: reason ?? "Pas assez de donnees pour activer cette lecture.",
          cta: "Continuez a saisir pour activer cette lecture",
          usage: null,
          limit: null,
          watermark: false,
        })
      }

      return buildGateResolution(subscription, entitlement, {
        access: hasAccess ? "full" : "locked",
        upgradePlan: hasAccess ? null : "PRO",
        requiredPlanLabel: hasAccess ? null : getUpgradeLabel("PRO"),
        reason:
          reason ??
          (hasAccess
            ? "Lecture predictive disponible."
            : "Cette lecture actionnable est disponible a partir du plan Pro."),
        cta: hasAccess ? "Acces disponible" : "Debloquer les alertes actionnables",
        usage: null,
        limit: null,
        watermark: false,
      })
    }
    case "REAL_PROFITABILITY":
    case "BREAK_EVEN_PRICE": {
      const hasAccess = planEntitlements.flags[entitlement]
      const isBreakEvenPrice = entitlement === "BREAK_EVEN_PRICE"
      if (!hasMinimumData) {
        return buildGateResolution(subscription, entitlement, {
          access: "blocked",
          upgradePlan: hasAccess ? null : "PRO",
          requiredPlanLabel: hasAccess ? null : getUpgradeLabel("PRO"),
          reason:
            reason ??
            (isBreakEvenPrice
              ? "Pas assez de donnees pour estimer un prix minimum de vente fiable."
              : "Pas assez de donnees pour produire une lecture fiable."),
          cta:
            isBreakEvenPrice
              ? "Continuez la saisie pour preparer ce prix minimum"
              : "Continuez la saisie pour preparer cette lecture",
          usage: null,
          limit: null,
          watermark: false,
        })
      }

      if (hasAccess) {
        return buildGateResolution(subscription, entitlement, {
          access: "full",
          upgradePlan: null,
          requiredPlanLabel: null,
          reason:
            reason ??
            (isBreakEvenPrice
              ? "Le prix minimum de vente exact est disponible."
              : "Lecture economique complete disponible."),
          cta: "Acces disponible",
          usage: null,
          limit: null,
          watermark: false,
        })
      }

      return buildGateResolution(subscription, entitlement, {
        access: previewEnabled ? "preview" : "locked",
        upgradePlan: "PRO",
        requiredPlanLabel: getUpgradeLabel("PRO"),
        reason:
          reason ??
          (isBreakEvenPrice
            ? previewEnabled
              ? "Le prix minimum commence a se dessiner, mais la valeur exacte reste reservee au plan Pro."
              : "Le prix minimum de vente exact est reserve au plan Pro."
            : previewEnabled
              ? "La valeur est en train d'apparaitre, mais la lecture exacte est reservee au plan Pro."
              : "La lecture economique exacte est reservee au plan Pro."),
        cta:
          isBreakEvenPrice
            ? "Debloquer le prix minimum exact"
            : "Debloquer la vraie rentabilite",
        usage: null,
        limit: null,
        watermark: false,
      })
    }
    case "EXPORT_WITHOUT_WATERMARK": {
      const hasAccess = planEntitlements.flags.EXPORT_WITHOUT_WATERMARK
      return buildGateResolution(subscription, entitlement, {
        access: hasAccess ? "full" : "locked",
        upgradePlan: hasAccess ? null : "PRO",
        requiredPlanLabel: hasAccess ? null : getUpgradeLabel("PRO"),
        reason:
          reason ??
          (hasAccess
            ? "Export sans watermark disponible."
            : "L'export sans watermark est disponible a partir du plan Pro."),
        cta: hasAccess ? "Acces disponible" : "Supprimer le watermark",
        usage: null,
        limit: null,
        watermark: !hasAccess,
      })
    }
    case "AI_BATCH_ANALYSIS": {
      const hasAccess = subscription.isTrialActive || planEntitlements.flags.AI_BATCH_ANALYSIS
      return buildGateResolution(subscription, entitlement, {
        access: hasAccess ? "full" : "locked",
        upgradePlan: hasAccess ? null : "PRO",
        requiredPlanLabel: hasAccess ? null : getUpgradeLabel("PRO"),
        reason:
          reason ??
          (hasAccess
            ? "Analyse par lot disponible."
            : "L'analyse plus poussee par lot est disponible a partir du plan Pro."),
        cta: hasAccess ? "Acces disponible" : "Debloquer l'analyse par lot",
        usage: null,
        limit: null,
        watermark: false,
      })
    }
  }
}

export function gateHasFullAccess(gate: GateResolution): boolean {
  return gate.access === "full"
}
