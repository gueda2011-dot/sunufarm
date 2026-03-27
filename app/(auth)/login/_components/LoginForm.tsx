"use client"

import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, useTransition } from "react"
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
import { requestEmailVerification } from "@/src/actions/auth-recovery"

const loginSchema = z.object({
  identifier: z.string().trim().min(3, "Email ou numero requis"),
  password: z.string().min(1, "Mot de passe requis"),
})

type LoginFormValues = z.infer<typeof loginSchema>

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "Email ou mot de passe incorrect.",
  email_not_verified: "Votre adresse email n'est pas encore confirmee.",
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
  const urlErrorCode = searchParams.get("code") ?? searchParams.get("error") ?? ""
  const urlErrorMsg = AUTH_ERROR_MESSAGES[urlErrorCode] ?? ""
  const successMessage =
    searchParams.get("verified") === "success"
      ? "Votre adresse email est maintenant confirmee. Vous pouvez vous connecter."
      : searchParams.get("reset") === "success"
        ? "Votre mot de passe a ete reinitialise. Connectez-vous avec le nouveau."
        : searchParams.get("verification") === "resent"
          ? "Un nouvel email de confirmation a ete envoye."
          : ""

  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [submitErrorCode, setSubmitErrorCode] = useState("")
  const [resendMessage, setResendMessage] = useState("")
  const [isResending, startResendTransition] = useTransition()

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  })

  const typedIdentifier = watch("identifier") ?? ""
  const canResendVerification =
    (submitErrorCode || urlErrorCode) === "email_not_verified"
    && typedIdentifier.includes("@")

  const onSubmit = async (data: LoginFormValues) => {
    setSubmitting(true)
    setSubmitError("")
    setSubmitErrorCode("")
    setResendMessage("")

    try {
      const result = await signIn("credentials", {
        identifier: data.identifier.trim(),
        password: data.password,
        redirect: false,
      })

      if (result?.error) {
        const code = result.code ?? result.error
        setSubmitErrorCode(code)
        setSubmitError(
          AUTH_ERROR_MESSAGES[code] ?? AUTH_ERROR_MESSAGES.Default,
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

  const handleResendVerification = () => {
    setResendMessage("")

    startResendTransition(async () => {
      const result = await requestEmailVerification({
        email: typedIdentifier.trim().toLowerCase(),
      })

      if (!result.success) {
        setResendMessage(result.error)
        return
      }

      setResendMessage("Un email de confirmation vient d'etre renvoye.")
    })
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Connexion</CardTitle>
        <CardDescription>
          Entrez vos identifiants pour acceder a votre ferme.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {successMessage && (
          <div className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
            {successMessage}
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        {canResendVerification && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p>
              Confirmez d&apos;abord votre adresse email pour activer votre compte.
            </p>
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={isResending}
              className="mt-2 font-medium text-amber-900 underline underline-offset-2 disabled:cursor-not-allowed disabled:no-underline"
            >
              {isResending ? "Renvoi..." : "Renvoyer l'email de confirmation"}
            </button>
            {resendMessage ? <p className="mt-2">{resendMessage}</p> : null}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <div>
            <Label htmlFor="identifier" required>
              Email ou telephone
            </Label>
            <Input
              id="identifier"
              type="text"
              placeholder="vous@exemple.com ou 77 123 45 67"
              autoComplete="username"
              autoFocus
              error={errors.identifier?.message}
              {...register("identifier")}
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

        <p className="mt-4 text-center text-sm text-gray-600">
          <Link href="/forgot-password" className="font-medium text-green-700 hover:text-green-800">
            Mot de passe oublie ?
          </Link>
        </p>

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
