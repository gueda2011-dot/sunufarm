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
  | "MULTI_FARM"
  | "TEAM_MANAGEMENT"
  | "ADVANCED_EXPORTS"
  | "AI_BATCH_ANALYSIS"

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
      MULTI_FARM: false,
      TEAM_MANAGEMENT: false,
      ADVANCED_EXPORTS: false,
      AI_BATCH_ANALYSIS: false,
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
      MULTI_FARM: false,
      TEAM_MANAGEMENT: false,
      ADVANCED_EXPORTS: false,
      AI_BATCH_ANALYSIS: true,
    },
  },
  BUSINESS: {
    label: "Business",
    monthlyPriceFcfa: 25_000,
    promise: "Piloter plusieurs operations avec plus de controle.",
    audience: "Grosses fermes, entreprises et structures multi-sites",
    valueHeadline: "Coordonner equipes, fermes et analyses avancees",
    maxActiveBatches: 100,
    maxFarms: 20,
    highlights: [
      "Piloter plusieurs fermes sans confusion",
      "Structurer le travail des equipes et responsables de site",
      "Comparer les performances et prendre des decisions plus profondes",
    ],
    features: {
      REPORTS: true,
      PROFITABILITY: true,
      ALERTS: true,
      MULTI_FARM: true,
      TEAM_MANAGEMENT: true,
      ADVANCED_EXPORTS: true,
      AI_BATCH_ANALYSIS: true,
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
    case "MULTI_FARM":
      return "La gestion de plusieurs fermes est reservee au plan Business."
    case "TEAM_MANAGEMENT":
      return "La gestion d'equipe est reservee au plan Business."
    case "ADVANCED_EXPORTS":
      return "Les exports avances sont disponibles dans le plan Business."
    case "AI_BATCH_ANALYSIS":
      return "L'analyse intelligente des lots est disponible a partir du plan Pro."
  }
}
