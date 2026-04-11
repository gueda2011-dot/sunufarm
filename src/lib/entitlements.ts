import type { CommercialPlan } from "@/src/lib/offer-catalog"

export type SubscriptionEntitlement =
  | "ACTIVE_BATCH_LIMIT"
  | "FARM_LIMIT"
  | "FULL_HISTORY"
  | "ADVANCED_REPORTS"
  | "REAL_PROFITABILITY"
  | "BREAK_EVEN_PRICE"
  | "PREDICTIVE_STOCK_ALERTS"
  | "PREDICTIVE_HEALTH_ALERTS"
  | "PREDICTIVE_MARGIN_ALERTS"
  | "ADVANCED_HEALTH"
  | "GLOBAL_DASHBOARD"
  | "TEAM_ROLES"
  | "BATCH_COMPARISON"
  | "ACCOUNTING_EXPORT"
  | "EXPORT_WITHOUT_WATERMARK"
  | "AI_BATCH_ANALYSIS"

export interface PlanEntitlements {
  limits: {
    activeBatchLimit: number | null
    farmLimit: number | null
  }
  flags: Record<Exclude<SubscriptionEntitlement, "ACTIVE_BATCH_LIMIT" | "FARM_LIMIT">, boolean>
}

/** Nombre de saisies journalières visibles pour le plan FREE */
export const FREE_HISTORY_LIMIT = 7

export const PLAN_ENTITLEMENTS: Record<CommercialPlan, PlanEntitlements> = {
  FREE: {
    limits: {
      activeBatchLimit: 1,
      farmLimit: 1,
    },
    flags: {
      FULL_HISTORY: false,
      ADVANCED_REPORTS: false,
      REAL_PROFITABILITY: false,
      BREAK_EVEN_PRICE: false,
      PREDICTIVE_STOCK_ALERTS: false,
      PREDICTIVE_HEALTH_ALERTS: false,
      PREDICTIVE_MARGIN_ALERTS: false,
      ADVANCED_HEALTH: false,
      GLOBAL_DASHBOARD: false,
      TEAM_ROLES: false,
      BATCH_COMPARISON: false,
      ACCOUNTING_EXPORT: false,
      EXPORT_WITHOUT_WATERMARK: false,
      AI_BATCH_ANALYSIS: false,
    },
  },
  STARTER: {
    limits: {
      activeBatchLimit: null,
      farmLimit: 1,
    },
    flags: {
      FULL_HISTORY: true,
      ADVANCED_REPORTS: false,
      REAL_PROFITABILITY: false,
      BREAK_EVEN_PRICE: false,
      PREDICTIVE_STOCK_ALERTS: false,
      PREDICTIVE_HEALTH_ALERTS: false,
      PREDICTIVE_MARGIN_ALERTS: false,
      ADVANCED_HEALTH: false,
      GLOBAL_DASHBOARD: false,
      TEAM_ROLES: false,
      BATCH_COMPARISON: false,
      ACCOUNTING_EXPORT: false,
      EXPORT_WITHOUT_WATERMARK: false,
      AI_BATCH_ANALYSIS: false,
    },
  },
  PRO: {
    limits: {
      activeBatchLimit: null,
      farmLimit: 1,
    },
    flags: {
      FULL_HISTORY: true,
      ADVANCED_REPORTS: true,
      REAL_PROFITABILITY: true,
      BREAK_EVEN_PRICE: true,
      PREDICTIVE_STOCK_ALERTS: true,
      PREDICTIVE_HEALTH_ALERTS: true,
      PREDICTIVE_MARGIN_ALERTS: true,
      ADVANCED_HEALTH: true,
      GLOBAL_DASHBOARD: false,
      TEAM_ROLES: false,
      BATCH_COMPARISON: false,
      ACCOUNTING_EXPORT: false,
      EXPORT_WITHOUT_WATERMARK: true,
      AI_BATCH_ANALYSIS: true,
    },
  },
  BUSINESS: {
    limits: {
      activeBatchLimit: null,
      farmLimit: null,
    },
    flags: {
      FULL_HISTORY: true,
      ADVANCED_REPORTS: true,
      REAL_PROFITABILITY: true,
      BREAK_EVEN_PRICE: true,
      PREDICTIVE_STOCK_ALERTS: true,
      PREDICTIVE_HEALTH_ALERTS: true,
      PREDICTIVE_MARGIN_ALERTS: true,
      ADVANCED_HEALTH: true,
      GLOBAL_DASHBOARD: true,
      TEAM_ROLES: true,
      BATCH_COMPARISON: true,
      ACCOUNTING_EXPORT: true,
      EXPORT_WITHOUT_WATERMARK: true,
      AI_BATCH_ANALYSIS: true,
    },
  },
}

export function getPlanEntitlements(plan: CommercialPlan): PlanEntitlements {
  return PLAN_ENTITLEMENTS[plan]
}
