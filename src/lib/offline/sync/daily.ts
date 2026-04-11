"use client"

import { z } from "zod"
import { findServerId } from "@/src/lib/offline/sync/mappings"

const optionalStringSchema = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined
  }

  return value
}, z.string().trim().min(1).optional())

const optionalNumberSchema = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined
  }

  const normalized = typeof value === "string" ? Number(value) : value
  return normalized
}, z.number().finite().optional())

const dailySyncPayloadSchema = z.object({
  clientMutationId: z.string().trim().min(1).optional(),
  organizationId: z.string().trim().min(1),
  batchId: z.string().trim().min(1),
  dateIso: z.string().trim().min(1).optional(),
  date: z.union([z.string().trim().min(1), z.date()]).optional(),
  mortality: z.preprocess((value) => Number(value), z.number().int().min(0)),
  feedKg: z.preprocess((value) => Number(value), z.number().finite().min(0)),
  feedStockId: optionalStringSchema,
  waterLiters: optionalNumberSchema.refine(
    (value) => value === undefined || value >= 0,
    "waterLiters doit etre >= 0",
  ),
  avgWeightG: optionalNumberSchema.refine(
    (value) => value === undefined || (Number.isInteger(value) && value > 0),
    "avgWeightG doit etre un entier > 0",
  ),
  observations: z.preprocess((value) => {
    if (value === null || value === undefined) {
      return undefined
    }

    const normalized = String(value).trim()
    return normalized === "" ? undefined : normalized
  }, z.string().max(2000).optional()),
  temperatureMin: optionalNumberSchema,
  temperatureMax: optionalNumberSchema,
  humidity: optionalNumberSchema.refine(
    (value) => value === undefined || (value >= 0 && value <= 100),
    "humidity doit etre comprise entre 0 et 100",
  ),
  audioRecordUrl: z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined
    }

    return value
  }, z.string().url().max(1000).optional()),
})

export interface DailyServerPayload {
  clientMutationId: string
  organizationId: string
  batchId: string
  date: Date
  mortality: number
  feedKg: number
  feedStockId?: string
  waterLiters?: number
  avgWeightG?: number
  observations?: string
  temperatureMin?: number
  temperatureMax?: number
  humidity?: number
  audioRecordUrl?: string
}

export interface DailySyncDebugPayload {
  originalPayload: Record<string, unknown>
  mappedPayload: Record<string, unknown>
}

function looksLikeServerId(value: string) {
  return /^[a-z0-9]{24,32}$/i.test(value)
}

async function resolveRelationId(entityType: string, value: string | undefined) {
  if (!value) return undefined
  if (looksLikeServerId(value)) return value

  const mapped = await findServerId(entityType, value)
  return mapped ?? value
}

export async function buildDailyServerPayload(
  payload: Record<string, unknown>,
  options?: {
    fallbackLocalId?: string
  },
): Promise<{
  serverPayload: DailyServerPayload
  debug: DailySyncDebugPayload
}> {
  const parsed = dailySyncPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join(", "))
  }

  const rawDate = parsed.data.dateIso ?? parsed.data.date
  if (!rawDate) {
    throw new Error("dateIso manquant")
  }

  const normalizedDate = rawDate instanceof Date ? rawDate : new Date(rawDate)
  if (Number.isNaN(normalizedDate.getTime())) {
    throw new Error("dateIso invalide")
  }

  const clientMutationId = parsed.data.clientMutationId ?? options?.fallbackLocalId
  if (!clientMutationId) {
    throw new Error("clientMutationId manquant")
  }

  const batchId = await resolveRelationId("batch", parsed.data.batchId)
  if (!batchId || !looksLikeServerId(batchId)) {
    throw new Error("batchId non mappe vers un id serveur valide")
  }

  const feedStockId = await resolveRelationId("stock_item", parsed.data.feedStockId)
  if (feedStockId !== undefined && !looksLikeServerId(feedStockId)) {
    throw new Error("feedStockId non mappe vers un id serveur valide")
  }

  const mappedPayload: DailyServerPayload = {
    clientMutationId,
    organizationId: parsed.data.organizationId,
    batchId,
    date: normalizedDate,
    mortality: parsed.data.mortality,
    feedKg: parsed.data.feedKg,
    ...(feedStockId ? { feedStockId } : {}),
    ...(parsed.data.waterLiters !== undefined ? { waterLiters: parsed.data.waterLiters } : {}),
    ...(parsed.data.avgWeightG !== undefined ? { avgWeightG: parsed.data.avgWeightG } : {}),
    ...(parsed.data.observations !== undefined ? { observations: parsed.data.observations } : {}),
    ...(parsed.data.temperatureMin !== undefined ? { temperatureMin: parsed.data.temperatureMin } : {}),
    ...(parsed.data.temperatureMax !== undefined ? { temperatureMax: parsed.data.temperatureMax } : {}),
    ...(parsed.data.humidity !== undefined ? { humidity: parsed.data.humidity } : {}),
    ...(parsed.data.audioRecordUrl !== undefined ? { audioRecordUrl: parsed.data.audioRecordUrl } : {}),
  }

  return {
    serverPayload: mappedPayload,
    debug: {
      originalPayload: payload,
      mappedPayload: {
        ...mappedPayload,
        date: mappedPayload.date.toISOString(),
      },
    },
  }
}
