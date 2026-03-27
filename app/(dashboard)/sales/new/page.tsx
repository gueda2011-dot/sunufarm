import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { auth } from "@/src/auth"
import { getBatches } from "@/src/actions/batches"
import { getCustomers } from "@/src/actions/customers"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
import { CreateSaleForm } from "./_components/CreateSaleForm"

export const metadata: Metadata = { title: "Nouvelle vente" }

export default async function NewSalePage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")
  ensureModuleAccess(activeMembership, "SALES")

  const [customersResult, batchesResult] = await Promise.all([
    getCustomers({ organizationId: activeMembership.organizationId }),
    getBatches({ organizationId: activeMembership.organizationId, limit: 100 }),
  ])

  const customers = customersResult.success
    ? customersResult.data.map((customer) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
      }))
    : []

  const batches = batchesResult.success
    ? batchesResult.data.map((batch) => ({
        id: batch.id,
        number: batch.number,
        type: batch.type,
        farmName: batch.building.farm.name,
      }))
    : []

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Nouvelle vente</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Enregistre une vente propre, relie les lignes aux lots et garde une trace exploitable.
        </p>
      </div>

      <CreateSaleForm
        organizationId={activeMembership.organizationId}
        customers={customers}
        batches={batches}
      />
    </div>
  )
}
