import { redirect }      from "next/navigation"
import type { Metadata } from "next"
import { auth }          from "@/src/auth"
import prisma            from "@/src/lib/prisma"
import { getBatches }    from "@/src/actions/batches"
import { getEggRecords } from "@/src/actions/eggs"
import { EggsClient }    from "./_components/EggsClient"

export const metadata: Metadata = { title: "Production d'œufs" }

export default async function EggsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const membership = await prisma.userOrganization.findFirst({
    where:   { userId: session.user.id },
    select:  { organizationId: true, role: true },
    orderBy: { organization: { name: "asc" } },
  })
  if (!membership) redirect("/start")

  const { organizationId, role } = membership

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
