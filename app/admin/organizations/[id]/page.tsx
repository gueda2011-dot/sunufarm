import Link from "next/link"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import {
  getAdminOrganizations,
  getOrganizationUsersForAdmin,
  startImpersonation,
} from "@/src/actions/admin"

export const metadata: Metadata = {
  title: "Detail organisation",
}

type PageProps = {
  params: Promise<{ id: string }>
  searchParams?: Promise<{
    error?: string
  }>
}

export default async function AdminOrganizationDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params
  const resolvedSearchParams = searchParams ? await searchParams : undefined

  const [organizationsResult, usersResult] = await Promise.all([
    getAdminOrganizations(),
    getOrganizationUsersForAdmin({ organizationId: id }),
  ])

  if (!organizationsResult.success) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        {organizationsResult.error}
      </div>
    )
  }

  const organization = organizationsResult.data.find((item) => item.id === id)

  if (!organization) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          Organisation introuvable.
        </div>
        <Link
          href="/admin/organizations"
          className="inline-flex items-center rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          Retour aux organisations
        </Link>
      </div>
    )
  }

  async function startImpersonationAction(formData: FormData) {
    "use server"

    const targetOrganizationId = String(formData.get("targetOrganizationId") ?? "")
    const targetUserId = String(formData.get("targetUserId") ?? "")
    const reason = String(formData.get("reason") ?? "")

    const result = await startImpersonation({
      targetOrganizationId,
      targetUserId,
      reason,
    })

    if (!result.success) {
      redirect(
        `/admin/organizations/${targetOrganizationId}?error=${encodeURIComponent(result.error)}`,
      )
    }

    redirect("/dashboard")
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/organizations"
            className="text-sm font-medium text-slate-500 transition hover:text-slate-700"
          >
            ← Retour aux organisations
          </Link>
          <h2 className="mt-3 text-2xl font-bold text-slate-900">
            {organization.name}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Slug : <span className="font-medium text-slate-800">{organization.slug}</span>
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
              Membres
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {organization.usersCount}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
              Fermes
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {organization.farmsCount}
            </p>
          </div>
        </div>
      </div>

      {resolvedSearchParams?.error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {resolvedSearchParams.error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="text-lg font-semibold text-slate-900">
              Membres de l&apos;organisation
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Lecture admin uniquement. Aucune gestion de comptes tenant n&apos;est
              activee ici.
            </p>
          </div>

          {usersResult.success ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Nom</th>
                    <th className="px-5 py-3 font-medium">Email</th>
                    <th className="px-5 py-3 font-medium">Role</th>
                    <th className="px-5 py-3 font-medium">Rattache le</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usersResult.data.map((member) => (
                    <tr key={member.membershipId}>
                      <td className="px-5 py-4 font-medium text-slate-900">
                        {member.name ?? "Utilisateur sans nom"}
                      </td>
                      <td className="px-5 py-4 text-slate-600">{member.email}</td>
                      <td className="px-5 py-4 text-slate-600">{member.role}</td>
                      <td className="px-5 py-4 text-slate-600">
                        {member.createdAt.toLocaleDateString("fr-FR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5 text-sm text-red-700">{usersResult.error}</div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">
            Lancer une impersonation
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Cette action ouvre le tenant dans le contexte du membre choisi. Le
            motif est obligatoire et journalise dans l&apos;audit.
          </p>

          <form action={startImpersonationAction} className="mt-5 space-y-4">
            <input type="hidden" name="targetOrganizationId" value={organization.id} />

            <div className="space-y-2">
              <label
                htmlFor="targetUserId"
                className="text-sm font-medium text-slate-700"
              >
                Membre cible
              </label>
              <select
                id="targetUserId"
                name="targetUserId"
                required
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              >
                <option value="">Choisir un membre</option>
                {usersResult.success
                  ? usersResult.data.map((member) => (
                      <option key={member.membershipId} value={member.userId}>
                        {(member.name ?? "Utilisateur sans nom") + " - " + member.email}
                      </option>
                    ))
                  : null}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="reason" className="text-sm font-medium text-slate-700">
                Motif d&apos;impersonation
              </label>
              <textarea
                id="reason"
                name="reason"
                required
                minLength={10}
                maxLength={500}
                rows={4}
                placeholder="Expliquer brievement pourquoi cette impersonation est necessaire."
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <button
              type="submit"
              className="inline-flex items-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Demarrer l&apos;impersonation
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
