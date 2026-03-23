import Link from "next/link"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { getSession } from "@/src/lib/auth"
import prisma from "@/src/lib/prisma"
import { getBatches } from "@/src/actions/batches"
import { BatchListClient } from "./_components/BatchListClient"

export const metadata: Metadata = { title: "Lots d'elevage" }

export default async function BatchesPage() {
  const session = await getSession()
  if (!session?.user?.id) redirect("/login")

  const memberships = await prisma.userOrganization.findMany({
    where: session.isImpersonating
      ? {
          userId: session.effectiveUserId,
          organizationId: session.impersonatedOrganizationId ?? undefined,
        }
      : {
          userId: session.effectiveUserId,
        },
    select: { organizationId: true },
    orderBy: { organization: { name: "asc" } },
  })

  if (memberships.length === 0) redirect("/login?error=no-org")

  const organizationId = memberships[0].organizationId
  const result = await getBatches({ organizationId, limit: 100 })
  const batches = result.success ? result.data : []

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Lots d&apos;elevage</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Suivi complet de vos cycles de production.
          </p>
        </div>
        <Link
          href="/batches/new"
          className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
        >
          + Nouveau lot
        </Link>
      </div>

      <BatchListClient
        organizationId={organizationId}
        initialBatches={batches}
        loadError={result.success ? null : result.error}
      />
    </div>
  )
}
