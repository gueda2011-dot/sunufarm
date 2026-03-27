import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Check, Crown, Sprout, Building2 } from "lucide-react"
import { auth } from "@/src/auth"
import prisma from "@/src/lib/prisma"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card"
import {
  PLAN_DEFINITIONS,
  hasPlanFeature,
} from "@/src/lib/subscriptions"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { formatDateTime, formatMoneyFCFA } from "@/src/lib/formatters"
import {
  PaymentMethod,
  SubscriptionPaymentStatus,
  SubscriptionPlan,
  UserRole,
} from "@/src/generated/prisma/client"
import { ManageSubscriptionPayments } from "./_components/ManageSubscriptionPayments"
import { RequestPlanPaymentCard } from "./_components/RequestPlanPaymentCard"

export const metadata: Metadata = { title: "Abonnement" }

const PLAN_ICONS = {
  BASIC: Sprout,
  PRO: Crown,
  BUSINESS: Building2,
} as const satisfies Record<SubscriptionPlan, typeof Sprout>

const FEATURE_LABELS = [
  { key: "REPORTS", label: "Rapports mensuels" },
  { key: "PROFITABILITY", label: "Rentabilite par lot" },
  { key: "AI_BATCH_ANALYSIS", label: "Analyse AI des lots" },
  { key: "ALERTS", label: "Alertes intelligentes" },
  { key: "MULTI_FARM", label: "Plusieurs fermes" },
  { key: "TEAM_MANAGEMENT", label: "Gestion d'equipe" },
  { key: "ADVANCED_EXPORTS", label: "Exports avances" },
] as const

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  ESPECES: "Especes",
  VIREMENT: "Virement",
  CHEQUE: "Cheque",
  MOBILE_MONEY: "Mobile Money",
  AUTRE: "Autre",
}

const STATUS_LABELS: Record<SubscriptionPaymentStatus, string> = {
  PENDING: "En attente de validation",
  CONFIRMED: "Confirme",
  REJECTED: "Refuse",
  CANCELED: "Annule",
}

const STATUS_CLASSES: Record<SubscriptionPaymentStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  CANCELED: "bg-gray-100 text-gray-700",
}

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")
  ensureModuleAccess(activeMembership, "SETTINGS")

  const organizationName = (
    await prisma.organization.findUnique({
      where: { id: activeMembership.organizationId },
      select: { name: true },
    })
  )?.name ?? "votre organisation"

  const { organizationId } = activeMembership
  const isOwner = activeMembership.role === UserRole.OWNER

  const [subscription, farmCount, activeBatchCount, memberCount, myPaymentRequests, pendingPayments] = await Promise.all([
    getOrganizationSubscription(organizationId),
    prisma.farm.count({
      where: { organizationId, deletedAt: null },
    }),
    prisma.batch.count({
      where: { organizationId, deletedAt: null, status: "ACTIVE" },
    }),
    prisma.userOrganization.count({
      where: { organizationId },
    }),
    prisma.subscriptionPayment.findMany({
      where: {
        organizationId,
        requestedById: session.user.id,
      },
      select: {
        id: true,
        requestedPlan: true,
        status: true,
        amountFcfa: true,
        paymentMethod: true,
        paymentReference: true,
        requestedAt: true,
      },
      orderBy: { requestedAt: "desc" },
      take: 5,
    }),
    isOwner
      ? prisma.subscriptionPayment.findMany({
          where: {
            organizationId,
            status: SubscriptionPaymentStatus.PENDING,
          },
          select: {
            id: true,
            requestedPlan: true,
            amountFcfa: true,
            paymentMethod: true,
            paymentReference: true,
            notes: true,
            requestedAt: true,
            requestedBy: {
              select: {
                name: true,
                email: true,
              },
            },
          },
          orderBy: { requestedAt: "desc" },
        })
      : Promise.resolve([]),
  ])

  const myLatestPayment = myPaymentRequests[0] ?? null
  const pendingPaymentsForOwner = pendingPayments.map((payment) => ({
    ...payment,
    paymentMethod: PAYMENT_METHOD_LABELS[payment.paymentMethod],
  }))

  const planEntries = Object.entries(PLAN_DEFINITIONS) as Array<
    [SubscriptionPlan, (typeof PLAN_DEFINITIONS)[SubscriptionPlan]]
  >

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-3xl bg-gradient-to-br from-green-700 via-green-600 to-emerald-500 px-6 py-8 text-white shadow-lg">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-green-100">
          Abonnement
        </p>
        <h1 className="mt-2 text-3xl font-bold">
          Choisir le bon niveau pour faire grandir {organizationName}
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-green-50 sm:text-base">
          SunuFarm ne vend pas juste des fonctions. Chaque plan aide a mieux organiser,
          mieux decider ou mieux piloter l&apos;exploitation selon votre taille.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white/12 px-4 py-4 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-wide text-green-100">Plan actuel</p>
            <p className="mt-1 text-xl font-semibold">
              {subscription.isTrialActive ? "Essai gratuit" : subscription.billingLabel}
            </p>
            <p className="mt-1 text-sm text-green-50">
              {subscription.isTrialActive
                ? `Acces ${subscription.label} temporaire pendant ${subscription.trialDaysRemaining ?? 0} jour(s).`
                : `${formatMoneyFCFA(subscription.amountFcfa)} par mois`}
            </p>
            {!subscription.isTrialActive && (
              <p className="mt-1 text-xs text-green-100">
                {subscription.valueHeadline}
              </p>
            )}
          </div>
          <div className="rounded-2xl bg-white/12 px-4 py-4 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-wide text-green-100">Usage fermes</p>
            <p className="mt-1 text-xl font-semibold">
              {farmCount} / {subscription.maxFarms}
            </p>
            <p className="mt-1 text-sm text-green-50">Nombre de fermes actives</p>
          </div>
          <div className="rounded-2xl bg-white/12 px-4 py-4 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-wide text-green-100">Usage lots</p>
            <p className="mt-1 text-xl font-semibold">
              {activeBatchCount} / {subscription.maxActiveBatches}
            </p>
            <p className="mt-1 text-sm text-green-50">Lots actifs en cours</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Comment fonctionne l&apos;activation</CardTitle>
            <CardDescription>
              Le changement de plan suit un circuit simple, trace et controle.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              "1. L'utilisateur choisit le bon plan selon sa taille et declare son paiement.",
              "2. Une transaction interne est creee pour garder une trace claire.",
              "3. La preuve de paiement est verifiee avant toute activation.",
              "4. Le plan est debloque seulement apres confirmation.",
            ].map((step) => (
              <div key={step} className="rounded-2xl border border-gray-100 px-4 py-3 text-sm text-gray-700">
                {step}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Moyens de paiement acceptes</CardTitle>
            <CardDescription>
              Aujourd&apos;hui nous gardons un controle fort pour proteger les abonnements et les encaissements.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              "Wave / Orange Money / Free Money",
              "Virement bancaire",
              "Paiement en especes si besoin",
            ].map((method) => (
              <div key={method} className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
                {method}
              </div>
            ))}
            <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-600">
              L&apos;activation automatique mobile money est en preparation sur une base securisee.
            </div>
          </CardContent>
        </Card>
      </section>

      {myLatestPayment && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-5">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold text-blue-900">
                Derniere demande de paiement
              </p>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASSES[myLatestPayment.status]}`}>
                {STATUS_LABELS[myLatestPayment.status]}
              </span>
            </div>
            <p className="mt-2 text-sm text-blue-800">
              {myLatestPayment.requestedPlan} a {formatMoneyFCFA(myLatestPayment.amountFcfa)} via{" "}
              {PAYMENT_METHOD_LABELS[myLatestPayment.paymentMethod]} le {formatDateTime(myLatestPayment.requestedAt)}.
            </p>
            {myLatestPayment.paymentReference && (
              <p className="mt-1 text-xs text-blue-700">
                Reference: {myLatestPayment.paymentReference}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {isOwner && pendingPaymentsForOwner.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle>Paiements en attente de validation</CardTitle>
            <CardDescription>
              En tant que proprietaire, c&apos;est ici que tu actives vraiment les plans apres verification.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ManageSubscriptionPayments
              organizationId={organizationId}
              payments={pendingPaymentsForOwner}
            />
          </CardContent>
        </Card>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        {planEntries.map(([planKey, plan]) => {
          const Icon = PLAN_ICONS[planKey]
          const isCurrent = subscription.plan === planKey

          return (
            <Card
              key={planKey}
              className={
                plan.recommended
                  ? "border-green-500 shadow-lg shadow-green-100"
                  : isCurrent
                    ? "border-gray-900"
                    : ""
              }
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-green-50 text-green-700">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle>{plan.label}</CardTitle>
                      <CardDescription>{plan.promise}</CardDescription>
                    </div>
                  </div>
                  {isCurrent && (
                    <span className="rounded-full bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white">
                      Actuel
                    </span>
                  )}
                  {!isCurrent && plan.recommended && (
                    <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">
                      Recommande
                    </span>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-5">
                <div>
                  <p className="text-3xl font-bold text-gray-900">
                    {formatMoneyFCFA(plan.monthlyPriceFcfa)}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">par mois</p>
                  <p className="mt-2 text-sm font-medium text-gray-700">
                    {plan.valueHeadline}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {plan.audience}
                  </p>
                </div>

                <div className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-700">
                  <p className="font-medium text-gray-900">Ce plan aide surtout a :</p>
                  <ul className="mt-3 space-y-2">
                    {plan.highlights.map((highlight) => (
                      <li key={highlight} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                        <span>{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2">
                    <span className="text-gray-500">Fermes</span>
                    <span className="font-medium text-gray-900">{plan.maxFarms}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2">
                    <span className="text-gray-500">Lots actifs</span>
                    <span className="font-medium text-gray-900">{plan.maxActiveBatches}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2">
                    <span className="text-gray-500">Membres d&apos;equipe</span>
                    <span className="font-medium text-gray-900">
                      {hasPlanFeature(planKey, "TEAM_MANAGEMENT") ? "Inclus" : "Non inclus"}
                    </span>
                  </div>
                </div>

                <RequestPlanPaymentCard
                  organizationId={organizationId}
                  requestedPlan={planKey}
                  isCurrent={isCurrent}
                  recommended={plan.recommended}
                />
              </CardContent>
            </Card>
          )
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader>
            <CardTitle>Ce qui change d&apos;un plan a l&apos;autre</CardTitle>
            <CardDescription>
              La difference ne porte pas seulement sur des fonctions, mais sur le niveau de pilotage.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {FEATURE_LABELS.map((feature) => (
              <div
                key={feature.key}
                className="grid grid-cols-[1.3fr_0.6fr_0.6fr_0.8fr] items-center gap-3 rounded-2xl border border-gray-100 px-4 py-3 text-sm"
              >
                <span className="font-medium text-gray-900">{feature.label}</span>
                <span className="text-gray-600">
                  {hasPlanFeature("BASIC", feature.key) ? "Oui" : "Non"}
                </span>
                <span className="text-gray-600">
                  {hasPlanFeature("PRO", feature.key) ? "Oui" : "Non"}
                </span>
                <span className="text-gray-600">
                  {hasPlanFeature("BUSINESS", feature.key) ? "Oui" : "Non"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lecture rapide</CardTitle>
            <CardDescription>Le bon plan depend surtout de votre niveau d&apos;organisation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="font-semibold text-gray-900">Basic</p>
              <p className="mt-1 text-gray-600">
                Pour un eleveur qui veut enfin suivre correctement ses lots et ses depenses.
              </p>
            </div>
            <div className="rounded-2xl bg-green-50 p-4">
              <p className="font-semibold text-green-900">Pro</p>
              <p className="mt-1 text-green-800">
                Pour savoir si un lot est rentable, obtenir des analyses AI utiles et mieux corriger les pertes.
              </p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-4">
              <p className="font-semibold text-amber-900">Business</p>
              <p className="mt-1 text-amber-800">
                Pour piloter une structure multi-sites avec equipe, exports avances et analyses plus profondes.
              </p>
            </div>
            <div className="rounded-2xl border border-dashed border-gray-200 p-4 text-gray-600">
              Organisation actuelle : {memberCount} membre(s), {farmCount} ferme(s), {activeBatchCount} lot(s) actif(s).
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
