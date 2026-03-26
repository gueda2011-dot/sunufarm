import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import {
  ArrowLeft,
  Banknote,
  Building2,
  CreditCard,
  Shield,
  Tractor,
  Users,
} from "lucide-react"
import { auth } from "@/src/auth"
import { AdminSubscriptionControl } from "@/app/admin/_components/AdminSubscriptionControl"
import prisma from "@/src/lib/prisma"
import {
  formatDate,
  formatDateTime,
  formatMoneyFCFA,
  formatNumber,
} from "@/src/lib/formatters"

export const metadata: Metadata = { title: "Admin Organisation" }

function InfoCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string
  value: string
  subtitle: string
  icon: typeof Building2
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-green-50 text-green-700">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
    </div>
  )
}

export default async function AdminOrganizationDetailPage(
  props: PageProps<"/admin/organizations/[id]">,
) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const adminMembership = await prisma.userOrganization.findFirst({
    where: {
      userId: session.user.id,
      role: "SUPER_ADMIN",
    },
    select: { id: true },
  })

  if (!adminMembership) redirect("/dashboard")

  const { id } = await props.params

  const organization = await prisma.organization.findFirst({
    where: {
      id,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      phone: true,
      address: true,
      createdAt: true,
      updatedAt: true,
      subscription: {
        select: {
          plan: true,
          status: true,
          amountFcfa: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          updatedAt: true,
        },
      },
      users: {
        select: {
          id: true,
          role: true,
          createdAt: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      farms: {
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          code: true,
          totalCapacity: true,
          address: true,
          _count: {
            select: { buildings: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      subscriptionPayments: {
        select: {
          id: true,
          requestedPlan: true,
          status: true,
          amountFcfa: true,
          paymentMethod: true,
          paymentReference: true,
          requestedAt: true,
          confirmedAt: true,
          requestedBy: {
            select: {
              name: true,
              email: true,
            },
          },
          confirmedBy: {
            select: {
              name: true,
              email: true,
            },
          },
        },
        orderBy: { requestedAt: "desc" },
        take: 12,
      },
      _count: {
        select: {
          users: true,
          farms: true,
          sales: true,
          purchases: true,
          expenses: true,
        },
      },
    },
  })

  if (!organization) notFound()

  const [
    activeBatchesCount,
    closedBatchesCount,
    buildingsCount,
    salesAggregate,
    expensesAggregate,
    recentBatches,
    recentSales,
  ] = await Promise.all([
    prisma.batch.count({
      where: {
        organizationId: organization.id,
        deletedAt: null,
        status: "ACTIVE",
      },
    }),
    prisma.batch.count({
      where: {
        organizationId: organization.id,
        deletedAt: null,
        status: {
          in: ["CLOSED", "SOLD", "SLAUGHTERED"],
        },
      },
    }),
    prisma.building.count({
      where: {
        organizationId: organization.id,
        deletedAt: null,
      },
    }),
    prisma.sale.aggregate({
      where: { organizationId: organization.id },
      _sum: {
        totalFcfa: true,
        paidFcfa: true,
      },
    }),
    prisma.expense.aggregate({
      where: { organizationId: organization.id },
      _sum: {
        amountFcfa: true,
      },
    }),
    prisma.batch.findMany({
      where: {
        organizationId: organization.id,
        deletedAt: null,
      },
      select: {
        id: true,
        number: true,
        type: true,
        status: true,
        entryDate: true,
        entryCount: true,
        building: {
          select: {
            name: true,
            farm: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.sale.findMany({
      where: { organizationId: organization.id },
      select: {
        id: true,
        saleDate: true,
        productType: true,
        totalFcfa: true,
        paidFcfa: true,
        customer: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { saleDate: "desc" },
      take: 6,
    }),
  ])

  const totalCapacity = organization.farms.reduce(
    (sum, farm) => sum + (farm.totalCapacity ?? 0),
    0,
  )

  const confirmedPaymentsCount = organization.subscriptionPayments.filter(
    (payment) => payment.status === "CONFIRMED",
  ).length

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl bg-gradient-to-br from-gray-950 via-gray-900 to-green-800 px-6 py-7 text-white shadow-xl sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/admin"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-medium text-white transition hover:bg-white/15"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour admin
            </Link>
            <h1 className="mt-4 text-3xl font-bold">{organization.name}</h1>
            <p className="mt-2 text-sm text-green-100">
              {organization.slug} · creee le {formatDateTime(organization.createdAt)}
            </p>
          </div>

          <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-green-50">
            <p className="font-semibold">Derniere mise a jour abonnement</p>
            <p>{formatDateTime(organization.subscription?.updatedAt ?? organization.updatedAt)}</p>
          </div>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <InfoCard
            title="Plan actif"
            value={organization.subscription?.plan ?? "BASIC"}
            subtitle={organization.subscription?.status ?? "ACTIVE"}
            icon={CreditCard}
          />
          <InfoCard
            title="Equipe"
            value={String(organization._count.users)}
            subtitle="membres relies a l'organisation"
            icon={Users}
          />
          <InfoCard
            title="Infrastructure"
            value={`${organization._count.farms} ferme(s)`}
            subtitle={`${buildingsCount} batiment(s) · ${formatNumber(totalCapacity)} sujets`}
            icon={Tractor}
          />
          <InfoCard
            title="Activite lots"
            value={String(activeBatchesCount)}
            subtitle={`${closedBatchesCount} lots clotures`}
            icon={Building2}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-green-50 text-green-700">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Resume organisation</h2>
                  <p className="text-sm text-gray-500">
                    Contact, abonnement et repere rapide pour les interventions admin.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 px-6 py-5 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-gray-50 px-4 py-3">
                  <p className="text-gray-500">Telephone</p>
                  <p className="mt-1 font-medium text-gray-900">{organization.phone ?? "—"}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 px-4 py-3">
                  <p className="text-gray-500">Adresse</p>
                  <p className="mt-1 font-medium text-gray-900">{organization.address ?? "—"}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 px-4 py-3">
                  <p className="text-gray-500">Montant abonnement</p>
                  <p className="mt-1 font-medium text-gray-900">
                    {formatMoneyFCFA(organization.subscription?.amountFcfa ?? 5_000)}
                  </p>
                </div>
                <div className="rounded-2xl bg-gray-50 px-4 py-3">
                  <p className="text-gray-500">Periode active</p>
                  <p className="mt-1 font-medium text-gray-900">
                    {formatDate(organization.subscription?.currentPeriodStart)} au{" "}
                    {formatDate(organization.subscription?.currentPeriodEnd)}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 p-4">
                <p className="text-sm font-semibold text-gray-900">
                  Changer le plan de l&apos;organisation
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Mise a jour immediate du plan pour debloquer ou restreindre l&apos;acces.
                </p>
                <div className="mt-4">
                  <AdminSubscriptionControl
                    organizationId={organization.id}
                    currentPlan={organization.subscription?.plan ?? "BASIC"}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-green-50 text-green-700">
                  <Banknote className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Vue business</h2>
                  <p className="text-sm text-gray-500">
                    Indices rapides sur l&apos;activite commerciale enregistree.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 px-6 py-5">
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="text-sm text-gray-500">Ventes enregistrees</p>
                <p className="mt-1 text-xl font-semibold text-gray-900">
                  {formatMoneyFCFA(salesAggregate._sum.totalFcfa ?? 0)}
                </p>
                <p className="text-xs text-gray-500">
                  {organization._count.sales} vente(s) · {formatMoneyFCFA(salesAggregate._sum.paidFcfa ?? 0)} encaisse(s)
                </p>
              </div>
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="text-sm text-gray-500">Depenses declarees</p>
                <p className="mt-1 text-xl font-semibold text-gray-900">
                  {formatMoneyFCFA(expensesAggregate._sum.amountFcfa ?? 0)}
                </p>
                <p className="text-xs text-gray-500">
                  {organization._count.expenses} depense(s) · {organization._count.purchases} achat(s)
                </p>
              </div>
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="text-sm text-gray-500">Paiements abonnement</p>
                <p className="mt-1 text-xl font-semibold text-gray-900">
                  {confirmedPaymentsCount} confirme(s)
                </p>
                <p className="text-xs text-gray-500">
                  {organization.subscriptionPayments.length} demande(s) recentes examinees ici
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-5">
              <h2 className="text-lg font-semibold text-gray-900">Membres</h2>
            </div>
            <div className="space-y-3 px-6 py-5">
              {organization.users.length === 0 ? (
                <p className="text-sm text-gray-400">Aucun membre actif sur cette organisation.</p>
              ) : (
                organization.users.map((member) => (
                  <div key={member.id} className="rounded-2xl border border-gray-100 px-4 py-3">
                    <p className="font-medium text-gray-900">
                      {member.user.name || member.user.email}
                    </p>
                    <p className="text-sm text-gray-500">{member.user.email}</p>
                    <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                      <span className="rounded-full bg-green-100 px-2 py-1 font-semibold text-green-800">
                        {member.role}
                      </span>
                      <span className="text-gray-400">Ajoute le {formatDate(member.createdAt)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-5">
              <h2 className="text-lg font-semibold text-gray-900">Fermes</h2>
            </div>
            <div className="space-y-3 px-6 py-5">
              {organization.farms.length === 0 ? (
                <p className="text-sm text-gray-400">Aucune ferme active.</p>
              ) : (
                organization.farms.map((farm) => (
                  <div key={farm.id} className="rounded-2xl border border-gray-100 px-4 py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-gray-900">{farm.name}</p>
                        <p className="text-sm text-gray-500">{farm.code ?? "Sans code"}</p>
                        {farm.address && (
                          <p className="mt-1 text-xs text-gray-400">{farm.address}</p>
                        )}
                      </div>
                      <div className="text-right text-sm text-gray-600">
                        <p>{farm._count.buildings} batiment(s)</p>
                        <p>{formatNumber(farm.totalCapacity)} sujets</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-5">
              <h2 className="text-lg font-semibold text-gray-900">Derniers lots</h2>
            </div>
            <div className="space-y-3 px-6 py-5">
              {recentBatches.length === 0 ? (
                <p className="text-sm text-gray-400">Aucun lot enregistre pour le moment.</p>
              ) : (
                recentBatches.map((batch) => (
                  <div key={batch.id} className="rounded-2xl border border-gray-100 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-gray-900">{batch.number}</p>
                        <p className="text-sm text-gray-500">
                          {batch.type} · {batch.building.farm.name} / {batch.building.name}
                        </p>
                      </div>
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                        {batch.status}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-gray-400">
                      Entree le {formatDate(batch.entryDate)} · {formatNumber(batch.entryCount)} sujets
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-6 py-5">
                <h2 className="text-lg font-semibold text-gray-900">Dernieres ventes</h2>
              </div>
              <div className="space-y-3 px-6 py-5">
                {recentSales.length === 0 ? (
                  <p className="text-sm text-gray-400">Aucune vente enregistree.</p>
                ) : (
                  recentSales.map((sale) => (
                    <div key={sale.id} className="rounded-2xl border border-gray-100 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-gray-900">
                          {sale.customer?.name ?? "Client direct"}
                        </p>
                        <p className="text-sm font-semibold text-gray-900">
                          {formatMoneyFCFA(sale.totalFcfa)}
                        </p>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        {sale.productType} · {formatDate(sale.saleDate)}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        Encaisse: {formatMoneyFCFA(sale.paidFcfa)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-6 py-5">
                <h2 className="text-lg font-semibold text-gray-900">
                  Paiements d&apos;abonnement
                </h2>
              </div>
              <div className="space-y-3 px-6 py-5">
                {organization.subscriptionPayments.length === 0 ? (
                  <p className="text-sm text-gray-400">Aucun paiement d&apos;abonnement recent.</p>
                ) : (
                  organization.subscriptionPayments.map((payment) => (
                    <div key={payment.id} className="rounded-2xl border border-gray-100 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-gray-900">
                          {payment.requestedPlan} · {formatMoneyFCFA(payment.amountFcfa)}
                        </p>
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                          {payment.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        {payment.requestedBy.name || payment.requestedBy.email} via{" "}
                        {payment.paymentMethod}
                      </p>
                      {payment.paymentReference && (
                        <p className="mt-1 text-xs text-gray-400">
                          Reference: {payment.paymentReference}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-gray-400">
                        Demande le {formatDateTime(payment.requestedAt)}
                      </p>
                      {payment.confirmedAt && (
                        <p className="mt-1 text-xs text-gray-400">
                          Traite le {formatDateTime(payment.confirmedAt)} par{" "}
                          {payment.confirmedBy?.name || payment.confirmedBy?.email || "un admin"}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
