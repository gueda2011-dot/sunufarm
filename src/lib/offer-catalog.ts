export type CommercialPlan = "FREE" | "STARTER" | "PRO" | "BUSINESS"

export interface CommercialPlanDefinition {
  code: CommercialPlan
  label: string
  monthlyPriceFcfa: number
  promise: string
  audience: string
  valueHeadline: string
  recommended?: boolean
  highlights: string[]
}

export const COMMERCIAL_PLAN_CATALOG: Record<CommercialPlan, CommercialPlanDefinition> = {
  FREE: {
    code: "FREE",
    label: "Gratuit",
    monthlyPriceFcfa: 0,
    promise: "Prendre l'habitude de saisir chaque jour sans friction.",
    audience: "Eleveurs qui demarrent ou qui decouvrent SunuFarm",
    valueHeadline: "Creer l'habitude avant de chercher des analyses avancees",
    highlights: [
      "1 ferme et 1 lot actif pour commencer simplement",
      "Saisie journaliere complete sans blocage",
      "Lecture simple du lot avec apercus partiels",
    ],
  },
  STARTER: {
    code: "STARTER",
    label: "Starter",
    monthlyPriceFcfa: 3_500,
    promise: "Mieux organiser l'exploitation au quotidien.",
    audience: "Eleveurs qui veulent structurer leurs operations",
    valueHeadline: "Passer de l'habitude a l'organisation",
    highlights: [
      "Lots illimites pour suivre toute l'activite",
      "Ventes, depenses, stock basique et historique complet",
      "Export PDF disponible avec watermark",
    ],
  },
  PRO: {
    code: "PRO",
    label: "Pro",
    monthlyPriceFcfa: 8_000,
    promise: "Prendre les bonnes decisions economiques au bon moment.",
    audience: "Eleveurs qui veulent proteger leur marge",
    valueHeadline: "Voir la vraie rentabilite et agir avant la perte",
    recommended: true,
    highlights: [
      "Rentabilite reelle par lot et prix minimum de vente",
      "Alertes actionnables sur mortalite, aliment et stock",
      "Analyse plus poussee pour decider plus vite",
    ],
  },
  BUSINESS: {
    code: "BUSINESS",
    label: "Business",
    monthlyPriceFcfa: 20_000,
    promise: "Piloter toute l'exploitation avec une lecture dirigeant.",
    audience: "Structures multi-sites ou equipes de production",
    valueHeadline: "Arbitrer vite avec une vue globale de l'exploitation",
    highlights: [
      "Multi-fermes, equipe et roles",
      "Dashboard global et comparaison entre lots",
      "Rapports avances et export comptable",
    ],
  },
}

export function getCommercialPlanDefinition(plan: CommercialPlan): CommercialPlanDefinition {
  return COMMERCIAL_PLAN_CATALOG[plan]
}

export function compareCommercialPlan(left: CommercialPlan, right: CommercialPlan): number {
  const order: Record<CommercialPlan, number> = {
    FREE: 0,
    STARTER: 1,
    PRO: 2,
    BUSINESS: 3,
  }

  return order[left] - order[right]
}

export function hasCommercialPlanAtLeast(
  currentPlan: CommercialPlan,
  requiredPlan: CommercialPlan,
): boolean {
  return compareCommercialPlan(currentPlan, requiredPlan) >= 0
}
