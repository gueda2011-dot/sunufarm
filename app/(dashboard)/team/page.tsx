import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Shield, Users, Crown } from "lucide-react"
import { auth } from "@/src/auth"
import prisma from "@/src/lib/prisma"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card"
import { formatDateTime } from "@/src/lib/formatters"
import { hasPlanFeature } from "@/src/lib/subscriptions"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { UserRole } from "@/src/generated/prisma/client"

export const metadata: Metadata = { title: "Equipe" }

const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super admin",
  OWNER: "Proprietaire",
  MANAGER: "Manager",
  TECHNICIAN: "Technicien",
  DATA_ENTRY: "Saisie",
  ACCOUNTANT: "Comptable",
  VET: "Veterinaire",
  VIEWER: "Lecture seule",
}

const ROLE_BADGES: Record<UserRole, string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-800",
  OWNER: "bg-amber-100 text-amber-800",
  MANAGER: "bg-blue-100 text-blue-800",
  TECHNICIAN: "bg-green-100 text-green-800",
  DATA_ENTRY: "bg-slate-100 text-slate-700",
  ACCOUNTANT: "bg-emerald-100 text-emerald-800",
  VET: "bg-pink-100 text-pink-800",
  VIEWER: "bg-gray-100 text-gray-700",
}

export default async function TeamPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")

  if (activeMembership.role === UserRole.SUPER_ADMIN) {
    redirect("/admin")
  }

  const [subscription, members] = await Promise.all([
    getOrganizationSubscription(activeMembership.organizationId),
    prisma.userOrganization.findMany({
      where: {
        organizationId: activeMembership.organizationId,
        user: { deletedAt: null },
      },
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
      orderBy: [
        { role: "asc" },
        { createdAt: "asc" },
      ],
    }),
  ])

  const canManageTeam = hasPlanFeature(subscription.plan, "TEAM_MANAGEMENT")
  const ownerCount = members.filter((member) => member.role === UserRole.OWNER).length

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 px-6 py-8 text-white shadow-lg">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
          Equipe
        </p>
        <h1 className="mt-2 text-3xl font-bold">
          Les membres de {activeMembership.organization.name}
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-200 sm:text-base">
          Cette page centralise les personnes qui ont acces a l&apos;organisation et leur niveau de responsabilite.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white/10 px-4 py-4 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-wide text-slate-300">Membres</p>
            <p className="mt-1 text-2xl font-semibold">{members.length}</p>
          </div>
          <div className="rounded-2xl bg-white/10 px-4 py-4 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-wide text-slate-300">Proprietaires</p>
            <p className="mt-1 text-2xl font-semibold">{ownerCount}</p>
          </div>
          <div className="rounded-2xl bg-white/10 px-4 py-4 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-wide text-slate-300">Gestion d&apos;equipe</p>
            <p className="mt-1 text-lg font-semibold">
              {canManageTeam ? "Disponible" : "Lecture seule"}
            </p>
          </div>
        </div>
      </section>

      <Card className={canManageTeam ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}>
        <CardContent className="flex items-start gap-3 py-5">
          {canManageTeam ? (
            <Users className="mt-0.5 h-5 w-5 text-green-700" />
          ) : (
            <Shield className="mt-0.5 h-5 w-5 text-amber-700" />
          )}
          <div>
            <p className={`text-sm font-semibold ${canManageTeam ? "text-green-900" : "text-amber-900"}`}>
              {canManageTeam
                ? "La gestion d'equipe est prevue sur ce plan"
                : "La page equipe est visible, mais la gestion avancee n'est pas incluse"}
            </p>
            <p className={`mt-1 text-sm ${canManageTeam ? "text-green-800" : "text-amber-800"}`}>
              {canManageTeam
                ? "La structure de roles est deja en place. Les actions d'administration peuvent ensuite etre branchees ici."
                : "Le plan actuel permet de consulter les membres. Les fonctions completes d'invitation et de gestion sont reservees au plan Business."}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Membres actifs</CardTitle>
          <CardDescription>
            Comptes actuellement rattaches a l&apos;organisation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex flex-col gap-3 rounded-2xl border border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {member.user.name?.trim() || "Utilisateur sans nom"}
                  </p>
                  {member.role === UserRole.OWNER && (
                    <Crown className="h-4 w-4 text-amber-500" aria-hidden="true" />
                  )}
                </div>
                <p className="truncate text-sm text-gray-500">{member.user.email}</p>
                <p className="mt-1 text-xs text-gray-400">
                  Ajoute le {formatDateTime(member.createdAt)}
                </p>
              </div>

              <div className="flex items-center">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ROLE_BADGES[member.role]}`}>
                  {ROLE_LABELS[member.role]}
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
