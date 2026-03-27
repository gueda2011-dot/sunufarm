import { redirect } from "next/navigation"
import { auth } from "@/src/auth"
import prisma from "@/src/lib/prisma"
import { RegisterForm } from "./_components/RegisterForm"

export default async function RegisterPage() {
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

    redirect("/start")
  }

  return <RegisterForm />
}
