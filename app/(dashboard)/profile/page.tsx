import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Building2, Mail, Settings, Shield, Users } from "lucide-react"
import { auth } from "@/src/auth"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { APP_MODULE_LABELS, getEffectiveModulePermissions } from "@/src/lib/permissions"

export const metadata: Metadata = { title: "Mon profil" }

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")
  ensureModuleAccess(activeMembership, "DASHBOARD")

  const subscription = await getOrganizationSubscription(activeMembership.organizationId)
  const effectiveModules = getEffectiveModulePermissions(
    activeMembership.role,
    activeMembership.modulePermissions,
  )

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-green-800 px-6 py-8 text-white shadow-lg">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-green-200">
          Mon profil
        </p>
        <h1 className="mt-2 text-3xl font-bold">
          Votre espace utilisateur
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-100 sm:text-base">
          Retrouvez ici votre identite, votre organisation active et le niveau d&apos;acces
          qui vous est actuellement attribue dans SunuFarm.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Identite</CardTitle>
            <CardDescription>
              Informations du compte actuellement connecte.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-gray-100 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Nom</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {session.user.name?.trim() || "Utilisateur SunuFarm"}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-100 px-4 py-3">
              <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
                <Mail className="h-3.5 w-3.5" />
                Email
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {session.user.email || "Email indisponible"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Organisation active</CardTitle>
            <CardDescription>
              Contexte dans lequel vous travaillez actuellement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-gray-100 px-4 py-3">
              <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
                <Building2 className="h-3.5 w-3.5" />
                Organisation
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {activeMembership.organization.name}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-100 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Role</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {activeMembership.role}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-100 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Plan effectif</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {subscription.label}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Modules accessibles</CardTitle>
          <CardDescription>
            Lecture rapide des espaces auxquels votre role vous donne acces.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {effectiveModules.map((module) => (
            <div
              key={module}
              className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700"
            >
              {APP_MODULE_LABELS[module]}
            </div>
          ))}
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Raccourcis utiles</CardTitle>
            <CardDescription>
              Les pages les plus proches de votre profil et de vos acces.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link
              href="/settings"
              className="flex items-center gap-3 rounded-2xl border border-gray-100 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Settings className="h-4 w-4 text-gray-500" />
              Gerer l&apos;abonnement et les limites du plan
            </Link>
            <Link
              href="/team"
              className="flex items-center gap-3 rounded-2xl border border-gray-100 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Users className="h-4 w-4 text-gray-500" />
              Voir l&apos;equipe et les acces de l&apos;organisation
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lecture de vos droits</CardTitle>
            <CardDescription>
              Vos autorisations dependent du role attribue dans l&apos;organisation active.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4">
            <Shield className="mt-0.5 h-5 w-5 text-blue-700" />
            <p className="text-sm text-blue-900">
              Si un module vous manque ou si vous devez changer de niveau d&apos;acces,
              le plus simple est de contacter le proprietaire de l&apos;organisation.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
