"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Eye, EyeOff, AlertCircle } from "lucide-react"
import { resetPasswordWithToken } from "@/src/actions/auth-recovery"
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

const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "8 caracteres minimum")
    .regex(/[a-z]/, "Ajoutez une minuscule")
    .regex(/[A-Z]/, "Ajoutez une majuscule")
    .regex(/[0-9]/, "Ajoutez un chiffre"),
  confirmPassword: z.string().min(1, "Confirmation requise"),
}).refine((data) => data.password === data.confirmPassword, {
  path: ["confirmPassword"],
  message: "Les mots de passe ne correspondent pas",
})

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>

export function ResetPasswordForm({
  token,
  email,
}: {
  token: string
  email: string
}) {
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
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  })

  const onSubmit = (data: ResetPasswordValues) => {
    setSubmitError("")

    startTransition(async () => {
      const result = await resetPasswordWithToken({
        token,
        password: data.password,
        confirmPassword: data.confirmPassword,
      })

      if (!result.success) {
        if (result.fieldErrors) {
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            const message = messages?.[0]
            if (message) {
              setError(field as keyof ResetPasswordValues, { message })
            }
          }
        }

        setSubmitError(result.error)
        return
      }

      router.push("/login?reset=success")
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Nouveau mot de passe</CardTitle>
        <CardDescription>
          Choisissez un nouveau mot de passe pour {email}.
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

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div>
            <Label htmlFor="password" required>
              Nouveau mot de passe
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
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
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
                {showConfirmation ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full" loading={isPending}>
            Enregistrer le nouveau mot de passe
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
