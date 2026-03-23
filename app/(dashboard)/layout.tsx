import { redirect } from "next/navigation"
import { getSession } from "@/src/lib/auth"
import prisma from "@/src/lib/prisma"
import { Sidebar } from "@/src/components/layout/Sidebar"
import { Header } from "@/src/components/layout/Header"
import { BottomNav } from "@/src/components/layout/BottomNav"
import { ImpersonationBanner } from "@/src/components/layout/ImpersonationBanner"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session?.user?.id) {
    redirect("/login")
  }

  const memberships = await prisma.userOrganization.findMany({
    where: session.isImpersonating
      ? {
          userId: session.effectiveUserId,
          organizationId: session.impersonatedOrganizationId ?? undefined,
        }
      : {
          userId: session.effectiveUserId,
        },
    select: {
      organizationId: true,
      role: true,
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      organization: {
        name: "asc",
      },
    },
  })

  if (memberships.length === 0) {
    redirect("/login?error=no-org")
  }

  const activeMembership = memberships[0]
  const orgName = activeMembership.organization.name

  const userName = session.user.name ?? ""
  const userEmail = session.user.email ?? ""

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar orgName={orgName} />

      <div className="flex min-h-screen flex-1 flex-col lg:pl-64">
        {session.isImpersonating ? (
          <ImpersonationBanner
            organizationName={orgName}
            targetUserName={session.impersonatedUserName}
            targetUserEmail={session.impersonatedUserEmail}
          />
        ) : null}

        <Header orgName={orgName} userName={userName} userEmail={userEmail} />

        <main className="flex-1 px-4 py-6 pb-20 sm:px-6 lg:px-8 lg:pb-8">
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  )
}
