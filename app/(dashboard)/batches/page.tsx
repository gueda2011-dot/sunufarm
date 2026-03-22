/**
 * SunuFarm — Liste des lots d'élevage (Server Component)
 *
 * Charge tous les lots de l'organisation (toutes statuts confondus, limit 200)
 * et délègue le filtrage client-side à BatchListClient.
 * Le bouton "Nouveau lot" redirige vers /batches/new.
 */

import Link             from "next/link"
import { redirect }     from "next/navigation"
import type { Metadata } from "next"
import { auth }         from "@/src/auth"
import prisma           from "@/src/lib/prisma"
import { getBatches }   from "@/src/actions/batches"
import { BatchListClient } from "./_components/BatchListClient"

export const metadata: Metadata = { title: "Lots d'élevage" }

export default async function BatchesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const membership = await prisma.userOrganization.findFirst({
    where:   { userId: session.user.id },
    select:  { organizationId: true },
    orderBy: { organization: { name: "asc" } },
  })
  if (!membership) redirect("/login?error=no-org")

  const { organizationId } = membership

  // Charge tous les lots — le filtrage (statut / type / ferme) est côté client
  const result = await getBatches({ organizationId, limit: 200 })
  const batches = result.success ? result.data : []

  return (
    <div className="mx-auto max-w-3xl space-y-5">

      {/* ── En-tête : titre + bouton création ───────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Lots d&apos;élevage</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Suivi complet de vos cycles de production.
          </p>
        </div>
        <Link
          href="/batches/new"
          className="inline-flex items-center gap-2 rounded-xl bg-green-600 text-white text-sm font-medium px-4 py-2.5 hover:bg-green-700 transition-colors whitespace-nowrap"
        >
          + Nouveau lot
        </Link>
      </div>

      {/* ── Liste avec filtres client-side ──────────────────────────────── */}
      <BatchListClient
        organizationId={organizationId}
        initialBatches={batches}
      />
    </div>
  )
}
