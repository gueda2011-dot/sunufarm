/**
 * SunuFarm — Couche d'instrumentation produit (Phase 5)
 *
 * track() est fire-and-forget :
 *   - ne jamais await — appeler avec void track(...)
 *   - les erreurs sont avalées pour ne jamais impacter le chemin utilisateur
 *   - accessible uniquement depuis le serveur (Server Components, Server Actions, API routes)
 *
 * Pour les événements client-side, utiliser src/actions/analytics.ts
 *
 * Schéma propriétés par événement :
 *
 *   paywall_viewed          { entitlement, surface, access }
 *   pricing_page_visited    { from? }
 *   pricing_cta_clicked     { targetPlan, from? }
 *   export_launched         { format, reportType }
 *   alert_action_clicked    { resourceType, priority, trend?, actionUrl }
 *   feature_viewed          { entitlement, surface }
 *   subscription_activated        { plan, triggeredBy, amountFcfa, isRenewal? }
 *   subscription_payment_requested { plan, amountFcfa, paymentMethod }
 */

import prisma from "@/src/lib/prisma"
import { Prisma } from "@/src/generated/prisma/client"
import { logger } from "@/src/lib/logger"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnalyticsEventName =
  | "paywall_viewed"
  | "pricing_page_visited"
  | "pricing_cta_clicked"
  | "export_launched"
  | "alert_action_clicked"
  | "feature_viewed"
  | "subscription_activated"
  | "subscription_payment_requested"

export interface TrackParams {
  userId?: string | null
  organizationId?: string | null
  event: AnalyticsEventName
  plan?: string | null
  properties?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Fonction principale — fire and forget
// ---------------------------------------------------------------------------

export function track(params: TrackParams): void {
  const { userId, organizationId, event, plan, properties = {} } = params

  const id = `anl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`

  prisma.analyticsEvent
    .create({
      data: {
        id,
        userId: userId ?? null,
        organizationId: organizationId ?? null,
        event,
        plan: plan ?? null,
        properties: properties as Prisma.InputJsonValue,
      },
    })
    .catch((err: unknown) => {
      // Avalé intentionnellement — l'analytics ne doit jamais casser le produit
      logger.warn("analytics.track.error", { event, error: err })
    })
}
