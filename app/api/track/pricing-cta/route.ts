/**
 * SunuFarm — Tracking redirect pour les CTA de la page pricing (Phase 5)
 *
 * GET /api/track/pricing-cta?plan=PRO&from=profitability
 *
 * Enregistre un événement pricing_cta_clicked puis redirige vers WhatsApp.
 * Cette approche évite tout JavaScript côté client pour tracer le clic.
 *
 * Paramètres :
 *   plan  — plan visé (STARTER | PRO | BUSINESS)
 *   from  — surface d'origine (profitability | reports | business | batch_limit | farm_limit | team | direct)
 */

import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/src/auth"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { track } from "@/src/lib/analytics"

export const dynamic = "force-dynamic"

const WHATSAPP_NUMBER = "221000000000"

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const targetPlan = searchParams.get("plan") ?? "unknown"
  const from = searchParams.get("from") ?? "direct"

  // Tracking — fire and forget, ne bloque pas le redirect
  try {
    const session = await auth()
    if (session?.user?.id) {
      const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
      if (activeMembership) {
        const subscription = await getOrganizationSubscription(activeMembership.organizationId)
        track({
          userId: session.user.id,
          organizationId: activeMembership.organizationId,
          event: "pricing_cta_clicked",
          plan: subscription.commercialPlan,
          properties: { targetPlan, from },
        })
      }
    }
  } catch {
    // avalé — le tracking ne bloque jamais le redirect
  }

  const message = encodeURIComponent(`Bonjour, je veux passer au plan ${targetPlan} SunuFarm`)
  return NextResponse.redirect(
    `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`,
    { status: 302 },
  )
}
