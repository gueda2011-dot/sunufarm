/**
 * SunuFarm — Liste des lots d'élevage (Server Component)
 *
 * Charge tous les lots de l'organisation en SSR (limit: 100).
 * Les filtres statut / type / ferme sont appliqués côté client
 * depuis cette liste initiale — pas de re-fetch sur changement de filtre.
 */

import { redirect }          from "next/navigation"
import type { Metadata }     from "next"
import { auth }              from "@/src/auth"
import prisma                from "@/src/lib/prisma"
import { getBatches }        from "@/src/actions/batches"
import { BatchListClient }   from "./_components/BatchListClient"

export const metadata: Metadata = {
  title: "Lots d'élevage",
}

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

  // Tous les lots chargés en SSR — filtres client-side depuis cette liste
  const batchesResult = await getBatches({
    organizationId,
    limit: 100,
  })
  const initialBatches = batchesResult.success ? batchesResult.data : []

  return (
    <BatchListClient
      organizationId={organizationId}
      initialBatches={initialBatches}
    />
  )
}
