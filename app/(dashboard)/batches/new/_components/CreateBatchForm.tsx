"use client"

import { useState, useTransition, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Button } from "@/src/components/ui/button"
import { Input }  from "@/src/components/ui/input"
import { Label }  from "@/src/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card"
import { getBuildings, type BuildingSummary } from "@/src/actions/buildings"
import { createBatch } from "@/src/actions/batches"
import type { FarmSummary } from "@/src/actions/farms"
import { formatMoneyFCFA } from "@/src/lib/formatters"

// ---------------------------------------------------------------------------
// Schéma
// ---------------------------------------------------------------------------

const schema = z.object({
  farmId:       z.string().min(1, "Ferme requise"),
  buildingId:   z.string().min(1, "Bâtiment requis"),
  type:         z.enum(["CHAIR", "PONDEUSE", "REPRODUCTEUR"]),
  speciesId:    z.string().min(1, "Espèce requise"),
  entryDate:    z.string().min(1, "Date d'entrée requise"),
  entryCount:   z.coerce.number().int().positive("Effectif requis"),
  entryAgeDay:  z.coerce.number().int().nonnegative().default(0),
  entryWeightG: z.coerce.number().int().positive().optional().or(z.literal("")),
  supplierId:   z.string().optional(),
  unitCostFcfa: z.coerce.number().int().nonnegative().default(0),
  totalCostFcfa: z.coerce.number().int().nonnegative().default(0),
  notes:        z.string().max(1000).optional(),
})

type FormValues = z.infer<typeof schema>

const BATCH_TYPE_LABELS: Record<string, string> = {
  CHAIR:       "Poulet de chair",
  PONDEUSE:    "Pondeuse",
  REPRODUCTEUR: "Reproducteur",
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  organizationId: string
  initialFarms:   FarmSummary[]
  species:        { id: string; name: string; code: string }[]
  suppliers:      { id: string; name: string }[]
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export function CreateBatchForm({ organizationId, initialFarms, species, suppliers }: Props) {
  const router                    = useRouter()
  const [isPending, startTransition] = useTransition()
  const [buildings, setBuildings] = useState<BuildingSummary[]>([])
  const [loadingBldgs, setLoadingBldgs] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type:         "CHAIR",
      entryAgeDay:  0,
      unitCostFcfa: 0,
      totalCostFcfa: 0,
      entryDate:    new Date().toISOString().split("T")[0],
    },
  })

  const farmId      = watch("farmId")
  const entryCount  = watch("entryCount")
  const unitCost    = watch("unitCostFcfa")

  // Recalcul automatique du coût total quand entryCount ou unitCost change
  useEffect(() => {
    if (entryCount > 0 && unitCost >= 0) {
      setValue("totalCostFcfa", Math.round(Number(entryCount) * Number(unitCost)))
    }
  }, [entryCount, unitCost, setValue])

  // Charger les bâtiments quand la ferme change
  useEffect(() => {
    if (!farmId) {
      setBuildings([])
      setValue("buildingId", "")
      return
    }
    setLoadingBldgs(true)
    getBuildings({ organizationId, farmId }).then((res) => {
      if (res.success) {
        setBuildings(res.data)
        if (res.data.length === 1) setValue("buildingId", res.data[0].id)
        else setValue("buildingId", "")
      }
      setLoadingBldgs(false)
    })
  }, [farmId, organizationId, setValue])

  async function onSubmit(data: FormValues) {
    startTransition(async () => {
      const res = await createBatch({
        organizationId,
        buildingId:    data.buildingId,
        type:          data.type,
        speciesId:     data.speciesId,
        entryDate:     new Date(data.entryDate),
        entryCount:    data.entryCount,
        entryAgeDay:   data.entryAgeDay,
        entryWeightG:  data.entryWeightG ? Number(data.entryWeightG) : undefined,
        supplierId:    data.supplierId || undefined,
        unitCostFcfa:  data.unitCostFcfa,
        totalCostFcfa: data.totalCostFcfa,
        notes:         data.notes || undefined,
      })

      if (res.success) {
        toast.success(`Lot ${res.data.number} créé`)
        router.push(`/batches/${res.data.id}`)
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* En-tête */}
      <div className="flex items-center gap-3">
        <Link
          href="/batches"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Nouveau lot</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Enregistrer l&apos;entrée d&apos;un nouveau lot d&apos;élevage.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Localisation */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Localisation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="farmId" required>Ferme</Label>
              <select
                id="farmId"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                {...register("farmId")}
              >
                <option value="">Sélectionner une ferme</option>
                {initialFarms.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              {errors.farmId && (
                <p className="mt-1 text-xs text-red-600">{errors.farmId.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="buildingId" required>Bâtiment</Label>
              <select
                id="buildingId"
                disabled={!farmId || loadingBldgs}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-400"
                {...register("buildingId")}
              >
                <option value="">
                  {loadingBldgs
                    ? "Chargement..."
                    : farmId
                      ? buildings.length === 0
                        ? "Aucun bâtiment"
                        : "Sélectionner un bâtiment"
                      : "Sélectionner d'abord une ferme"}
                </option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — {b.capacity.toLocaleString("fr-SN")} sujets
                    {b._count.batches > 0 ? ` (${b._count.batches} lot actif)` : ""}
                  </option>
                ))}
              </select>
              {errors.buildingId && (
                <p className="mt-1 text-xs text-red-600">{errors.buildingId.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Type et espèce */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Type d&apos;élevage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="type" required>Type</Label>
                <select
                  id="type"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  {...register("type")}
                >
                  {Object.entries(BATCH_TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="speciesId" required>Espèce</Label>
                <select
                  id="speciesId"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  {...register("speciesId")}
                >
                  <option value="">Sélectionner</option>
                  {species.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                {errors.speciesId && (
                  <p className="mt-1 text-xs text-red-600">{errors.speciesId.message}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Effectif et date */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Entrée du lot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="entryDate" required>Date d&apos;entrée</Label>
                <Input
                  id="entryDate"
                  type="date"
                  error={errors.entryDate?.message}
                  {...register("entryDate")}
                />
              </div>
              <div>
                <Label htmlFor="entryCount" required>Effectif initial</Label>
                <Input
                  id="entryCount"
                  type="number"
                  placeholder="500"
                  error={errors.entryCount?.message}
                  {...register("entryCount")}
                />
              </div>
              <div>
                <Label htmlFor="entryAgeDay">Âge à l&apos;entrée (jours)</Label>
                <Input
                  id="entryAgeDay"
                  type="number"
                  placeholder="0"
                  {...register("entryAgeDay")}
                />
              </div>
              <div>
                <Label htmlFor="entryWeightG">Poids moyen à l&apos;entrée (g)</Label>
                <Input
                  id="entryWeightG"
                  type="number"
                  placeholder="42"
                  {...register("entryWeightG")}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Achat */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Achat des sujets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="supplierId">Fournisseur</Label>
              <select
                id="supplierId"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                {...register("supplierId")}
              >
                <option value="">Sans fournisseur</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="unitCostFcfa">Prix unitaire (FCFA)</Label>
                <Input
                  id="unitCostFcfa"
                  type="number"
                  placeholder="350"
                  {...register("unitCostFcfa")}
                />
              </div>
              <div>
                <Label htmlFor="totalCostFcfa">Coût total (FCFA)</Label>
                <Input
                  id="totalCostFcfa"
                  type="number"
                  placeholder="175 000"
                  {...register("totalCostFcfa")}
                />
                {entryCount > 0 && Number(unitCost) > 0 && (
                  <p className="mt-1 text-xs text-green-600">
                    Calculé : {formatMoneyFCFA(Math.round(Number(entryCount) * Number(unitCost)))}
                  </p>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                rows={2}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Observations sur le lot..."
                {...register("notes")}
              />
            </div>
          </CardContent>
        </Card>

        {/* Bouton */}
        <Button
          type="submit"
          variant="primary"
          loading={isPending}
          className="w-full"
        >
          Créer le lot
        </Button>
      </form>
    </div>
  )
}
