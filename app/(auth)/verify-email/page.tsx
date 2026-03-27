import Link from "next/link"
import { consumeEmailVerificationToken } from "@/src/lib/auth-tokens"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card"
import { VerifyEmailNotice } from "./_components/VerifyEmailNotice"

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; sent?: string; email?: string }>
}) {
  const { token, sent, email } = await searchParams

  if (token) {
    const result = await consumeEmailVerificationToken(token)

    if (!result.valid) {
      const message = result.reason === "expired"
        ? "Ce lien de confirmation a expire."
        : "Ce lien de confirmation est invalide."

      return (
        <Card>
          <CardHeader>
            <CardTitle>Confirmation indisponible</CardTitle>
            <CardDescription>{message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login" className="font-medium text-green-700 hover:text-green-800">
              Retour a la connexion
            </Link>
          </CardContent>
        </Card>
      )
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>Adresse confirmee</CardTitle>
          <CardDescription>
            Votre adresse email est maintenant validee. Vous pouvez vous connecter.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login?verified=success" className="font-medium text-green-700 hover:text-green-800">
            Aller a la connexion
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <VerifyEmailNotice
      email={email}
      sent={sent === "1"}
    />
  )
}
