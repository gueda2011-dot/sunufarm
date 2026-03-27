"use client"

/**
 * SunuFarm — Formulaire saisie journalière
 *
 * Périmètre MVP (ajustement 4) : mortality, feedKg, waterLiters, avgWeightG,
 * observations uniquement. Pas d'introduction d'autres champs backend.
 *
 * Validations (ajustements 2 + 3) :
 *   - mortality > entryCount = erreur BLOQUANTE (pas un warning)
 *   - Champs optionnels vides : z.preprocess(emptyToUndefined, ...) — pas de
 *     z.coerce.number() nu sur champ optionnel (évite "" → 0)
 *
 * Doublon hors fenêtre (ajustement 1) :
 *   Si le doublon n'est pas dans les 14 records chargés, le serveur retourne
 *   "Une saisie existe déjà pour ce lot à cette date" — affiché en erreur inline.
 */

import { useEffect, useState }         from "react"
import { useForm, useWatch, type Resolver } from "react-hook-form"
import { zodResolver }                 from "@hookform/resolvers/zod"
import { z }                           from "zod"
import { toast }                       from "sonner"
import { ChevronDown }                 from "lucide-react"
import { Button }                      from "@/src/components/ui/button"
import { NumericField }                from "./NumericField"
import {
  createDailyRecord,
  updateDailyRecord,
}                                      from "@/src/actions/daily-records"
import { cn }                          from "@/src/lib/utils"

// ---------------------------------------------------------------------------
// Schéma Zod
// ---------------------------------------------------------------------------

/**
 * Convertit "" / null / undefined en undefined avant coercition.
 * Ajustement 3 : évite que z.coerce.number() transforme "" en 0
 * sur les champs optionnels.
 */
function emptyToUndefined(val: unknown): unknown {
  return val === "" || val === null || val === undefined ? undefined : val
}

/**
 * Construit le schéma avec entryCount pour la validation bloquante.
 * Le composant est re-keyed par son parent quand entryCount change (nouveau lot)
 * donc buildFormSchema est appelé à la création du composant uniquement.
 * Ajustement 2 : mortality > entryCount = erreur bloquante.
 */
function buildFormSchema(entryCount: number) {
  return z.object({
    // Zod v4 : "error" remplace "invalid_type_error" (API v3)
    mortality: z
      .coerce.number({ error: "Entier requis" })
      .int("Doit être un entier")
      .min(0, "Doit être ≥ 0")
      .max(entryCount, `Maximum : ${entryCount} (effectif initial)`),

    feedKg: z
      .coerce.number({ error: "Nombre requis" })
      .min(0, "Doit être ≥ 0"),

    // Ajustement 3 : "" → undefined avant la coercition
    waterLiters: z.preprocess(
      emptyToUndefined,
      z.coerce.number().min(0, "Doit être ≥ 0").optional(),
    ),

    avgWeightG: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int("Doit être un entier").positive("Doit être > 0").optional(),
    ),

    observations: z.string().max(2000, "Maximum 2 000 caractères").optional(),
  })
}

/**
 * Type des valeurs du formulaire après parsing Zod (output).
 *
 * Défini explicitement plutôt que via z.infer<> car z.coerce.number() et
 * z.preprocess() ont un input type "unknown" qui crée un mismatch TypeScript
 * entre Resolver<z.input<Schema>> (retourné par zodResolver) et
 * useForm<z.output<Schema>>. Le cast Resolver<ParsedValues> ci-dessous résout
 * ce décalage — accepté car zodResolver fait bien la transformation en runtime.
 */
type ParsedValues = {
  mortality:     number
  feedKg:        number
  waterLiters?:  number
  avgWeightG?:   number
  observations?: string
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DailyFormProps {
  organizationId:   string
  batchId:          string
  selectedDate:     string  // YYYY-MM-DD
  entryCount:       number
  isEditMode:       boolean
  editingRecordId?: string
  defaultValues: {
    mortality:     number
    feedKg:        number
    waterLiters?:  number | null
    avgWeightG?:   number | null
    observations?: string | null
  }
  onSuccess: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DailyForm({
  organizationId,
  batchId,
  selectedDate,
  entryCount,
  isEditMode,
  editingRecordId,
  defaultValues,
  onSuccess,
}: DailyFormProps) {
  const draftStorageKey = `sunufarm:draft:daily:${organizationId}:${batchId}:${selectedDate}`
  // Ouvrir la section détails si des valeurs optionnelles existent déjà
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
    // Cast nécessaire : zodResolver retourne Resolver<z.input<Schema>> où les
    // champs coercés ont le type "unknown". ParsedValues (z.output) est correct
    // en runtime — le resolver fait bien la transformation.
    resolver: zodResolver(schema) as Resolver<ParsedValues>,
    defaultValues: {
      mortality:    defaultValues.mortality,
      feedKg:       defaultValues.feedKg,
      waterLiters:  defaultValues.waterLiters  ?? undefined,
      avgWeightG:   defaultValues.avgWeightG   ?? undefined,
      observations: defaultValues.observations ?? "",
    },
  })
  const draftValues = useWatch({ control })

  useEffect(() => {
    if (isEditMode || typeof window === "undefined") {
      setDraftReady(true)
      return
    }

    const rawDraft = window.localStorage.getItem(draftStorageKey)
    if (!rawDraft) {
      setDraftReady(true)
      return
    }

    try {
      const parsedDraft = JSON.parse(rawDraft) as Partial<ParsedValues>
      reset({
        mortality: parsedDraft.mortality ?? defaultValues.mortality,
        feedKg: parsedDraft.feedKg ?? defaultValues.feedKg,
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
  }, [
    defaultValues.avgWeightG,
    defaultValues.feedKg,
    defaultValues.mortality,
    defaultValues.observations,
    defaultValues.waterLiters,
    draftStorageKey,
    isEditMode,
    reset,
  ])

  useEffect(() => {
    if (isEditMode || !draftReady || typeof window === "undefined") return
    window.localStorage.setItem(draftStorageKey, JSON.stringify(draftValues))
  }, [draftReady, draftStorageKey, draftValues, isEditMode])

  const onSubmit = async (data: ParsedValues) => {
    setSubmitError(null)

    if (isEditMode && editingRecordId) {
      // ── Mise à jour ──────────────────────────────────────────────────────
      const result = await updateDailyRecord({
        organizationId,
        batchId,
        dailyRecordId: editingRecordId,
        mortality:     data.mortality,
        feedKg:        data.feedKg,
        waterLiters:   data.waterLiters,
        avgWeightG:    data.avgWeightG,
        observations:  data.observations,
      })

      if (result.success) {
        if (!isEditMode && typeof window !== "undefined") {
          window.localStorage.removeItem(draftStorageKey)
        }
        toast.success("Saisie corrigée")
        onSuccess()
      } else {
        setSubmitError(result.error)
      }
    } else {
      // ── Création ─────────────────────────────────────────────────────────
      // La date locale YYYY-MM-DD est envoyée normalisée en UTC minuit.
      // Ajustement 1 : si doublon hors fenêtre des 14 records, le serveur
      // retourne "Une saisie existe déjà..." — affiché dans submitError ci-dessous.
      const result = await createDailyRecord({
        organizationId,
        batchId,
        date:         new Date(`${selectedDate}T00:00:00Z`),
        mortality:    data.mortality,
        feedKg:       data.feedKg,
        waterLiters:  data.waterLiters,
        avgWeightG:   data.avgWeightG,
        observations: data.observations,
      })

      if (result.success) {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(draftStorageKey)
        }
        toast.success("Saisie enregistrée")
        onSuccess()
      } else {
        setSubmitError(result.error)
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {!isEditMode && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Brouillon automatique actif pour ce lot et cette date sur cet appareil.
        </div>
      )}

      {/* ── Mortalité ────────────────────────────────────────────────────── */}
      <NumericField
        id="mortality"
        label="Mortalité"
        unit="sujets"
        integer
        placeholder="0"
        error={errors.mortality?.message}
        {...register("mortality")}
      />

      {/* ── Aliment distribué ────────────────────────────────────────────── */}
      <NumericField
        id="feedKg"
        label="Aliment distribué"
        unit="kg"
        placeholder="0"
        error={errors.feedKg?.message}
        {...register("feedKg")}
      />

      {/* ── Section repliable — détails optionnels ───────────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-green-600 hover:text-green-700 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 rounded"
          aria-expanded={detailsOpen}
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform duration-150",
              detailsOpen && "rotate-180",
            )}
            aria-hidden
          />
          {detailsOpen ? "Masquer les détails" : "+ Ajouter des détails"}
        </button>

        <div className={cn(!detailsOpen && "hidden", "mt-4 space-y-5")}>

          {/* Eau ─────────────────────────────────────────────────────────── */}
          <NumericField
            id="waterLiters"
            label="Eau consommée"
            unit="litres"
            placeholder="—"
            error={errors.waterLiters?.message}
            {...register("waterLiters")}
          />

          {/* Poids moyen ──────────────────────────────────────────────────── */}
          <NumericField
            id="avgWeightG"
            label="Poids moyen"
            unit="g"
            integer
            placeholder="—"
            error={errors.avgWeightG?.message}
            {...register("avgWeightG")}
          />

          {/* Observations ────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <label
              htmlFor="observations"
              className="block text-sm font-medium text-gray-700"
            >
              Observations
            </label>
            <textarea
              id="observations"
              rows={3}
              placeholder="Notes libres, incidents, comportements observés…"
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent resize-none"
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

      {/* ── Erreur serveur (doublon hors fenêtre, permission, etc.) ──────── */}
      {submitError && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {submitError}
        </div>
      )}

      {/* ── Bouton principal ─────────────────────────────────────────────── */}
      <Button
        type="submit"
        variant="primary"
        className="w-full"
        loading={isSubmitting}
      >
        {isEditMode ? "Enregistrer la correction" : "Enregistrer"}
      </Button>
    </form>
  )
}
