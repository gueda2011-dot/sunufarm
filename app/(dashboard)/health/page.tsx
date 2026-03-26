/**
 * SunuFarm — Page Santé animale (Server Component)
 *
 * Vue organisation : vaccinations et traitements récents sur tous les lots actifs.
 * La création se fait depuis le détail d'un lot (HealthSection).
 */

import { redirect }      from "next/navigation"
import type { Metadata } from "next"
import { auth }          from "@/src/auth"
import prisma            from "@/src/lib/prisma"
import { getVaccinations, getTreatments } from "@/src/actions/health"
import { HealthPageClient }               from "./_components/HealthPageClient"

export const metadata: Metadata = { title: "Santé animale" }

export default async function HealthPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const membership = await prisma.userOrganization.findFirst({
    where:   { userId: session.user.id },
    select:  { organizationId: true, role: true },
    orderBy: { organization: { name: "asc" } },
  })
  if (!membership) redirect("/login?error=no-org")

  const { organizationId } = membership

  // Fetch parallèle : vaccinations + traitements + map lots actifs
  const [vaccinationsResult, treatmentsResult, batches] = await Promise.all([
    getVaccinations({ organizationId, limit: 30 }),
    getTreatments({ organizationId, limit: 30 }),
    prisma.batch.findMany({
      where:  { organizationId, deletedAt: null },
      select: { id: true, number: true, status: true },
    }),
  ])

  const vaccinations = vaccinationsResult.success ? vaccinationsResult.data : []
  const treatments   = treatmentsResult.success   ? treatmentsResult.data   : []

  // Map batchId → numéro de lot pour l'affichage
  const batchMap = Object.fromEntries(
    batches.map((b) => [b.id, { number: b.number, status: b.status }])
  )

  // KPIs
  const now       = new Date()
  const weekAgo   = new Date(now.getTime() - 7 * 86_400_000)
  const recentVax = vaccinations.filter((v) => new Date(v.date) >= weekAgo).length
  const activeTreatments = treatments.filter((t) => !t.endDate || new Date(t.endDate) >= now).length

  return (
    <HealthPageClient
      vaccinations={vaccinations}
      treatments={treatments}
      batchMap={batchMap}
      recentVaxCount={recentVax}
      activeTreatmentsCount={activeTreatments}
      totalVaxCount={vaccinations.length}
      totalTreatmentsCount={treatments.length}
    />
  )
}
