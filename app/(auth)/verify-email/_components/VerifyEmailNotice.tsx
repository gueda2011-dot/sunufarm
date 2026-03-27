"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { requestEmailVerification } from "@/src/actions/auth-recovery"
import { Button } from "@/src/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card"

export function VerifyEmailNotice({
  email,
  sent,
}: {
  email?: string
  sent: boolean
}) {
  const [message, setMessage] = useState("")
  const [isPending, startTransition] = useTransition()

  const handleResend = () => {
    if (!email) return

    setMessage("")

    startTransition(async () => {
      const result = await requestEmailVerification({ email })

      if (!result.success) {
        setMessage(result.error)
        return
      }

      setMessage("Un nouvel email de confirmation vient d'etre envoye.")
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verifiez votre boite mail</CardTitle>
        <CardDescription>
          {sent
            ? "Nous avons envoye un email de confirmation pour activer votre compte SunuFarm."
            : "Confirmez votre adresse email pour activer votre compte."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {email ? (
          <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
            Adresse concernee : <span className="font-medium">{email}</span>
          </p>
        ) : null}

        {email ? (
          <Button type="button" className="w-full" loading={isPending} onClick={handleResend}>
            Renvoyer l&apos;email de confirmation
          </Button>
        ) : null}

        {message ? (
          <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
            {message}
          </div>
        ) : null}

        <p className="text-center text-sm text-gray-600">
          <Link href="/login" className="font-medium text-green-700 hover:text-green-800">
            Retour a la connexion
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
