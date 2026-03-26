"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm, type SubmitHandler } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AlertCircle, Building2, Sparkles } from "lucide-react"
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
import { completeOnboarding } from "@/src/actions/onboarding"

const onboardingSchema = z.object({
  organizationName: z.string().trim().min(2, "Nom de l'exploitation requis").max(120),
  farmName: z.string().trim().min(2, "Nom de la premiere ferme requis").max(120),
  phone: z.string().trim().max(24).optional(),
  address: z.string().trim().max(255).optional(),
})

type OnboardingFormValues = z.infer<typeof onboardingSchema>

export function OnboardingForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [submitError, setSubmitError] = useState("")
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      organizationName: "",
      farmName: "",
      phone: "",
      address: "",
    },
  })

  const onSubmit: SubmitHandler<OnboardingFormValues> = (data) => {
    setSubmitError("")

    startTransition(async () => {
      const result = await completeOnboarding(data)

      if (!result.success) {
        if (result.fieldErrors) {
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            const message = messages?.[0]
            if (message) {
              setError(field as keyof OnboardingFormValues, { message })
            }
          }
        }

        setSubmitError(result.error)
        return
      }

      router.push("/dashboard")
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <Card className="border-green-200 bg-green-50">
        <CardContent className="flex items-start gap-3 py-5">
          <Sparkles className="mt-0.5 h-5 w-5 text-green-700" />
          <div>
            <p className="text-sm font-semibold text-green-900">
              Essai gratuit de 7 jours
            </p>
            <p className="mt-1 text-sm text-green-800">
              Configurez votre exploitation maintenant. Vous commencerez avec un essai controle avant de passer a un abonnement payant.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle>Configurer mon exploitation</CardTitle>
          <CardDescription>
            Nous allons creer votre organisation, votre premiere ferme et votre acces proprietaire.
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
              <Label htmlFor="organizationName" required>
                Nom de l&apos;exploitation
              </Label>
              <Input
                id="organizationName"
                placeholder="Ferme Ndiaye Aviculture"
                autoFocus
                error={errors.organizationName?.message}
                {...register("organizationName")}
              />
            </div>

            <div>
              <Label htmlFor="farmName" required>
                Nom de la premiere ferme
              </Label>
              <Input
                id="farmName"
                placeholder="Site principal de Thies"
                error={errors.farmName?.message}
                {...register("farmName")}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="phone">Telephone</Label>
                <Input
                  id="phone"
                  placeholder="+221 77 123 45 67"
                  autoComplete="tel"
                  error={errors.phone?.message}
                  {...register("phone")}
                />
              </div>
              <div>
                <Label htmlFor="address">Adresse</Label>
                <Input
                  id="address"
                  placeholder="Dakar, Thies, Saint-Louis..."
                  error={errors.address?.message}
                  {...register("address")}
                />
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              <div className="flex items-center gap-2 font-medium text-gray-900">
                <Building2 className="h-4 w-4 text-green-700" />
                Ce qui sera cree automatiquement
              </div>
              <p className="mt-2">Votre organisation, votre premiere ferme, votre role OWNER et votre essai de 7 jours.</p>
            </div>

            <Button type="submit" className="w-full" loading={isPending}>
              Terminer la configuration
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
