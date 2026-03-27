/**
 * SunuFarm — Layout protégé (dashboard)
 *
 * Responsabilités :
 *   1. Auth guard : auth() → redirect /login si session null
 *   2. Org guard  : query memberships → redirect /start si aucune organisation
 *   3. Org active : première organisation alphab. (MVP — switcher en V2)
 *   4. Rendu      : Sidebar (desktop) + Header + BottomNav (mobile) + {children}
 *
 * Ce layout est un Server Component. Les sous-composants Sidebar, Header et
 * BottomNav sont des Client Components qui reçoivent les données en props.
 *
 * Structure responsive :
 *   Mobile  → Header (top) + {children} + BottomNav (bottom)
 *   Desktop → Sidebar (left, fixed 256px) + Header + {children}
 */

import { redirect }   from "next/navigation"
import { auth }        from "@/src/auth"
import { Sidebar }     from "@/src/components/layout/Sidebar"
import { Header }      from "@/src/components/layout/Header"
import { BottomNav }   from "@/src/components/layout/BottomNav"
import { ConnectionBanner } from "@/src/components/pwa/ConnectionBanner"
import { InstallPrompt } from "@/src/components/pwa/InstallPrompt"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { ImpersonationBanner } from "./_components/ImpersonationBanner"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // -------------------------------------------------------------------------
  // 1. Vérifier la session
  // -------------------------------------------------------------------------

  const session = await auth()
  if (!session?.user?.id) {
    redirect("/login")
  }

  // -------------------------------------------------------------------------
  // 2. Charger les organisations de l'utilisateur
  // -------------------------------------------------------------------------

  const { memberships, activeMembership } = await getCurrentOrganizationContext(
    session.user.id,
  )

  if (memberships.length === 0) {
    // L'utilisateur existe mais n'appartient à aucune organisation
    redirect("/start")
  }

  const superAdminMembership = memberships.find((membership) => (
    membership.role === "SUPER_ADMIN"
  ))

  if (superAdminMembership) {
    redirect("/admin")
  }

  // -------------------------------------------------------------------------
  // 3. Organisation active (MVP : première alphabétiquement)
  // -------------------------------------------------------------------------

  if (!activeMembership) {
    redirect("/start")
  }

  const orgName          = activeMembership.organization.name
  const subscription     = await getOrganizationSubscription(
    activeMembership.organizationId,
  )

  // -------------------------------------------------------------------------
  // 4. Données utilisateur pour le Header
  // -------------------------------------------------------------------------

  const userName  = session.user.name  ?? ""
  const userEmail = session.user.email ?? ""

  // -------------------------------------------------------------------------
  // 5. Rendu du layout
  // -------------------------------------------------------------------------

  return (
    <div className="flex h-full min-h-screen bg-gray-50">
      {/* Sidebar — uniquement visible en desktop (lg+) */}
      <Sidebar
        orgName={orgName}
        plan={subscription.plan}
        role={activeMembership.role}
        modulePermissions={activeMembership.modulePermissions}
      />

      {/* Zone principale */}
      <div className="flex flex-1 flex-col lg:pl-64">
        {session.impersonation?.active && (
          <ImpersonationBanner
            adminName={session.impersonation.adminName}
            adminEmail={session.impersonation.adminEmail}
            targetName={session.impersonation.targetUserName}
            targetEmail={session.impersonation.targetUserEmail}
          />
        )}

        {/* Header */}
        <Header
          orgName={orgName}
          plan={subscription.plan}
          memberships={memberships}
          activeOrganizationId={activeMembership.organizationId}
          userName={userName}
          userEmail={userEmail}
          trialDaysRemaining={subscription.trialDaysRemaining}
          aiCreditsRemaining={subscription.aiCreditsRemaining}
        />

        <div className="px-4 pt-4 sm:px-6 lg:px-8">
          <div className="space-y-3">
            <ConnectionBanner />
            <InstallPrompt />
          </div>
        </div>

        {/*
          Contenu de la page
          pb-20 : espace pour la BottomNav mobile (h-16 + marge)
          lg:pb-6 : pas de BottomNav en desktop
        */}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 pb-20 lg:pb-8">
          {children}
        </main>
      </div>

      {/* BottomNav — uniquement visible sur mobile (< lg) */}
      <BottomNav
        plan={subscription.plan}
        role={activeMembership.role}
        modulePermissions={activeMembership.modulePermissions}
      />
    </div>
  )
}
