/**
 * SunuFarm — Saisie journalière (Server Component)
 *
 * Responsabilités :
 *   1. Auth guard (session → redirect /login si absent)
 *   2. Résolution organisation active (première alphabétiquement, cohérent avec layout)
 *   3. Chargement SSR des lots actifs → rendu immédiat sans flash de chargement
 *   4. Transmission du rôle utilisateur pour la gestion du locked state côté client
 *   5. Support ?batchId= pour pré-sélection depuis la liste des lots (bouton "Saisir")
 *      → le lot est pré-sélectionné si son id est dans les lots actifs chargés
 */

import { redirect }          from "next/navigation"
import type { Metadata }     from "next"
import { auth }              from "@/src/auth"
import prisma                from "@/src/lib/prisma"
import { getBatches }        from "@/src/actions/batches"
import { DailyEntryClient }  from "./_components/DailyEntryClient"

export const metadata: Metadata = {
  title: "Saisie journalière",
}

export default async function DailyPage({
  searchParams,
}: {
  searchParams: Promise<{ batchId?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  // Même logique que le dashboard layout — première organisation alphabétiquement
  const membership = await prisma.userOrganization.findFirst({
    where:   { userId: session.user.id },
    select:  { organizationId: true, role: true },
    orderBy: { organization: { name: "asc" } },
  })

  if (!membership) redirect("/login?error=no-org")

  const { organizationId, role } = membership

  // ?batchId= transmis par le bouton "Saisir" de la liste des lots
  const { batchId: defaultBatchId } = await searchParams

  // Lots actifs chargés en SSR — disponibles immédiatement, sans flash côté client
  const batchesResult = await getBatches({
    organizationId,
    status: "ACTIVE",
    limit:  100,
  })
  const initialBatches = batchesResult.success ? batchesResult.data : []

  return (
    <DailyEntryClient
      organizationId={organizationId}
      userRole={role as string}
      initialBatches={initialBatches}
      defaultBatchId={defaultBatchId}
    />
  )
}
