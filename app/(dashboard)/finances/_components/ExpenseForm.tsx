"use client"

import { useState, useTransition } from "react"
import { useRouter }               from "next/navigation"
import { createExpense }             from "@/src/actions/expenses"
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card"
import { Input }                     from "@/src/components/ui/input"
import { Label }                     from "@/src/components/ui/label"
import { Button }                    from "@/src/components/ui/button"

interface ExpenseFormProps {
  organizationId: string
}

export function ExpenseForm({ organizationId }: ExpenseFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error,   setError]   = useState("")
  const [success, setSuccess] = useState("")

  function handleSubmit(formData: FormData) {
    setError("")
    setSuccess("")

    startTransition(async () => {
      const result = await createExpense({
        organizationId,
        description: String(formData.get("description") ?? ""),
        amountFcfa:  Number(formData.get("amountFcfa")  ?? 0),
        date:        String(formData.get("date")        ?? ""),
        reference:   String(formData.get("reference")   ?? "") || undefined,
        notes:       String(formData.get("notes")       ?? "") || undefined,
      })

      if (!result.success) {
        setError(result.error)
        return
      }

      setSuccess("Dépense enregistrée.")
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nouvelle dépense</CardTitle>
      </CardHeader>

      <CardContent>
        <form action={handleSubmit} className="space-y-4">

          <div>
            <Label htmlFor="description" required>Description</Label>
            <Input
              id="description"
              name="description"
              placeholder="Ex : Achat d'aliment"
            />
          </div>

          <div>
            <Label htmlFor="amountFcfa" required>Montant (FCFA)</Label>
            <Input
              id="amountFcfa"
              name="amountFcfa"
              type="number"
              min="1"
              step="1"
              placeholder="50000"
            />
          </div>

          <div>
            <Label htmlFor="date" required>Date</Label>
            <Input
              id="date"
              name="date"
              type="date"
            />
          </div>

          <div>
            <Label htmlFor="reference">Référence</Label>
            <Input
              id="reference"
              name="reference"
              placeholder="Facture, BL, reçu..."
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              name="notes"
              className="min-h-[90px] w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent"
              placeholder="Détails complémentaires"
            />
          </div>

          {error   ? <p className="text-sm text-red-600">{error}</p>   : null}
          {success ? <p className="text-sm text-green-600">{success}</p> : null}

          <Button type="submit" className="w-full" loading={isPending}>
            Ajouter la dépense
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
