import {
  SubscriptionPlan,
} from "@/src/generated/prisma/client"

export type SubscriptionFeature =
  | "REPORTS"
  | "PROFITABILITY"
  | "ALERTS"
  | "MULTI_FARM"
  | "TEAM_MANAGEMENT"
  | "ADVANCED_EXPORTS"

interface PlanDefinition {
  label: string
  monthlyPriceFcfa: number
  promise: string
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
    },
  },
  PRO: {
    label: "Pro",
    monthlyPriceFcfa: 10_000,
    promise: "Piloter la rentabilite et reduire les pertes.",
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
    },
  },
  BUSINESS: {
    label: "Business",
    monthlyPriceFcfa: 20_000,
    promise: "Gerer plusieurs fermes et structurer les operations.",
    maxActiveBatches: 100,
    maxFarms: 20,
    highlights: [
      "Piloter plusieurs fermes sans confusion",
      "Structurer le travail des equipes",
      "Avoir une base solide pour grandir",
    ],
    features: {
      REPORTS: true,
      PROFITABILITY: true,
      ALERTS: true,
      MULTI_FARM: true,
      TEAM_MANAGEMENT: true,
      ADVANCED_EXPORTS: true,
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
  }
}
