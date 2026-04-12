import { z } from "zod"
import {
  dateSchema,
  nonNegativeIntSchema,
  nonNegativeNumberSchema,
  optionalIdSchema,
  requiredIdSchema,
} from "@/src/lib/validators"

/**
 * Whitelist des domaines autorisés pour les URLs audio.
 *
 * Stratégie en couches :
 *   1. Si NEXT_PUBLIC_SUPABASE_URL est défini, extraire le hostname exact du projet
 *      (ex: "abcdefghijk.supabase.co") — validation la plus stricte possible.
 *   2. Toujours autoriser *.supabase.co et *.supabase.in comme fallback pour les
 *      environnements où la variable n'est pas injectée (tests, CI, etc.).
 *
 * Exemples d'URLs valides en prod Supabase :
 *   https://abcdefghijk.supabase.co/storage/v1/object/public/audio/file.m4a   ✅
 *   https://abcdefghijk.supabase.co/storage/v1/object/sign/audio/file.m4a    ✅
 *
 * URLs rejetées (SSRF potentiel) :
 *   http://169.254.169.254/latest/meta-data/    ❌ (http, domaine interdit)
 *   https://evil.com/audio.m4a                  ❌ (domaine non autorisé)
 *   https://supabase.co.evil.com/file.m4a        ❌ (endsWith protège contre ce pattern)
 */
function buildAllowedAudioHostnames(): string[] {
  const base = ["supabase.co", "supabase.in"]

  // Ajouter le hostname exact du projet si NEXT_PUBLIC_SUPABASE_URL est défini
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (supabaseUrl) {
    try {
      const { hostname } = new URL(supabaseUrl)
      if (hostname && !base.includes(hostname)) {
        base.unshift(hostname) // Mettre en priorité pour un match exact rapide
      }
    } catch {
      // URL invalide — ignorer silencieusement, le fallback *.supabase.co s'applique
    }
  }

  return base
}

// Évalué une seule fois au chargement du module
const ALLOWED_AUDIO_HOSTNAMES = buildAllowedAudioHostnames()

export function isAllowedAudioUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:") return false
    const { hostname } = url
    return ALLOWED_AUDIO_HOSTNAMES.some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`),
    )
  } catch {
    return false
  }
}

const optionalUrlSchema = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") {
    return undefined
  }

  return value
}, z.string().url().max(1000).refine(
  (url) => isAllowedAudioUrl(url),
  { message: "URL audio non autorisée : seuls les domaines Supabase sont acceptés" },
).optional())

export const dailyClientMutationIdSchema = z.string().trim().min(1).max(100)

export const dailyMortalityDetailSchema = z.object({
  mortalityReasonId: optionalIdSchema,
  count: nonNegativeIntSchema,
  notes: z.string().max(500).optional(),
})

export const createDailyRecordSchema = z.object({
  organizationId: requiredIdSchema,
  batchId: requiredIdSchema,
  clientMutationId: dailyClientMutationIdSchema.optional(),
  date: dateSchema,
  mortality: nonNegativeIntSchema,
  feedKg: nonNegativeNumberSchema,
  feedStockId: optionalIdSchema,
  waterLiters: nonNegativeNumberSchema.optional(),
  temperatureMin: z.number().optional(),
  temperatureMax: z.number().optional(),
  humidity: z.number().min(0).max(100).optional(),
  avgWeightG: z.number().int().positive().optional(),
  observations: z.string().max(2000).optional(),
  audioRecordUrl: optionalUrlSchema,
  mortalityDetails: z.array(dailyMortalityDetailSchema).optional(),
})

export type CreateDailyRecordInput = z.infer<typeof createDailyRecordSchema>

export function flattenZodFieldErrors(error: z.ZodError) {
  return error.flatten().fieldErrors
}

export function formatFieldErrors(fieldErrors: Record<string, string[] | undefined>) {
  const messages = Object.entries(fieldErrors)
    .flatMap(([field, errors]) => (errors ?? []).map((message) => `${field}: ${message}`))

  return messages.length > 0 ? messages.join(" | ") : null
}

export function buildInvalidInputMessage(fieldErrors: Record<string, string[] | undefined>) {
  return formatFieldErrors(fieldErrors) ?? "Donnees invalides"
}

export function validateCreateDailyRecordInput(payload: unknown) {
  const parsed = createDailyRecordSchema.safeParse(payload)

  if (parsed.success) {
    return {
      success: true as const,
      data: parsed.data,
      fieldErrors: {} as Record<string, string[]>,
      message: null,
    }
  }

  const fieldErrors = flattenZodFieldErrors(parsed.error)

  return {
    success: false as const,
    fieldErrors,
    message: buildInvalidInputMessage(fieldErrors),
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
      code: issue.code,
      input: "input" in issue ? issue.input : undefined,
    })),
  }
}
