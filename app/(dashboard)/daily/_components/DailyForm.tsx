"use client"

import { useEffect, useState, useRef } from "react"
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
import { validateCreateDailyRecordInput } from "@/src/lib/daily-record-validation"
import { fetchLocalWeather } from "@/src/lib/weather"
import {
  clearFormDraft,
  getFormDraft,
  saveFormDraft,
} from "@/src/actions/form-drafts"
import {
  createClientMutationId,
  enqueueOfflineDailyRecord,
} from "@/src/lib/offline-mutation-outbox"
import { cn } from "@/src/lib/utils"
import { AudioRecorder } from "./AudioRecorder"

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
    temperatureMin: z.preprocess(emptyToUndefined, z.coerce.number().optional()),
    temperatureMax: z.preprocess(emptyToUndefined, z.coerce.number().optional()),
    humidity: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(100).optional()),
    observations: z.string().max(2000, "Maximum 2 000 caracteres").optional(),
    audioRecordUrl: z.string().url().optional().nullable(),
  })
}

type ParsedValues = {
  mortality: number
  feedKg: number
  feedStockId?: string
  waterLiters?: number
  avgWeightG?: number
  temperatureMin?: number
  temperatureMax?: number
  humidity?: number
  observations?: string
  audioRecordUrl?: string | null
}

interface DailyActionFailure {
  success: false
  error: string
  fieldErrors?: Record<string, string[]>
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
    temperatureMin?: number | null
    temperatureMax?: number | null
    humidity?: number | null
    observations?: string | null
    audioRecordUrl?: string | null
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
    !!(
      defaultValues.waterLiters ||
      defaultValues.avgWeightG ||
      defaultValues.temperatureMin ||
      defaultValues.temperatureMax ||
      defaultValues.humidity ||
      defaultValues.observations
    ),
  )
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitFieldErrors, setSubmitFieldErrors] = useState<Record<string, string[]>>({})
  const [draftReady, setDraftReady] = useState(false)
  const [isFetchingWeather, setIsFetchingWeather] = useState(false)

  const schema = buildFormSchema(entryCount)

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ParsedValues>({
    resolver: zodResolver(schema) as Resolver<ParsedValues>,
    defaultValues: {
      mortality: defaultValues.mortality,
      feedKg: defaultValues.feedKg,
      feedStockId: defaultValues.feedStockId ?? undefined,
      waterLiters: defaultValues.waterLiters ?? undefined,
      avgWeightG: defaultValues.avgWeightG ?? undefined,
      temperatureMin: defaultValues.temperatureMin ?? undefined,
      temperatureMax: defaultValues.temperatureMax ?? undefined,
      humidity: defaultValues.humidity ?? undefined,
      observations: defaultValues.observations ?? "",
      audioRecordUrl: defaultValues.audioRecordUrl ?? null,
    },
  })

  const draftValues = useWatch({ control })
  const hasAutoFetchedWeather = useRef(false)

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
          temperatureMin: parsedDraft.temperatureMin ?? defaultValues.temperatureMin ?? undefined,
          temperatureMax: parsedDraft.temperatureMax ?? defaultValues.temperatureMax ?? undefined,
          humidity: parsedDraft.humidity ?? defaultValues.humidity ?? undefined,
          observations: parsedDraft.observations ?? defaultValues.observations ?? "",
          audioRecordUrl: parsedDraft.audioRecordUrl ?? defaultValues.audioRecordUrl ?? null,
        })

        if (
          parsedDraft.waterLiters !== undefined ||
          parsedDraft.avgWeightG !== undefined ||
          parsedDraft.temperatureMin !== undefined ||
          parsedDraft.temperatureMax !== undefined ||
          parsedDraft.humidity !== undefined ||
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
    defaultValues.audioRecordUrl,
    defaultValues.humidity,
    defaultValues.mortality,
    defaultValues.observations,
    defaultValues.temperatureMax,
    defaultValues.temperatureMin,
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

  useEffect(() => {
    // Si c'est en edition, ou pas encore charge, ou deja fetch, on ignore
    if (!draftReady || isEditMode || hasAutoFetchedWeather.current) return;

    // Si on a deja une temperture min existante dans le brouillon, on n'ecrase pas
    if (draftValues.temperatureMin !== undefined || draftValues.temperatureMax !== undefined) {
      hasAutoFetchedWeather.current = true;
      return;
    }

    if (navigator.geolocation) {
      hasAutoFetchedWeather.current = true;
      setIsFetchingWeather(true);
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const weather = await fetchLocalWeather(position.coords.latitude, position.coords.longitude, selectedDate);
            if (weather) {
              setValue("temperatureMin", weather.temperatureMin, { shouldDirty: true });
              setValue("temperatureMax", weather.temperatureMax, { shouldDirty: true });
              setValue("humidity", weather.humidity, { shouldDirty: true });
            }
          } catch (error) {
            console.error("Auto weather fetch failed", error);
          } finally {
            setIsFetchingWeather(false);
          }
        },
        () => {
          setIsFetchingWeather(false); // Silencieux si l'utilisateur refuse ou si echec GPS
        }
      );
    }
  }, [draftReady, isEditMode, draftValues.temperatureMin, draftValues.temperatureMax, selectedDate, setValue]);

  const clearDrafts = async () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(draftStorageKey)
    }
    await clearFormDraft({ formKey: draftFormKey, organizationId })
  }

  function buildCreatePayload(data: ParsedValues) {
    return {
      clientMutationId: createClientMutationId("daily"),
      organizationId,
      batchId,
      date: new Date(`${selectedDate}T00:00:00Z`),
      mortality: data.mortality,
      feedKg: data.feedKg,
      feedStockId: data.feedStockId,
      waterLiters: data.waterLiters,
      avgWeightG: data.avgWeightG,
      temperatureMin: data.temperatureMin,
      temperatureMax: data.temperatureMax,
      humidity: data.humidity,
      observations: data.observations,
      audioRecordUrl: data.audioRecordUrl,
    }
  }

  function applyActionFailure(result: DailyActionFailure, payload: unknown) {
    console.error("[daily-form] validation/action failure", {
      payload,
      error: result.error,
      fieldErrors: result.fieldErrors ?? null,
      criticalFields: {
        organizationId,
        batchId,
        feedStockId: typeof payload === "object" && payload !== null && "feedStockId" in payload
          ? (payload as { feedStockId?: string }).feedStockId ?? null
          : null,
        date: typeof payload === "object" && payload !== null && "date" in payload
          ? (payload as { date?: Date }).date?.toISOString?.() ?? String((payload as { date?: unknown }).date)
          : null,
        userId: "derived-from-session-server-side",
      },
    })

    setSubmitFieldErrors(result.fieldErrors ?? {})
    setSubmitError(result.error)
  }

  const queueCurrentEntry = async (data: ParsedValues) => {
    const clientMutationId = createClientMutationId("daily")
    const dateIso = new Date(`${selectedDate}T00:00:00Z`).toISOString()

    await enqueueOfflineDailyRecord({
      clientMutationId,
      organizationId,
      batchId,
      dateIso,
      mortality: data.mortality,
      feedKg: data.feedKg,
      feedStockId: data.feedStockId,
      waterLiters: data.waterLiters,
      avgWeightG: data.avgWeightG,
      temperatureMin: data.temperatureMin,
      temperatureMax: data.temperatureMax,
      humidity: data.humidity,
      observations: data.observations,
      audioRecordUrl: data.audioRecordUrl,
    })

    await clearDrafts()
    toast.success("Saisie enregistree hors ligne et mise en attente")
    onOfflineQueued?.()
  }

  const onSubmit = async (data: ParsedValues) => {
    setSubmitError(null)
    setSubmitFieldErrors({})

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
        temperatureMin: data.temperatureMin,
        temperatureMax: data.temperatureMax,
        humidity: data.humidity,
        observations: data.observations,
        audioRecordUrl: data.audioRecordUrl,
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

      const payload = buildCreatePayload(data)
      const localValidation = validateCreateDailyRecordInput(payload)

      if (!localValidation.success) {
        console.error("[daily-form] local validation failed", {
          payload,
          fieldErrors: localValidation.fieldErrors,
          issues: localValidation.issues,
          criticalFields: {
            organizationId,
            batchId,
            feedStockId: payload.feedStockId ?? null,
            date: payload.date.toISOString(),
            userId: "derived-from-session-server-side",
          },
        })
        setSubmitFieldErrors(localValidation.fieldErrors)
        setSubmitError(localValidation.message)
        return
      }

      console.info("[daily-form] local validation passed", {
        payload: {
          ...payload,
          date: payload.date.toISOString(),
        },
        criticalFields: {
          organizationId,
          batchId,
          feedStockId: payload.feedStockId ?? null,
          date: payload.date.toISOString(),
          userId: "derived-from-session-server-side",
        },
      })

      const result = await createDailyRecord(localValidation.data)

      if (result.success) {
        await clearDrafts()
        toast.success("Saisie enregistree")
        onSuccess()
      } else {
        applyActionFailure(result as DailyActionFailure, payload)
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
      {submitError && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          <p>{submitError}</p>
          {Object.keys(submitFieldErrors).length > 0 ? (
            <div className="mt-2 space-y-1 text-xs">
              {Object.entries(submitFieldErrors).map(([field, messages]) => (
                <p key={field}>
                  <span className="font-semibold">{field}</span>: {messages.join(", ")}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      )}

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
        {submitFieldErrors.feedStockId ? (
          <p className="text-sm text-red-600" role="alert">
            {submitFieldErrors.feedStockId.join(", ")}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50/50 p-4">
        <div className="text-sm text-blue-900">
          <p className="font-medium">Meteo et environnement</p>
          <p className="text-blue-700">Recuperez les donnees locales automatiquement (GPS requis)</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={isFetchingWeather}
          onClick={() => {
            if (!navigator.geolocation) {
              toast.error("Votre navigateur ne supporte pas la geolocalisation");
              return;
            }
            setIsFetchingWeather(true);
            navigator.geolocation.getCurrentPosition(
              async (position) => {
                const weather = await fetchLocalWeather(position.coords.latitude, position.coords.longitude, selectedDate);
                if (weather) {
                  setValue("temperatureMin", weather.temperatureMin, { shouldDirty: true });
                  setValue("temperatureMax", weather.temperatureMax, { shouldDirty: true });
                  setValue("humidity", weather.humidity, { shouldDirty: true });
                  toast.success("Meteo recuperee avec succes");
                } else {
                  toast.error("Impossible de recuperer la meteo");
                }
                setIsFetchingWeather(false);
              },
              () => {
                toast.error("Localisation introuvable. Verifiez vos permissions.");
                setIsFetchingWeather(false);
              }
            );
          }}
        >
          {isFetchingWeather ? "..." : "Actualiser"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <NumericField
          id="temperatureMin"
          label="Temp. Min"
          unit="°C"
          placeholder="-"
          error={errors.temperatureMin?.message}
          {...register("temperatureMin")}
        />
        <NumericField
          id="temperatureMax"
          label="Temp. Max"
          unit="°C"
          placeholder="-"
          error={errors.temperatureMax?.message}
          {...register("temperatureMax")}
        />
      </div>

      <NumericField
        id="humidity"
        label="Humidite"
        unit="%"
        placeholder="-"
        error={errors.humidity?.message}
        {...register("humidity")}
      />

      <AudioRecorder
        organizationId={organizationId}
        batchId={batchId}
        existingAudioUrl={defaultValues.audioRecordUrl}
        onAudioUploaded={(url) => setValue("audioRecordUrl", url, { shouldDirty: true })}
        disabled={isSubmitting}
      />

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

      <Button type="submit" variant="primary" className="w-full" loading={isSubmitting}>
        {isEditMode ? "Enregistrer la correction" : "Enregistrer"}
      </Button>
    </form>
  )
}
