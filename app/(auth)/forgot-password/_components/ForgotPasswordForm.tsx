"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AlertCircle } from "lucide-react"
import { requestPasswordReset } from "@/src/actions/auth-recovery"
import { Button } from "@/src/components/ui/button"
import { Input } from "@/src/components/ui/input"
import { Label } from "@/src/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card"

const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Adresse email invalide"),
})

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>

export function ForgotPasswordForm() {
  const [isPending, startTransition] = useTransition()
  const [submitError, setSubmitError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  })

  const onSubmit = (data: ForgotPasswordValues) => {
    setSubmitError("")
    setSuccessMessage("")

    startTransition(async () => {
      const result = await requestPasswordReset({
        email: data.email,
      })

      if (!result.success) {
        if (result.fieldErrors?.email?.[0]) {
          setError("email", {
            message: result.fieldErrors.email[0],
          })
        }

        setSubmitError(result.error)
        return
      }

      setSuccessMessage(
        "Si un compte correspond a cette adresse, un email de reinitialisation vient d'etre envoye.",
      )
    })
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Mot de passe oublie</CardTitle>
        <CardDescription>
          Entrez votre adresse email pour recevoir un lien de reinitialisation.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {submitError ? (
          <div
            role="alert"
            className="mb-4 flex items-start gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{submitError}</span>
          </div>
        ) : null}

        {successMessage ? (
          <div className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
            {successMessage}
          </div>
        ) : null}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="email" required>
              Adresse email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="vous@exemple.com"
              autoComplete="email"
              autoFocus
              error={errors.email?.message}
              {...register("email")}
            />
          </div>

          <Button type="submit" className="w-full" loading={isPending}>
            Envoyer le lien
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-600">
          <Link href="/login" className="font-medium text-green-700 hover:text-green-800">
            Retour a la connexion
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
