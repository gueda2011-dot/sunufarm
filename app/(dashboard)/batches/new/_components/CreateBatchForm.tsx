"use client"

import { useEffect, useMemo, useTransition } from "react"
import { useQuery } from "@tanstack/react-query"
import { useForm, useWatch, type SubmitHandler } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import type {
  PoultryProductionType,
  PoultrySpecies,
  VaccinationPlanTemplateProductionType,
} from "@/src/generated/prisma/client"
import { getBuildings } from "@/src/actions/buildings"
import { createBatch } from "@/src/actions/batches"
import type { FarmSummary } from "@/src/actions/farms"
import { Button } from "@/src/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card"
import { Input } from "@/src/components/ui/input"
import { Label } from "@/src/components/ui/label"
import { formatMoneyFCFA } from "@/src/lib/formatters"
import {
  getTemplateProductionTypeForBatchType,
  inferPoultrySpeciesFromSpeciesCode,
  isStrainCompatibleWithBatchType,
} from "@/src/lib/poultry-reference"

const schema = z.object({
  farmId: z.string().min(1, "Ferme requise"),
  buildingId: z.string().min(1, "Batiment requis"),
  type: z.enum(["CHAIR", "PONDEUSE", "REPRODUCTEUR"]),
  speciesId: z.string().min(1, "Espece requise"),
  poultryStrainId: z.string().optional(),
  vaccinationPlanTemplateId: z.string().optional(),
  entryDate: z.string().min(1, "Date d'entree requise"),
  entryCount: z.coerce.number().int().positive("Effectif requis"),
  entryAgeDay: z.coerce.number().int().nonnegative(),
  entryWeightG: z.union([z.literal(""), z.coerce.number().int().positive()]).optional(),
  supplierId: z.string().optional(),
  unitCostFcfa: z.coerce.number().int().nonnegative(),
  totalCostFcfa: z.coerce.number().int().nonnegative(),
  notes: z.string().max(1000).optional(),
})

type FormValues = z.input<typeof schema>
type SubmitValues = z.output<typeof schema>

const BATCH_TYPE_LABELS: Record<string, string> = {
  CHAIR: "Poulet de chair",
  PONDEUSE: "Pondeuse",
  REPRODUCTEUR: "Reproducteur",
}

const STRAIN_PRODUCTION_TYPE_LABELS: Record<PoultryProductionType, string> = {
  BROILER: "Chair",
  LAYER: "Ponte",
  LOCAL: "Locale",
  DUAL: "Mixte",
}

const TEMPLATE_PRODUCTION_TYPE_LABELS: Record<
  VaccinationPlanTemplateProductionType,
  string
> = {
  BROILER: "Chair",
  LAYER: "Pondeuse",
}

interface Props {
  organizationId: string
  initialFarms: FarmSummary[]
  species: { id: string; name: string; code: string }[]
  poultryStrains: {
    id: string
    name: string
    productionType: PoultryProductionType
    species: PoultrySpecies
    notes: string | null
  }[]
  vaccinationPlanTemplates: {
    id: string
    name: string
    productionType: VaccinationPlanTemplateProductionType
  }[]
  suppliers: { id: string; name: string }[]
  referenceDataUnavailable?: boolean
}

export function CreateBatchForm({
  organizationId,
  initialFarms,
  species,
  poultryStrains,
  vaccinationPlanTemplates,
  suppliers,
  referenceDataUnavailable = false,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues, undefined, SubmitValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      farmId: "",
      buildingId: "",
      type: "CHAIR",
      speciesId: "",
      poultryStrainId: "",
      vaccinationPlanTemplateId: "",
      entryDate: new Date().toISOString().split("T")[0],
      entryCount: "" as unknown as number,
      entryAgeDay: 0,
      entryWeightG: "",
      supplierId: "",
      unitCostFcfa: 0,
      totalCostFcfa: 0,
      notes: "",
    },
  })

  const farmId = useWatch({ control, name: "farmId" })
  const batchType = useWatch({ control, name: "type" })
  const speciesId = useWatch({ control, name: "speciesId" })
  const poultryStrainId = useWatch({ control, name: "poultryStrainId" })
  const vaccinationPlanTemplateId = useWatch({
    control,
    name: "vaccinationPlanTemplateId",
  })
  const entryCount = useWatch({ control, name: "entryCount" })
  const unitCost = useWatch({ control, name: "unitCostFcfa" })

  const { data: visibleBuildings = [], isFetching: loadingBldgs } = useQuery({
    queryKey: ["buildings", organizationId, farmId],
    queryFn: async () => {
      if (!farmId) return []
      const res = await getBuildings({ organizationId, farmId })
      return res.success ? res.data : []
    },
    enabled: !!farmId,
    staleTime: 60_000,
  })

  const selectedSpecies = useMemo(
    () => species.find((item) => item.id === speciesId) ?? null,
    [species, speciesId],
  )

  const compatibleStrains = useMemo(() => {
    const inferredSpecies = inferPoultrySpeciesFromSpeciesCode(selectedSpecies?.code)
    if (!inferredSpecies) return []

    return poultryStrains.filter(
      (strain) =>
        strain.species === inferredSpecies &&
        isStrainCompatibleWithBatchType(strain.productionType, batchType),
    )
  }, [batchType, poultryStrains, selectedSpecies?.code])

  const compatibleTemplates = useMemo(() => {
    const expectedProductionType = getTemplateProductionTypeForBatchType(batchType)
    if (!expectedProductionType) return []

    return vaccinationPlanTemplates.filter(
      (template) => template.productionType === expectedProductionType,
    )
  }, [batchType, vaccinationPlanTemplates])

  useEffect(() => {
    const count = Number(entryCount || 0)
    const cost = Number(unitCost || 0)

    if (count > 0 && cost >= 0) {
      setValue("totalCostFcfa", count * cost as FormValues["totalCostFcfa"])
    }
  }, [entryCount, unitCost, setValue])

  useEffect(() => {
    if (!farmId) {
      setValue("buildingId", "")
    } else if (visibleBuildings.length === 1) {
      setValue("buildingId", visibleBuildings[0].id)
    } else {
      setValue("buildingId", "")
    }
  }, [farmId, setValue, visibleBuildings])

  useEffect(() => {
    if (
      poultryStrainId &&
      !compatibleStrains.some((strain) => strain.id === poultryStrainId)
    ) {
      setValue("poultryStrainId", "")
    }
  }, [compatibleStrains, poultryStrainId, setValue])

  useEffect(() => {
    if (
      vaccinationPlanTemplateId &&
      !compatibleTemplates.some((template) => template.id === vaccinationPlanTemplateId)
    ) {
      setValue("vaccinationPlanTemplateId", "")
    }
  }, [compatibleTemplates, setValue, vaccinationPlanTemplateId])

  const onSubmit: SubmitHandler<SubmitValues> = async (data) => {
    startTransition(async () => {
      const res = await createBatch({
        organizationId,
        buildingId: data.buildingId,
        type: data.type,
        speciesId: data.speciesId,
        poultryStrainId: data.poultryStrainId || undefined,
        vaccinationPlanTemplateId: data.vaccinationPlanTemplateId || undefined,
        entryDate: new Date(data.entryDate),
        entryCount: data.entryCount,
        entryAgeDay: data.entryAgeDay,
        entryWeightG:
          data.entryWeightG === "" || data.entryWeightG === undefined
            ? undefined
            : Number(data.entryWeightG),
        supplierId: data.supplierId || undefined,
        unitCostFcfa: data.unitCostFcfa,
        totalCostFcfa: data.totalCostFcfa,
        notes: data.notes || undefined,
      })

      if (res.success) {
        toast.success(`Lot ${res.data.number} cree`)
        router.push(`/batches/${res.data.id}`)
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href="/batches"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Nouveau lot</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Enregistrer l&apos;entree d&apos;un nouveau lot d&apos;elevage.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {referenceDataUnavailable && (
          <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
            Les souches avicoles et les templates vaccinaux ne sont pas encore disponibles sur cette base.
            Le lot peut etre cree normalement, mais sans ces nouveaux referentiels tant que la migration
            de base de donnees n&apos;a pas ete appliquee.
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Localisation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="farmId" required>
                Ferme
              </Label>
              <select
                id="farmId"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                {...register("farmId")}
              >
                <option value="">Selectionner une ferme</option>
                {initialFarms.map((farm) => (
                  <option key={farm.id} value={farm.id}>
                    {farm.name}
                  </option>
                ))}
              </select>
              {errors.farmId && (
                <p className="mt-1 text-xs text-red-600">{errors.farmId.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="buildingId" required>
                Batiment
              </Label>
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
                      ? visibleBuildings.length === 0
                        ? "Aucun batiment"
                        : "Selectionner un batiment"
                      : "Selectionner d'abord une ferme"}
                </option>
                {visibleBuildings.map((building) => (
                  <option key={building.id} value={building.id}>
                    {building.name} - {building.capacity.toLocaleString("fr-SN")} sujets
                    {building._count.batches > 0 ? ` (${building._count.batches} lot actif)` : ""}
                  </option>
                ))}
              </select>
              {errors.buildingId && (
                <p className="mt-1 text-xs text-red-600">{errors.buildingId.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Type d&apos;elevage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="type" required>
                  Type
                </Label>
                <select
                  id="type"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  {...register("type")}
                >
                  {Object.entries(BATCH_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="speciesId" required>
                  Espece
                </Label>
                <select
                  id="speciesId"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  {...register("speciesId")}
                >
                  <option value="">Selectionner</option>
                  {species.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                {errors.speciesId && (
                  <p className="mt-1 text-xs text-red-600">{errors.speciesId.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="poultryStrainId">Souche avicole</Label>
                <select
                  id="poultryStrainId"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-400"
                  disabled={!selectedSpecies}
                  {...register("poultryStrainId")}
                >
                  <option value="">
                    {!selectedSpecies
                      ? "Selectionner d'abord une espece"
                      : compatibleStrains.length === 0
                        ? "Aucune souche compatible"
                        : "Selectionner une souche"}
                  </option>
                  {compatibleStrains.map((strain) => (
                    <option key={strain.id} value={strain.id}>
                      {strain.name} - {STRAIN_PRODUCTION_TYPE_LABELS[strain.productionType]}
                    </option>
                  ))}
                </select>
                {poultryStrainId && (
                  <p className="mt-1 text-xs text-gray-500">
                    {compatibleStrains.find((strain) => strain.id === poultryStrainId)?.notes ??
                      "Souche selectionnee pour le suivi de lot."}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="vaccinationPlanTemplateId">
                  Plan vaccinal modele
                </Label>
                <select
                  id="vaccinationPlanTemplateId"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-400"
                  disabled={compatibleTemplates.length === 0}
                  {...register("vaccinationPlanTemplateId")}
                >
                  <option value="">
                    {compatibleTemplates.length === 0
                      ? "Aucun modele pour ce type de lot"
                      : "Selectionner un modele"}
                  </option>
                  {compatibleTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} - {TEMPLATE_PRODUCTION_TYPE_LABELS[template.productionType]}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Si un modele est choisi, un plan vaccinal sera genere automatiquement pour le lot.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Entree du lot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="entryDate" required>
                  Date d&apos;entree
                </Label>
                <Input
                  id="entryDate"
                  type="date"
                  error={errors.entryDate?.message}
                  {...register("entryDate")}
                />
              </div>

              <div>
                <Label htmlFor="entryCount" required>
                  Effectif initial
                </Label>
                <Input
                  id="entryCount"
                  type="number"
                  placeholder="500"
                  error={errors.entryCount?.message}
                  {...register("entryCount")}
                />
              </div>

              <div>
                <Label htmlFor="entryAgeDay">Age a l&apos;entree (jours)</Label>
                <Input
                  id="entryAgeDay"
                  type="number"
                  placeholder="0"
                  {...register("entryAgeDay")}
                />
              </div>

              <div>
                <Label htmlFor="entryWeightG">Poids moyen a l&apos;entree (g)</Label>
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
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                <Label htmlFor="totalCostFcfa">Cout total (FCFA)</Label>
                <Input
                  id="totalCostFcfa"
                  type="number"
                  placeholder="175000"
                  {...register("totalCostFcfa")}
                />
                {Number(entryCount || 0) > 0 && Number(unitCost || 0) > 0 && (
                  <p className="mt-1 text-xs text-green-600">
                    Calcule : {formatMoneyFCFA(Math.round(Number(entryCount) * Number(unitCost)))}
                  </p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                rows={2}
                className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Observations sur le lot..."
                {...register("notes")}
              />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" variant="primary" loading={isPending} className="w-full">
          Creer le lot
        </Button>
      </form>
    </div>
  )
}
