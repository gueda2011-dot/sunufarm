import { z } from "zod"
import {
  dateSchema,
  nonNegativeIntSchema,
  nonNegativeNumberSchema,
  optionalIdSchema,
  requiredIdSchema,
} from "@/src/lib/validators"

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
  audioRecordUrl: z.string().url().max(1000).optional(),
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
