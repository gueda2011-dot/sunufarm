import { Suspense } from "react"
import { redirect } from "next/navigation"
import { auth } from "@/src/auth"
import prisma from "@/src/lib/prisma"
import { Card, CardContent } from "@/src/components/ui/card"
import { LoginForm } from "./_components/LoginForm"

export default async function LoginPage() {
  const session = await auth()

  if (session?.user?.id) {
    const memberships = await prisma.userOrganization.findMany({
      where: { userId: session.user.id },
      select: { role: true },
      take: 1,
    })

    if (memberships[0]?.role === "SUPER_ADMIN") {
      redirect("/admin")
    }

    if (memberships.length > 0) {
      redirect("/dashboard")
    }

    redirect("/onboarding")
  }

  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="flex h-48 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
          </CardContent>
        </Card>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
