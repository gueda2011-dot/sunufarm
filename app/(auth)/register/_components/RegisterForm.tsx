"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm, type SubmitHandler } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { signIn } from "next-auth/react"
import { Eye, EyeOff, AlertCircle } from "lucide-react"
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
import { registerUserAccount } from "@/src/actions/onboarding"

const registerSchema = z.object({
  name: z.string().trim().min(2, "Nom requis").max(120),
  email: z.string().trim().email("Adresse email invalide"),
  password: z
    .string()
    .min(8, "8 caracteres minimum")
    .regex(/[a-z]/, "Ajoutez une minuscule")
    .regex(/[A-Z]/, "Ajoutez une majuscule")
    .regex(/[0-9]/, "Ajoutez un chiffre"),
  confirmPassword: z.string().min(1, "Confirmation requise"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
})

type RegisterFormValues = z.infer<typeof registerSchema>

export function RegisterForm() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [submitError, setSubmitError] = useState("")

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  })

  const onSubmit: SubmitHandler<RegisterFormValues> = (data) => {
    setSubmitError("")

    startTransition(async () => {
      const result = await registerUserAccount({
        name: data.name,
        email: data.email,
        password: data.password,
        confirmPassword: data.confirmPassword,
      })

      if (!result.success) {
        if (result.fieldErrors) {
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            const message = messages?.[0]
            if (message) {
              setError(field as keyof RegisterFormValues, { message })
            }
          }
        }

        setSubmitError(result.error)
        return
      }

      const signInResult = await signIn("credentials", {
        email: data.email.trim().toLowerCase(),
        password: data.password,
        redirect: false,
      })

      if (signInResult?.error) {
        setSubmitError("Compte cree, mais la connexion automatique a echoue. Connectez-vous manuellement.")
        router.push("/login")
        return
      }

      router.push("/onboarding")
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Creer un compte</CardTitle>
        <CardDescription>
          Ouvrez votre espace SunuFarm puis configurez votre premiere exploitation.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {submitError && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{submitError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div>
            <Label htmlFor="name" required>
              Nom complet
            </Label>
            <Input
              id="name"
              placeholder="Aminata Ndiaye"
              autoComplete="name"
              autoFocus
              error={errors.name?.message}
              {...register("name")}
            />
          </div>

          <div>
            <Label htmlFor="email" required>
              Adresse email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="vous@exemple.com"
              autoComplete="email"
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
                placeholder="8 caracteres minimum"
                autoComplete="new-password"
                className="pr-12"
                error={errors.password?.message}
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

          <div>
            <Label htmlFor="confirmPassword" required>
              Confirmer le mot de passe
            </Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmation ? "text" : "password"}
                placeholder="Retapez le mot de passe"
                autoComplete="new-password"
                className="pr-12"
                error={errors.confirmPassword?.message}
                {...register("confirmPassword")}
              />
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowConfirmation((value) => !value)}
                aria-label={showConfirmation ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                tabIndex={-1}
              >
                {showConfirmation ? (
                  <EyeOff className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Eye className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <Button type="submit" className="mt-2 w-full" loading={isPending}>
            Creer mon compte
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-600">
          Vous avez deja un compte ?{" "}
          <Link href="/login" className="font-medium text-green-700 hover:text-green-800">
            Se connecter
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
