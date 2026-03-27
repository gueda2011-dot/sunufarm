import Link from "next/link"
import { validatePasswordResetToken } from "@/src/lib/auth-tokens"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card"
import { ResetPasswordForm } from "./_components/ResetPasswordForm"

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Lien invalide</CardTitle>
          <CardDescription>
            Le lien de reinitialisation est incomplet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/forgot-password" className="font-medium text-green-700 hover:text-green-800">
            Demander un nouveau lien
          </Link>
        </CardContent>
      </Card>
    )
  }

  const validation = await validatePasswordResetToken(token)

  if (!validation.valid || !validation.email) {
    const message = validation.reason === "expired"
      ? "Ce lien de reinitialisation a expire."
      : "Ce lien de reinitialisation est invalide."

    return (
      <Card>
        <CardHeader>
          <CardTitle>Lien indisponible</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/forgot-password" className="font-medium text-green-700 hover:text-green-800">
            Demander un nouveau lien
          </Link>
        </CardContent>
      </Card>
    )
  }

  return <ResetPasswordForm token={token} email={validation.email} />
}
