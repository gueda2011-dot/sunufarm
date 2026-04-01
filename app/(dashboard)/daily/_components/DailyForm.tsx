"use client"

import { useEffect, useState } from "react"
import { useForm, useWatch, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { ChevronDown } from "lucide-react"
import { Button } from "@/src/components/ui/button"
import { NumericField } from "./NumericField"
import {
  createDailyRecord,
  updateDailyRecord,
} from "@/src/actions/daily-records"
import {
  clearFormDraft,
  getFormDraft,
  saveFormDraft,
} from "@/src/actions/form-drafts"
import { enqueueOfflineDailyRecord } from "@/src/lib/offline-daily-queue"
import { cn } from "@/src/lib/utils"

function emptyToUndefined(val: unknown): unknown {
  return val === "" || val === null || val === undefined ? undefined : val
}

function buildFormSchema(entryCount: number) {
  return z.object({
    mortality: z
      .coerce.number({ error: "Entier requis" })
      .int("Doit etre un entier")
      .min(0, "Doit etre >= 0")
      .max(entryCount, `Maximum : ${entryCount} (effectif initial)`),
    feedKg: z
      .coerce.number({ error: "Nombre requis" })
      .min(0, "Doit etre >= 0"),
    feedStockId: z.preprocess(
      emptyToUndefined,
      z.string().cuid("Stock invalide").optional(),
    ),
    waterLiters: z.preprocess(
      emptyToUndefined,
      z.coerce.number().min(0, "Doit etre >= 0").optional(),
    ),
    avgWeightG: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int("Doit etre un entier").positive("Doit etre > 0").optional(),
    ),
    observations: z.string().max(2000, "Maximum 2 000 caracteres").optional(),
  })
}

type ParsedValues = {
  mortality: number
  feedKg: number
  feedStockId?: string
  waterLiters?: number
  avgWeightG?: number
  observations?: string
}

interface DailyFormProps {
  organizationId: string
  batchId: string
  selectedDate: string
  entryCount: number
  isEditMode: boolean
  editingRecordId?: string
  defaultValues: {
    mortality: number
    feedKg: number
    feedStockId?: string | null
    waterLiters?: number | null
    avgWeightG?: number | null
    observations?: string | null
  }
  feedStocks: Array<{
    id: string
    name: string
    quantityKg: number
  }>
  onSuccess: () => void
  onOfflineQueued?: () => void
}

function isOfflineFailure(error: unknown) {
  return (
    (typeof navigator !== "undefined" && !navigator.onLine) ||
    (error instanceof Error && /fetch|network|offline|failed to fetch/i.test(error.message))
  )
}

export function DailyForm({
  organizationId,
  batchId,
  selectedDate,
  entryCount,
  isEditMode,
  editingRecordId,
  defaultValues,
  feedStocks,
  onSuccess,
  onOfflineQueued,
}: DailyFormProps) {
  const draftStorageKey = `sunufarm:draft:daily:${organizationId}:${batchId}:${selectedDate}`
  const draftFormKey = `daily:${organizationId}:${batchId}:${selectedDate}`
  const [detailsOpen, setDetailsOpen] = useState(
    !!(defaultValues.waterLiters || defaultValues.avgWeightG || defaultValues.observations),
  )
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [draftReady, setDraftReady] = useState(false)

  const schema = buildFormSchema(entryCount)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ParsedValues>({
    resolver: zodResolver(schema) as Resolver<ParsedValues>,
    defaultValues: {
      mortality: defaultValues.mortality,
      feedKg: defaultValues.feedKg,
      feedStockId: defaultValues.feedStockId ?? undefined,
      waterLiters: defaultValues.waterLiters ?? undefined,
      avgWeightG: defaultValues.avgWeightG ?? undefined,
      observations: defaultValues.observations ?? "",
    },
  })

  const draftValues = useWatch({ control })

  useEffect(() => {
    if (isEditMode || typeof window === "undefined") {
      setDraftReady(true)
      return
    }

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
        ) as Partial<ParsedValues> | null

        if (!parsedDraft) {
          setDraftReady(true)
          return
        }

        reset({
          mortality: parsedDraft.mortality ?? defaultValues.mortality,
          feedKg: parsedDraft.feedKg ?? defaultValues.feedKg,
          feedStockId: parsedDraft.feedStockId ?? defaultValues.feedStockId ?? undefined,
          waterLiters: parsedDraft.waterLiters ?? defaultValues.waterLiters ?? undefined,
          avgWeightG: parsedDraft.avgWeightG ?? defaultValues.avgWeightG ?? undefined,
          observations: parsedDraft.observations ?? defaultValues.observations ?? "",
        })

        if (
          parsedDraft.waterLiters !== undefined ||
          parsedDraft.avgWeightG !== undefined ||
          !!parsedDraft.observations
        ) {
          setDetailsOpen(true)
        }
      } catch {
        window.localStorage.removeItem(draftStorageKey)
      } finally {
        setDraftReady(true)
      }
    }

    void loadDraft()
  }, [
    defaultValues.avgWeightG,
    defaultValues.feedKg,
    defaultValues.feedStockId,
    defaultValues.mortality,
    defaultValues.observations,
    defaultValues.waterLiters,
    draftFormKey,
    draftStorageKey,
    isEditMode,
    organizationId,
    reset,
  ])

  useEffect(() => {
    if (isEditMode || !draftReady || typeof window === "undefined") return

    window.localStorage.setItem(draftStorageKey, JSON.stringify(draftValues))

    const timeout = window.setTimeout(() => {
      void saveFormDraft({
        formKey: draftFormKey,
        organizationId,
        title: "Saisie journaliere",
        payload: draftValues as Record<string, unknown>,
      })
    }, 800)

    return () => window.clearTimeout(timeout)
  }, [draftFormKey, draftReady, draftStorageKey, draftValues, isEditMode, organizationId])

  const clearDrafts = async () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(draftStorageKey)
    }
    await clearFormDraft({ formKey: draftFormKey, organizationId })
  }

  const queueCurrentEntry = async (data: ParsedValues) => {
    await enqueueOfflineDailyRecord({
      organizationId,
      batchId,
      dateIso: new Date(`${selectedDate}T00:00:00Z`).toISOString(),
      mortality: data.mortality,
      feedKg: data.feedKg,
      feedStockId: data.feedStockId,
      waterLiters: data.waterLiters,
      avgWeightG: data.avgWeightG,
      observations: data.observations,
    })

    await clearDrafts()
    toast.success("Saisie enregistree hors ligne et mise en attente")
    onOfflineQueued?.()
  }

  const onSubmit = async (data: ParsedValues) => {
    setSubmitError(null)

    if (isEditMode && editingRecordId) {
      const result = await updateDailyRecord({
        organizationId,
        batchId,
        dailyRecordId: editingRecordId,
        mortality: data.mortality,
        feedKg: data.feedKg,
        feedStockId: data.feedStockId ?? null,
        waterLiters: data.waterLiters,
        avgWeightG: data.avgWeightG,
        observations: data.observations,
      })

      if (result.success) {
        toast.success("Saisie corrigee")
        onSuccess()
      } else {
        setSubmitError(result.error)
      }
      return
    }

    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await queueCurrentEntry(data)
        return
      }

      const result = await createDailyRecord({
        organizationId,
        batchId,
        date: new Date(`${selectedDate}T00:00:00Z`),
        mortality: data.mortality,
        feedKg: data.feedKg,
        feedStockId: data.feedStockId,
        waterLiters: data.waterLiters,
        avgWeightG: data.avgWeightG,
        observations: data.observations,
      })

      if (result.success) {
        await clearDrafts()
        toast.success("Saisie enregistree")
        onSuccess()
      } else {
        setSubmitError(result.error)
      }
    } catch (error) {
      if (!isOfflineFailure(error)) {
        throw error
      }

      await queueCurrentEntry(data)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {!isEditMode && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Brouillon automatique actif pour ce lot et cette date sur cet appareil et sur votre compte.
        </div>
      )}

      <NumericField
        id="mortality"
        label="Mortalite"
        unit="sujets"
        integer
        placeholder="0"
        error={errors.mortality?.message}
        {...register("mortality")}
      />

      <NumericField
        id="feedKg"
        label="Aliment distribue"
        unit="kg"
        placeholder="0"
        error={errors.feedKg?.message}
        {...register("feedKg")}
      />

      <div className="space-y-1.5">
        <label htmlFor="feedStockId" className="block text-sm font-medium text-gray-700">
          Stock aliment utilise
        </label>
        <select
          id="feedStockId"
          className="h-[52px] w-full rounded-xl border border-gray-300 bg-white px-4 text-base text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-green-600"
          {...register("feedStockId")}
        >
          <option value="">- Selectionner un stock -</option>
          {feedStocks.map((stock) => (
            <option key={stock.id} value={stock.id}>
              {stock.name} · {stock.quantityKg.toLocaleString("fr-SN")} kg
            </option>
          ))}
        </select>
        {feedStocks.length === 0 ? (
          <p className="text-sm text-amber-700">
            Aucun stock aliment disponible pour cette ferme. Creez d&apos;abord un article dans Stock.
          </p>
        ) : (
          <p className="text-sm text-gray-500">
            La quantite distribuee sera automatiquement sortie du stock choisi.
          </p>
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setDetailsOpen((value) => !value)}
          className="rounded py-1 text-sm font-medium text-green-600 hover:text-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
          aria-expanded={detailsOpen}
        >
          <span className="inline-flex items-center gap-1.5">
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-150",
                detailsOpen && "rotate-180",
              )}
              aria-hidden
            />
            {detailsOpen ? "Masquer les details" : "+ Ajouter des details"}
          </span>
        </button>

        <div className={cn("mt-4 space-y-5", !detailsOpen && "hidden")}>
          <NumericField
            id="waterLiters"
            label="Eau consommee"
            unit="litres"
            placeholder="-"
            error={errors.waterLiters?.message}
            {...register("waterLiters")}
          />

          <NumericField
            id="avgWeightG"
            label="Poids moyen"
            unit="g"
            integer
            placeholder="-"
            error={errors.avgWeightG?.message}
            {...register("avgWeightG")}
          />

          <div className="space-y-1.5">
            <label htmlFor="observations" className="block text-sm font-medium text-gray-700">
              Observations
            </label>
            <textarea
              id="observations"
              rows={3}
              placeholder="Notes libres, incidents, comportements observes..."
              className="w-full resize-none rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-green-600"
              {...register("observations")}
            />
            {errors.observations && (
              <p className="text-sm text-red-600" role="alert">
                {errors.observations.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {submitError && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {submitError}
        </div>
      )}

      <Button type="submit" variant="primary" className="w-full" loading={isSubmitting}>
        {isEditMode ? "Enregistrer la correction" : "Enregistrer"}
      </Button>
    </form>
  )
}
