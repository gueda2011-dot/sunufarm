import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowRight, Building2, LogOut, Sparkles, Users } from "lucide-react"
import { signOut } from "@/src/auth"
import prisma from "@/src/lib/prisma"
import { auth } from "@/src/auth"
import { Button, buttonVariants } from "@/src/components/ui/button"
import { cn } from "@/src/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card"

export default async function StartPage() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect("/login")
  }

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

  const userName = session.user.name?.trim() || "Votre compte"

  return (
    <div className="space-y-6">
      <Card className="border-green-200 bg-green-50">
        <CardContent className="flex items-start gap-3 py-5">
          <Sparkles className="mt-0.5 h-5 w-5 text-green-700" />
          <div>
            <p className="text-sm font-semibold text-green-900">
              Compte cree, configuration a terminer
            </p>
            <p className="mt-1 text-sm text-green-800">
              {userName} est bien connecte, mais aucune exploitation n&apos;est encore associee a ce compte.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle>Choisir la prochaine etape</CardTitle>
          <CardDescription>
            Avant d&apos;arriver sur le tableau de bord, il faut d&apos;abord rattacher ce compte a une exploitation.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            <div className="flex items-center gap-2 font-medium text-gray-900">
              <Building2 className="h-4 w-4 text-green-700" />
              Option recommandee
            </div>
            <p className="mt-2">
              Creer votre organisation, votre premiere ferme et votre acces proprietaire.
            </p>
          </div>

          <Link
            href="/onboarding"
            className={cn(buttonVariants(), "flex w-full justify-between")}
          >
            Configurer mon exploitation
            <ArrowRight className="h-4 w-4" />
          </Link>

          <div className="rounded-2xl border border-dashed border-gray-200 p-4 text-sm text-gray-600">
            <div className="flex items-center gap-2 font-medium text-gray-900">
              <Users className="h-4 w-4 text-gray-700" />
              Invitation d&apos;equipe
            </div>
            <p className="mt-2">
              Si quelqu&apos;un doit vous ajouter a une organisation existante, il faudra d&apos;abord que le compte soit rattache depuis l&apos;espace administrateur de l&apos;exploitation.
            </p>
          </div>

          <form
            action={async () => {
              "use server"
              await signOut({ redirectTo: "/login" })
            }}
          >
            <Button type="submit" variant="outline" className="w-full justify-between">
              Se deconnecter
              <LogOut className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
