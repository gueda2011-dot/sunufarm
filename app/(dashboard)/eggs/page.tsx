import { redirect }      from "next/navigation"
import type { Metadata } from "next"
import { auth }          from "@/src/auth"
import { getBatches }    from "@/src/actions/batches"
import { getEggRecords } from "@/src/actions/eggs"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
import { EggsClient }    from "./_components/EggsClient"

export const metadata: Metadata = { title: "Production d'œufs" }

export default async function EggsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")
  ensureModuleAccess(activeMembership, "EGGS")

  const { organizationId, role } = activeMembership

  // Lots pondeuses actifs + records récents en parallèle
  const [batchesResult, recordsResult] = await Promise.all([
    getBatches({ organizationId, status: "ACTIVE", type: "PONDEUSE", limit: 100 }),
    getEggRecords({ organizationId, limit: 50 }),
  ])

  const pondeuseBatches = batchesResult.success ? batchesResult.data : []
  const initialRecords  = recordsResult.success  ? recordsResult.data  : []

  return (
    <EggsClient
      organizationId={organizationId}
      userRole={role as string}
      pondeuseBatches={pondeuseBatches}
      initialRecords={initialRecords}
    />
  )
}
