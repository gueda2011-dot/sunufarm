"use server"

/**
 * SunuFarm — Server Actions analytics (Phase 5)
 *
 * Utilisées depuis les Client Components pour tracker des événements
 * qui se produisent côté navigateur (clics, interactions).
 *
 * Règles :
 *   - Toujours fire-and-forget : ne jamais await ces actions dans le chemin critique
 *   - Les erreurs sont avalées — l'analytics ne bloque jamais l'UX
 */

import { auth } from "@/src/auth"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { track } from "@/src/lib/analytics"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"

// ---------------------------------------------------------------------------
// trackAlertAction — clic sur une action depuis le dropdown de notifications
// ---------------------------------------------------------------------------

export async function trackAlertAction(params: {
  resourceType: string | null
  priority: string | null
  trend?: string | null
  actionUrl: string | null
}): Promise<void> {
  try {
    const session = await auth()
    if (!session?.user?.id) return

    const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
    if (!activeMembership) return

    const subscription = await getOrganizationSubscription(activeMembership.organizationId)

    track({
      userId: session.user.id,
      organizationId: activeMembership.organizationId,
      event: "alert_action_clicked",
      plan: subscription.commercialPlan,
      properties: {
        resourceType: params.resourceType ?? undefined,
        priority: params.priority ?? undefined,
        trend: params.trend ?? undefined,
        actionUrl: params.actionUrl ?? undefined,
      },
    })
  } catch {
    // avalé — l'analytics ne bloque jamais
  }
}
