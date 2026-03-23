import Link from "next/link"
import type { Metadata } from "next"
import { getAdminOrganizations } from "@/src/actions/admin"

export const metadata: Metadata = {
  title: "Organisations",
}

export default async function AdminOrganizationsPage() {
  const organizationsResult = await getAdminOrganizations()

  if (!organizationsResult.success) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        {organizationsResult.error}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Organisations</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Consulte les tenants existants et ouvre leur detail avant toute
          action d&apos;impersonation.
        </p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Organisation</th>
                <th className="px-5 py-3 font-medium">Slug</th>
                <th className="px-5 py-3 font-medium">Membres</th>
                <th className="px-5 py-3 font-medium">Fermes</th>
                <th className="px-5 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {organizationsResult.data.map((organization) => (
                <tr key={organization.id}>
                  <td className="px-5 py-4 font-medium text-slate-900">
                    {organization.name}
                  </td>
                  <td className="px-5 py-4 text-slate-600">{organization.slug}</td>
                  <td className="px-5 py-4 text-slate-600">
                    {organization.usersCount}
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {organization.farmsCount}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/admin/organizations/${organization.id}`}
                      className="inline-flex items-center rounded-full border border-slate-200 px-4 py-2 font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      Voir le detail
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
