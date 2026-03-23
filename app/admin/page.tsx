import Link from "next/link"
import type { Metadata } from "next"
import { getAdminOrganizations } from "@/src/actions/admin"

export const metadata: Metadata = {
  title: "Admin Plateforme",
}

export default async function AdminHomePage() {
  const organizationsResult = await getAdminOrganizations()

  const organizations = organizationsResult.success
    ? organizationsResult.data
    : []

  const totalUsers = organizations.reduce(
    (sum, organization) => sum + organization.usersCount,
    0,
  )
  const totalFarms = organizations.reduce(
    (sum, organization) => sum + organization.farmsCount,
    0,
  )

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-slate-900">
          Vue d&apos;ensemble plateforme
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Cette zone reste limitee a la lecture plateforme et au lancement
          d&apos;une impersonation controlee. La gestion autonome des comptes
          tenant restera separee dans les reglages d&apos;organisation.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Organisations actives</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">
              {organizations.length}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Membres rattaches</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">
              {totalUsers}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Fermes suivies</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">
              {totalFarms}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <Link
            href="/admin/organizations"
            className="inline-flex items-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Voir les organisations
          </Link>
        </div>
      </section>
    </div>
  )
}
