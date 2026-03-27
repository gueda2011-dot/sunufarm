"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { useForm, useWatch, type SubmitHandler } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import { createBatch } from "@/src/actions/batches"
import { getBuildings, type BuildingSummary } from "@/src/actions/buildings"
import {
  clearFormDraft,
  getFormDraft,
  saveFormDraft,
} from "@/src/actions/form-drafts"
import type { FarmSummary } from "@/src/actions/farms"
import { Button } from "@/src/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card"
import { Input } from "@/src/components/ui/input"
import { Label } from "@/src/components/ui/label"
import {
  getDefaultSpeciesCodeForBatchType,
  isBreedSuggestedForBatchType,
  SENEGAL_BREED_HINTS,
} from "@/src/lib/breeds"
import { formatMoneyFCFA } from "@/src/lib/formatters"

const schema = z.object({
  farmId: z.string().min(1, "Ferme requise"),
  buildingId: z.string().min(1, "Batiment requis"),
  type: z.enum(["CHAIR", "PONDEUSE", "REPRODUCTEUR"]),
  speciesId: z.string().min(1, "Espece requise"),
  breedId: z.string().optional(),
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

interface Props {
  organizationId: string
  initialFarms: FarmSummary[]
  species: { id: string; name: string; code: string }[]
  breeds: Array<{
    id: string
    name: string
    code: string
    speciesId: string
    species: {
      code: string
      name: string
    }
  }>
  suppliers: { id: string; name: string }[]
}

export function CreateBatchForm({
  organizationId,
  initialFarms,
  species,
  breeds,
  suppliers,
}: Props) {
  const draftStorageKey = `sunufarm:draft:create-batch:${organizationId}`
  const draftFormKey = `create-batch:${organizationId}`
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [buildings, setBuildings] = useState<BuildingSummary[]>([])
  const [loadingBldgs, setLoadingBldgs] = useState(false)
  const [draftReady, setDraftReady] = useState(false)

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues, unknown, SubmitValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      farmId: "",
      buildingId: "",
      type: "CHAIR",
      speciesId: "",
      breedId: "",
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
  const breedId = useWatch({ control, name: "breedId" })
  const entryCount = useWatch({ control, name: "entryCount" })
  const unitCost = useWatch({ control, name: "unitCostFcfa" })
  const draftValues = useWatch({ control })

  const suggestedSpecies = useMemo(() => {
    const defaultCode = getDefaultSpeciesCodeForBatchType(batchType)
    return species.find((item) => item.code === defaultCode) ?? null
  }, [batchType, species])

  const filteredBreeds = useMemo(() => {
    return breeds.filter((breed) => {
      if (speciesId && breed.speciesId !== speciesId) return false
      return isBreedSuggestedForBatchType(breed.code, batchType)
    })
  }, [breeds, speciesId, batchType])

  const farmField = register("farmId")

  useEffect(() => {
    const count = Number(entryCount || 0)
    const cost = Number(unitCost || 0)

    if (count > 0 && cost >= 0) {
      setValue("totalCostFcfa", (count * cost) as FormValues["totalCostFcfa"])
    }
  }, [entryCount, unitCost, setValue])

  useEffect(() => {
    if (!suggestedSpecies) return
    if (speciesId === suggestedSpecies.id) return

    setValue("speciesId", suggestedSpecies.id as FormValues["speciesId"], {
      shouldDirty: true,
    })
  }, [setValue, speciesId, suggestedSpecies])

  useEffect(() => {
    if (!breedId) return
    if (filteredBreeds.some((breed) => breed.id === breedId)) return
    setValue("breedId", "")
  }, [breedId, filteredBreeds, setValue])

  const handleFarmChange = useCallback(async (
    nextFarmId: string,
    preferredBuildingId?: string,
  ) => {
    setValue("buildingId", "")

    if (!nextFarmId) {
      setBuildings([])
      setLoadingBldgs(false)
      return
    }

    setLoadingBldgs(true)
    const res = await getBuildings({ organizationId, farmId: nextFarmId })
    if (res.success) {
      setBuildings(res.data)
      if (
        preferredBuildingId &&
        res.data.some((building) => building.id === preferredBuildingId)
      ) {
        setValue("buildingId", preferredBuildingId as FormValues["buildingId"])
      } else if (res.data.length === 1) {
        setValue("buildingId", res.data[0].id)
      }
    } else {
      setBuildings([])
    }
    setLoadingBldgs(false)
  }, [organizationId, setValue])

  useEffect(() => {
    if (typeof window === "undefined") return

    async function loadDraft() {
      try {
        const serverDraftResult = await getFormDraft({
          formKey: draftFormKey,
          organizationId,
        })

        const rawDraft = window.localStorage.getItem(draftStorageKey)
        const serverDraft = serverDraftResult.success
          ? serverDraftResult.data?.payload ?? null
          : null
        const parsedDraft = (
          serverDraft ??
          (rawDraft ? JSON.parse(rawDraft) : null)
        ) as Partial<FormValues> | null

        if (!parsedDraft) {
          setDraftReady(true)
          return
        }

        reset({
          farmId: parsedDraft.farmId ?? "",
          buildingId: parsedDraft.buildingId ?? "",
          type: parsedDraft.type ?? "CHAIR",
          speciesId: parsedDraft.speciesId ?? "",
          breedId: parsedDraft.breedId ?? "",
          entryDate: parsedDraft.entryDate ?? new Date().toISOString().split("T")[0],
          entryCount: parsedDraft.entryCount ?? ("" as unknown as number),
          entryAgeDay: parsedDraft.entryAgeDay ?? 0,
          entryWeightG: parsedDraft.entryWeightG ?? "",
          supplierId: parsedDraft.supplierId ?? "",
          unitCostFcfa: parsedDraft.unitCostFcfa ?? 0,
          totalCostFcfa: parsedDraft.totalCostFcfa ?? 0,
          notes: parsedDraft.notes ?? "",
        })

        if (parsedDraft.farmId) {
          await handleFarmChange(parsedDraft.farmId, parsedDraft.buildingId)
        }
      } catch {
        window.localStorage.removeItem(draftStorageKey)
      } finally {
        setDraftReady(true)
      }
    }

    void loadDraft()
  }, [draftFormKey, draftStorageKey, handleFarmChange, organizationId, reset])

  useEffect(() => {
    if (!draftReady || typeof window === "undefined") return
    window.localStorage.setItem(draftStorageKey, JSON.stringify(draftValues))

    const timeout = window.setTimeout(() => {
      void saveFormDraft({
        formKey: draftFormKey,
        organizationId,
        title: "Nouveau lot",
        payload: draftValues as Record<string, unknown>,
      })
    }, 800)

    return () => window.clearTimeout(timeout)
  }, [draftFormKey, draftReady, draftStorageKey, draftValues, organizationId])

  const onSubmit: SubmitHandler<SubmitValues> = async (data) => {
    startTransition(async () => {
      const res = await createBatch({
        organizationId,
        buildingId: data.buildingId,
        type: data.type,
        speciesId: data.speciesId,
        breedId: data.breedId || undefined,
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
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(draftStorageKey)
        }
        await clearFormDraft({ formKey: draftFormKey, organizationId })
        router.push("/batches")
        router.refresh()
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

      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        Brouillon automatique actif sur cet appareil et sur votre compte. Si vous quittez l&apos;ecran, les informations restent memorisees jusqu&apos;a la creation du lot.
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
                {...farmField}
                onChange={(event) => {
                  farmField.onChange(event)
                  void handleFarmChange(event.target.value)
                }}
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
                      ? buildings.length === 0
                        ? "Aucun batiment"
                        : "Selectionner un batiment"
                      : "Selectionner d'abord une ferme"}
                </option>
                {buildings.map((building) => (
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
            <div className="grid grid-cols-2 gap-4">
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
                {suggestedSpecies && (
                  <p className="mt-1 text-xs text-gray-500">
                    Type {BATCH_TYPE_LABELS[batchType].toLowerCase()} : espece recommandee{" "}
                    <span className="font-medium text-gray-700">{suggestedSpecies.name}</span>.
                  </p>
                )}
              </div>

              <div className="col-span-2">
                <Label htmlFor="breedId">Race / souche</Label>
                <select
                  id="breedId"
                  disabled={!speciesId}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-400"
                  {...register("breedId")}
                >
                  <option value="">
                    {speciesId
                      ? filteredBreeds.length > 0
                        ? "Selectionner une race"
                        : "Aucune race recommandee"
                      : "Choisir d'abord une espece"}
                  </option>
                  {filteredBreeds.map((breed) => (
                    <option key={breed.id} value={breed.id}>
                      {breed.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {SENEGAL_BREED_HINTS[batchType]}
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
            <div className="grid grid-cols-2 gap-4">
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
