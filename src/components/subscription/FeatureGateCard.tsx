import Link from "next/link"
import type { GateAccess } from "@/src/lib/gate-resolver"

interface FeatureGateCardProps {
  title: string
  message: string
  currentPlanLabel: string
  targetPlanLabel?: string | null
  access: GateAccess
  highlights?: string[]
  footerHint?: string
  ctaLabel?: string
  /**
   * Identifiant de la surface d'où vient le paywall.
   * Ajouté comme ?from= dans l'URL /pricing pour le tracking funnel.
   * Exemples : "profitability", "reports", "business", "batch_limit", "farm_limit", "team"
   */
  trackingSurface?: string
}

const ACCESS_COPY: Record<GateAccess, { badge: string; badgeClass: string }> = {
  full: {
    badge: "Disponible",
    badgeClass: "bg-green-100 text-green-800",
  },
  preview: {
    badge: "Apercu",
    badgeClass: "bg-blue-100 text-blue-800",
  },
  blocked: {
    badge: "Preparation",
    badgeClass: "bg-gray-100 text-gray-700",
  },
  locked: {
    badge: "Premium",
    badgeClass: "bg-amber-100 text-amber-800",
  },
}

export function FeatureGateCard({
  title,
  message,
  currentPlanLabel,
  targetPlanLabel,
  access,
  highlights = [],
  footerHint,
  ctaLabel,
  trackingSurface,
}: FeatureGateCardProps) {
  const pricingHref = trackingSurface ? `/pricing?from=${trackingSurface}` : "/pricing"
  const accessCopy = ACCESS_COPY[access]

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${accessCopy.badgeClass}`}>
          {accessCopy.badge}
        </span>
        {targetPlanLabel && (
          <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Plan {targetPlanLabel}
          </span>
        )}
      </div>

      <h2 className="mt-3 text-lg font-semibold text-gray-900">{title}</h2>
      <p className="mt-2 text-sm text-gray-700">{message}</p>

      {highlights.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
            Valeur debloquee
          </p>
          <ul className="space-y-2 text-sm text-gray-700">
          {highlights.map((highlight) => (
            <li key={highlight} className="rounded-xl border border-amber-100 bg-white/70 px-3 py-2">
              {highlight}
            </li>
          ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-sm font-medium text-amber-800">
        Plan actuel : {currentPlanLabel}
      </p>

      {ctaLabel && access !== "full" && (
        <Link
          href={pricingHref}
          className="mt-3 inline-flex rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-amber-50"
        >
          {ctaLabel} →
        </Link>
      )}

      {footerHint && (
        <p className="mt-2 text-xs text-amber-700">{footerHint}</p>
      )}
    </div>
  )
}
