import {
  SubscriptionPlan,
} from "@/src/generated/prisma/client"

// ---------------------------------------------------------------------------
// Constantes essai gratuit
// ---------------------------------------------------------------------------

/** Durée de l'essai gratuit en jours */
export const TRIAL_DAYS = 7

/** Crédits IA offerts pendant l'essai */
export const TRIAL_AI_CREDITS = 3

/** Valeur sentinelle pour crédits illimités (plans payants actifs) */
export const UNLIMITED_AI = -1

// ---------------------------------------------------------------------------
// Features & plans
// ---------------------------------------------------------------------------

export type SubscriptionFeature =
  | "REPORTS"
  | "PROFITABILITY"
  | "ALERTS"
  | "ADVANCED_HEALTH"
  | "GLOBAL_ANALYTICS"
  | "PREDICTIVE_HEALTH_ALERTS"
  | "PREDICTIVE_MARGIN_ALERTS"
  | "MULTI_FARM"
  | "TEAM_MANAGEMENT"
  | "ADVANCED_EXPORTS"
  | "AI_BATCH_ANALYSIS"
  | "PREDICTIVE_STOCK_ALERTS"

interface PlanDefinition {
  label: string
  monthlyPriceFcfa: number
  promise: string
  audience: string
  valueHeadline: string
  maxActiveBatches: number
  maxFarms: number
  recommended?: boolean
  highlights: string[]
  features: Record<SubscriptionFeature, boolean>
}

export const PLAN_DEFINITIONS: Record<SubscriptionPlan, PlanDefinition> = {
  BASIC: {
    label: "Basic",
    monthlyPriceFcfa: 5_000,
    promise: "Mettre de l'ordre dans l'elevage au quotidien.",
    audience: "Petits eleveurs et exploitations en demarrage",
    valueHeadline: "Commencer a suivre proprement son elevage",
    maxActiveBatches: 2,
    maxFarms: 1,
    highlights: [
      "Suivre les lots et les depenses essentielles",
      "Centraliser la saisie quotidienne",
      "Avoir un tableau de bord simple pour demarrer",
    ],
    features: {
      REPORTS: false,
      PROFITABILITY: false,
      ALERTS: false,
      ADVANCED_HEALTH: false,
      GLOBAL_ANALYTICS: false,
      PREDICTIVE_HEALTH_ALERTS: false,
      PREDICTIVE_MARGIN_ALERTS: false,
      MULTI_FARM: false,
      TEAM_MANAGEMENT: false,
      ADVANCED_EXPORTS: false,
      AI_BATCH_ANALYSIS: false,
      PREDICTIVE_STOCK_ALERTS: false,
    },
  },
  PRO: {
    label: "Pro",
    monthlyPriceFcfa: 10_000,
    promise: "Piloter la rentabilite et reduire les pertes.",
    audience: "Eleveurs serieux qui veulent decider avec les chiffres",
    valueHeadline: "Savoir vite si un lot est rentable ou en danger",
    maxActiveBatches: 20,
    maxFarms: 1,
    recommended: true,
    highlights: [
      "Voir si un lot gagne ou perd de l'argent",
      "Detecter plus vite les pertes anormales",
      "Suivre l'evolution mensuelle de l'exploitation",
    ],
    features: {
      REPORTS: true,
      PROFITABILITY: true,
      ALERTS: true,
      ADVANCED_HEALTH: true,
      GLOBAL_ANALYTICS: false,
      PREDICTIVE_HEALTH_ALERTS: true,
      PREDICTIVE_MARGIN_ALERTS: true,
      MULTI_FARM: false,
      TEAM_MANAGEMENT: false,
      ADVANCED_EXPORTS: false,
      AI_BATCH_ANALYSIS: true,
      PREDICTIVE_STOCK_ALERTS: true,
    },
  },
  BUSINESS: {
    label: "Business",
    monthlyPriceFcfa: 25_000,
    promise: "Piloter toute l'exploitation avec une vraie vue dirigeant.",
    audience: "Grosses fermes, entreprises et structures multi-sites",
    valueHeadline: "Voir les risques, la marge et les urgences dans une seule lecture",
    maxActiveBatches: 100,
    maxFarms: 20,
    highlights: [
      "Piloter plusieurs fermes depuis une vue globale exploitation",
      "Faire remonter les signaux prioritaires avant qu'ils ne coutent cher",
      "Coordonner equipes, exports consolides et arbitrages dirigeants",
    ],
    features: {
      REPORTS: true,
      PROFITABILITY: true,
      ALERTS: true,
      ADVANCED_HEALTH: true,
      GLOBAL_ANALYTICS: true,
      PREDICTIVE_HEALTH_ALERTS: true,
      PREDICTIVE_MARGIN_ALERTS: true,
      MULTI_FARM: true,
      TEAM_MANAGEMENT: true,
      ADVANCED_EXPORTS: true,
      AI_BATCH_ANALYSIS: true,
      PREDICTIVE_STOCK_ALERTS: true,
    },
  },
}

export function getPlanDefinition(plan: SubscriptionPlan): PlanDefinition {
  return PLAN_DEFINITIONS[plan]
}

export function hasPlanFeature(
  plan: SubscriptionPlan,
  feature: SubscriptionFeature,
): boolean {
  return PLAN_DEFINITIONS[plan].features[feature]
}

// ---------------------------------------------------------------------------
// Helpers crédits IA
// ---------------------------------------------------------------------------

/**
 * Renvoie true si l'organisation peut lancer une analyse IA.
 * Utilisé côté client/serveur pour afficher ou bloquer le bouton IA.
 *
 * @param aiCreditsRemaining - valeur issue de OrganizationSubscriptionSummary
 * @param hasUnlimitedAI     - valeur issue de OrganizationSubscriptionSummary
 */
export function canUseAI(
  aiCreditsRemaining: number,
  hasUnlimitedAI: boolean,
): boolean {
  return hasUnlimitedAI || aiCreditsRemaining > 0
}

/**
 * Message affiché quand l'IA est épuisée ou non disponible.
 */
export function getAIUpgradeMessage(
  aiCreditsRemaining: number,
  hasUnlimitedAI: boolean,
): string {
  if (hasUnlimitedAI) return ""
  if (aiCreditsRemaining > 0) {
    return `${aiCreditsRemaining} analyse${aiCreditsRemaining > 1 ? "s" : ""} IA restante${aiCreditsRemaining > 1 ? "s" : ""}`
  }
  return "Vos crédits IA sont épuisés. Passez au plan Pro pour des analyses illimitées."
}

export function getFeatureUpgradeMessage(feature: SubscriptionFeature): string {
  switch (feature) {
    case "REPORTS":
      return "Les rapports mensuels sont disponibles a partir du plan Pro."
    case "PROFITABILITY":
      return "L'analyse de rentabilite est disponible a partir du plan Pro."
    case "ALERTS":
      return "Les alertes intelligentes sont disponibles a partir du plan Pro."
    case "ADVANCED_HEALTH":
      return "La surveillance sanitaire avancee est disponible a partir du plan Pro."
    case "GLOBAL_ANALYTICS":
      return "Passez a Business pour piloter l'exploitation depuis une vue consolidee des risques, marges et stocks critiques."
    case "PREDICTIVE_HEALTH_ALERTS":
      return "Les alertes predictives de mortalite sont disponibles a partir du plan Pro."
    case "PREDICTIVE_MARGIN_ALERTS":
      return "Les projections predictives de marge sont disponibles a partir du plan Pro."
    case "MULTI_FARM":
      return "Le plan Business permet de piloter plusieurs fermes sans perdre la lecture globale de l'exploitation."
    case "TEAM_MANAGEMENT":
      return "Passez a Business pour coordonner les responsables de site et structurer le travail d'equipe."
    case "ADVANCED_EXPORTS":
      return "Le plan Business debloque les exports consolides utiles pour le pilotage et le partage dirigeant."
    case "AI_BATCH_ANALYSIS":
      return "L'analyse intelligente des lots est disponible a partir du plan Pro."
    case "PREDICTIVE_STOCK_ALERTS":
      return "Les alertes predictives de rupture stock sont disponibles a partir du plan Pro."
  }
}
