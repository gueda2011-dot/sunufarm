"use client"

import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { Eye, EyeOff, AlertCircle } from "lucide-react"
import { Button } from "@/src/components/ui/button"
import { Input } from "@/src/components/ui/input"
import { Label } from "@/src/components/ui/label"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/src/components/ui/card"

const loginSchema = z.object({
  email: z.string().email("Adresse email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
})

type LoginFormValues = z.infer<typeof loginSchema>

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "Email ou mot de passe incorrect.",
  "no-org": "Votre compte n'est associe a aucune organisation.",
  OAuthSignin: "Erreur lors de la connexion. Reessayez.",
  OAuthCallback: "Erreur lors de la connexion. Reessayez.",
  SessionRequired: "Votre session a expire. Reconnectez-vous.",
  Default: "Une erreur est survenue. Reessayez.",
}

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard"
  const urlErrorCode = searchParams.get("error") ?? ""
  const urlErrorMsg = AUTH_ERROR_MESSAGES[urlErrorCode] ?? ""

  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginFormValues) => {
    setSubmitting(true)
    setSubmitError("")

    try {
      const result = await signIn("credentials", {
        email: data.email.trim().toLowerCase(),
        password: data.password,
        redirect: false,
      })

      if (result?.error) {
        setSubmitError(
          AUTH_ERROR_MESSAGES[result.error] ?? AUTH_ERROR_MESSAGES.Default,
        )
        return
      }

      router.push(callbackUrl)
      router.refresh()
    } catch {
      setSubmitError("Une erreur inattendue est survenue. Reessayez.")
    } finally {
      setSubmitting(false)
    }
  }

  const errorMessage = submitError || urlErrorMsg

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Connexion</CardTitle>
        <CardDescription>
          Entrez vos identifiants pour acceder a votre ferme.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {errorMessage && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
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

          <div>
            <Label htmlFor="password" required>
              Mot de passe
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Votre mot de passe"
                autoComplete="current-password"
                error={errors.password?.message}
                className="pr-12"
                {...register("password")}
              />
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Eye className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="default"
            loading={submitting}
            className="mt-2 w-full"
          >
            Se connecter
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-600">
          Nouveau sur SunuFarm ?{" "}
          <Link href="/register" className="font-medium text-green-700 hover:text-green-800">
            Creer un compte
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
