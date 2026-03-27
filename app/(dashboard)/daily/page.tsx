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
import { getBatches }        from "@/src/actions/batches"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
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

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")
  ensureModuleAccess(activeMembership, "DAILY")

  const { organizationId, role } = activeMembership

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
