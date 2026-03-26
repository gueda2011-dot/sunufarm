import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Building2, CreditCard, Shield, Users } from "lucide-react"
import { auth } from "@/src/auth"
import prisma from "@/src/lib/prisma"
import { formatDateTime, formatMoneyFCFA } from "@/src/lib/formatters"
import { AdminSubscriptionControl } from "./_components/AdminSubscriptionControl"

export const metadata: Metadata = { title: "Admin Plateforme" }

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: typeof Building2
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-green-50 text-green-700">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  )
}

export default async function AdminPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const adminMembership = await prisma.userOrganization.findFirst({
    where: {
      userId: session.user.id,
      role: "SUPER_ADMIN",
    },
    select: {
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  })

  if (!adminMembership) {
    redirect("/dashboard")
  }

  const [organizations, usersCount, pendingPaymentsCount] = await Promise.all([
    prisma.organization.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        subscription: {
          select: {
            plan: true,
            status: true,
            amountFcfa: true,
            currentPeriodEnd: true,
          },
        },
        _count: {
          select: {
            farms: true,
            users: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.count({
      where: { deletedAt: null },
    }),
    prisma.subscriptionPayment.count({
      where: { status: "PENDING" },
    }),
  ])

  const visibleOrganizations = organizations.filter((org) => org.slug !== "sunufarm-platform")

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-3xl bg-gradient-to-br from-gray-950 via-gray-900 to-green-800 px-6 py-8 text-white shadow-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-green-200">
            Admin plateforme
          </p>
          <h1 className="mt-2 text-3xl font-bold">Pilotage global de SunuFarm</h1>
          <p className="mt-3 max-w-2xl text-sm text-gray-200 sm:text-base">
            Connecte en tant que SUPER_ADMIN. Tu peux surveiller les organisations, les abonnements
            et les demandes de paiement de toute la plateforme.
          </p>
          <div className="mt-5 rounded-2xl bg-white/10 px-4 py-3 text-sm text-gray-100">
            {adminMembership.user.name || "Super admin"} · {adminMembership.user.email}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Organisations actives"
            value={String(visibleOrganizations.length)}
            icon={Building2}
          />
          <StatCard
            label="Utilisateurs actifs"
            value={String(usersCount)}
            icon={Users}
          />
          <StatCard
            label="Paiements en attente"
            value={String(pendingPaymentsCount)}
            icon={CreditCard}
          />
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-green-50 text-green-700">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Organisations</h2>
                <p className="text-sm text-gray-500">
                  Vue globale des clients, de leurs équipes et de leurs abonnements.
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Organisation</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Plan</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Changer plan</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Montant</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Fermes</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Membres</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Fin periode</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Creation</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrganizations.map((org) => (
                  <tr key={org.id} className="border-t border-gray-100">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{org.name}</div>
                      <div className="text-xs text-gray-500">{org.slug}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">
                        {org.subscription?.plan ?? "BASIC"}
                      </span>
                      <div className="mt-1 text-xs text-gray-500">
                        {org.subscription?.status ?? "ACTIVE"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <AdminSubscriptionControl
                        organizationId={org.id}
                        currentPlan={org.subscription?.plan ?? "BASIC"}
                      />
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      {formatMoneyFCFA(org.subscription?.amountFcfa ?? 5_000)}
                    </td>
                    <td className="px-6 py-4 text-gray-700">{org._count.farms}</td>
                    <td className="px-6 py-4 text-gray-700">{org._count.users}</td>
                    <td className="px-6 py-4 text-gray-700">
                      {formatDateTime(org.subscription?.currentPeriodEnd)}
                    </td>
                    <td className="px-6 py-4 text-gray-700">{formatDateTime(org.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
