import { redirect } from "next/navigation"
import type { Metadata } from "next"

import { auth } from "@/src/auth"
import prisma from "@/src/lib/prisma"
import { CreateSaleForm } from "./_components/CreateSaleForm"

export const metadata: Metadata = { title: "Nouvelle vente" }

export default async function NewSalePage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const membership = await prisma.userOrganization.findFirst({
    where: { userId: session.user.id },
    select: { organizationId: true },
    orderBy: { organization: { name: "asc" } },
  })

  if (!membership) redirect("/login?error=no-org")

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          Nouvelle vente
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Enregistrer une nouvelle vente de poulets, œufs ou fientes.
        </p>
      </div>

      <CreateSaleForm organizationId={membership.organizationId} />
    </div>
  )
}