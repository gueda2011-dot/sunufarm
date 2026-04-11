/**
 * SunuFarm — Page Pricing
 *
 * Affiche tous les plans disponibles avec leurs caractéristiques, leur prix
 * et un CTA pour passer à l'action. Accessible à tout utilisateur connecté.
 *
 * Les données sont issues du Offer Catalog — source de vérité unique.
 */

import type { Metadata } from "next"
import { Check } from "lucide-react"
import { COMMERCIAL_PLAN_CATALOG, type CommercialPlan } from "@/src/lib/offer-catalog"
import { auth } from "@/src/auth"
import { redirect } from "next/navigation"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { track } from "@/src/lib/analytics"
import { cn } from "@/src/lib/utils"

export const metadata: Metadata = { title: "Plans et tarifs" }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(priceFcfa: number): string {
  if (priceFcfa === 0) return "Gratuit"
  return `${priceFcfa.toLocaleString("fr-SN")} FCFA`
}

// Table de comparaison des fonctionnalités clés
const FEATURE_ROWS: { label: string; plans: Record<CommercialPlan, string | boolean> }[] = [
  {
    label: "Fermes",
    plans: { FREE: "1 ferme", STARTER: "1 ferme", PRO: "1 ferme", BUSINESS: "Illimitées" },
  },
  {
    label: "Lots actifs",
    plans: { FREE: "1 lot", STARTER: "Illimités", PRO: "Illimités", BUSINESS: "Illimités" },
  },
  {
    label: "Saisie journalière",
    plans: { FREE: true, STARTER: true, PRO: true, BUSINESS: true },
  },
  {
    label: "Ventes et dépenses",
    plans: { FREE: false, STARTER: true, PRO: true, BUSINESS: true },
  },
  {
    label: "Historique complet",
    plans: { FREE: "7 dernières saisies", STARTER: true, PRO: true, BUSINESS: true },
  },
  {
    label: "Export PDF",
    plans: { FREE: false, STARTER: "Avec watermark", PRO: "Sans watermark", BUSINESS: "Sans watermark" },
  },
  {
    label: "Rentabilité réelle par lot",
    plans: { FREE: false, STARTER: false, PRO: true, BUSINESS: true },
  },
  {
    label: "Prix minimum de vente",
    plans: { FREE: false, STARTER: false, PRO: true, BUSINESS: true },
  },
  {
    label: "Alertes actionnables",
    plans: { FREE: false, STARTER: false, PRO: true, BUSINESS: true },
  },
  {
    label: "Dashboard global",
    plans: { FREE: false, STARTER: false, PRO: false, BUSINESS: true },
  },
  {
    label: "Équipe et rôles",
    plans: { FREE: false, STARTER: false, PRO: false, BUSINESS: true },
  },
]

function FeatureValue({ value }: { value: string | boolean }) {
  if (value === true) {
    return <Check className="mx-auto h-4 w-4 text-green-600" aria-label="Inclus" />
  }
  if (value === false) {
    return <span className="text-gray-300">—</span>
  }
  return <span className="text-xs text-gray-600">{value}</span>
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")

  const [subscription, sp] = await Promise.all([
    getOrganizationSubscription(activeMembership.organizationId),
    searchParams,
  ])
  const currentPlan = subscription.commercialPlan
  const from = sp.from ?? "direct"

  // Tracker la visite avec le contexte d'origine (depuis quel paywall)
  void track({
    userId: session.user.id,
    organizationId: activeMembership.organizationId,
    event: "pricing_page_visited",
    plan: subscription.commercialPlan,
    properties: { from },
  })

  const plans = (["FREE", "STARTER", "PRO", "BUSINESS"] as const).map(
    (code) => COMMERCIAL_PLAN_CATALOG[code],
  )

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-8">
      {/* En-tête */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">Plans et tarifs</h1>
        <p className="mt-2 text-sm text-gray-500">
          Choisissez le plan adapté à votre exploitation. La saisie journalière reste
          toujours accessible, quel que soit le plan.
        </p>
        {currentPlan !== "FREE" && (
          <p className="mt-2 text-xs font-medium text-green-700">
            Votre plan actuel : {COMMERCIAL_PLAN_CATALOG[currentPlan].label}
          </p>
        )}
      </div>

      {/* Cartes plans */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const isCurrent = plan.code === currentPlan
          const isRecommended = plan.recommended

          return (
            <div
              key={plan.code}
              className={cn(
                "relative flex flex-col rounded-2xl border p-5",
                isRecommended
                  ? "border-amber-300 bg-amber-50 shadow-md"
                  : "border-gray-200 bg-white",
                isCurrent && "ring-2 ring-green-400",
              )}
            >
              {isRecommended && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-amber-500 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                    Recommandé
                  </span>
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 right-4">
                  <span className="rounded-full bg-green-500 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                    Plan actuel
                  </span>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {plan.label}
                </p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {formatPrice(plan.monthlyPriceFcfa)}
                </p>
                {plan.monthlyPriceFcfa > 0 && (
                  <p className="text-xs text-gray-400">par mois</p>
                )}
              </div>

              <p className="mt-3 text-sm text-gray-600">{plan.promise}</p>

              <ul className="mt-4 flex-1 space-y-2">
                {plan.highlights.map((highlight) => (
                  <li key={highlight} className="flex items-start gap-2 text-xs text-gray-700">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" aria-hidden="true" />
                    {highlight}
                  </li>
                ))}
              </ul>

              <div className="mt-5">
                {isCurrent ? (
                  <div className="rounded-lg border border-green-200 bg-green-50 py-2 text-center text-sm font-medium text-green-700">
                    Plan actif
                  </div>
                ) : plan.code === "FREE" ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 py-2 text-center text-sm text-gray-500">
                    Plan de départ
                  </div>
                ) : (
                  <a
                    href={`/api/track/pricing-cta?plan=${plan.code}&from=${from}`}
                    className={cn(
                      "block rounded-lg py-2 text-center text-sm font-medium transition-colors",
                      isRecommended
                        ? "bg-amber-500 text-white hover:bg-amber-600"
                        : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
                    )}
                  >
                    Choisir {plan.label}
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Tableau comparatif */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-900">Comparaison détaillée</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">
                  Fonctionnalité
                </th>
                {plans.map((plan) => (
                  <th
                    key={plan.code}
                    className={cn(
                      "px-4 py-3 text-center text-xs font-semibold",
                      plan.code === currentPlan ? "text-green-700" : "text-gray-700",
                      plan.recommended ? "text-amber-700" : "",
                    )}
                  >
                    {plan.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURE_ROWS.map((row, i) => (
                <tr
                  key={row.label}
                  className={cn(
                    "border-b border-gray-50 last:border-0",
                    i % 2 === 0 ? "bg-white" : "bg-gray-50/50",
                  )}
                >
                  <td className="px-6 py-3 text-xs font-medium text-gray-700">
                    {row.label}
                  </td>
                  {plans.map((plan) => (
                    <td key={plan.code} className="px-4 py-3 text-center">
                      <FeatureValue value={row.plans[plan.code]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Note de bas de page */}
      <p className="text-center text-xs text-gray-400">
        Les plans sont sans engagement. Pour changer de plan ou pour toute question,
        contactez-nous via WhatsApp.
      </p>
    </div>
  )
}
