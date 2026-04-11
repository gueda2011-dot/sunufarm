"use client"

import { createDailyRecordSchema, buildInvalidInputMessage } from "@/src/lib/daily-record-validation"
import { findServerId } from "@/src/lib/offline/sync/mappings"

function normalizeOptionalString(value: unknown) {
  if (value === "" || value === null || value === undefined) {
    return undefined
  }

  return String(value).trim()
}

function normalizeOptionalNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) {
    return undefined
  }

  const normalized = typeof value === "string" ? Number(value) : value
  return typeof normalized === "number" && Number.isFinite(normalized) ? normalized : normalized
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

export class DailySyncValidationError extends Error {
  constructor(
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
    readonly originalPayload?: unknown,
    readonly mappedPayload?: unknown,
    readonly finalPayload?: unknown,
  ) {
    super(message)
    this.name = "DailySyncValidationError"
  }
}

export interface DailySyncDebugPayload {
  originalPayload: Record<string, unknown>
  mappedPayload: Record<string, unknown>
  finalPayload: Record<string, unknown>
}

export async function buildDailyServerPayload(
  payload: Record<string, unknown>,
  options?: {
    fallbackLocalId?: string
  },
) {
  const originalPayload = payload
  const rawDate = payload.dateIso ?? payload.date
  const clientMutationId = normalizeOptionalString(payload.clientMutationId) ?? options?.fallbackLocalId
  const batchInputId = normalizeOptionalString(payload.batchId)
  const feedStockInputId = normalizeOptionalString(payload.feedStockId)

  if (!rawDate) {
    throw new DailySyncValidationError(
      "date invalide",
      { date: ["Date requise"] },
      originalPayload,
    )
  }

  if (!clientMutationId) {
    throw new DailySyncValidationError(
      "clientMutationId manquant",
      { clientMutationId: ["Client mutation id requis"] },
      originalPayload,
    )
  }

  if (!batchInputId) {
    throw new DailySyncValidationError(
      "batchId manquant",
      { batchId: ["Lot requis"] },
      originalPayload,
    )
  }

  const batchId = await resolveRelationId("batch", batchInputId)
  const feedStockId = await resolveRelationId("stock_item", feedStockInputId)

  const mappedPayload = {
    ...originalPayload,
    clientMutationId,
    batchId,
    ...(feedStockId !== undefined ? { feedStockId } : {}),
    date: rawDate instanceof Date ? rawDate.toISOString() : String(rawDate),
  }

  const finalPayload = {
    organizationId: normalizeOptionalString(payload.organizationId),
    batchId,
    clientMutationId,
    date: rawDate instanceof Date ? rawDate : new Date(String(rawDate)),
    mortality: Number(payload.mortality),
    feedKg: Number(payload.feedKg),
    ...(feedStockId !== undefined ? { feedStockId } : {}),
    ...(normalizeOptionalNumber(payload.waterLiters) !== undefined ? { waterLiters: normalizeOptionalNumber(payload.waterLiters) } : {}),
    ...(normalizeOptionalNumber(payload.avgWeightG) !== undefined ? { avgWeightG: normalizeOptionalNumber(payload.avgWeightG) } : {}),
    ...(normalizeOptionalString(payload.observations) !== undefined ? { observations: normalizeOptionalString(payload.observations) } : {}),
    ...(normalizeOptionalNumber(payload.temperatureMin) !== undefined ? { temperatureMin: normalizeOptionalNumber(payload.temperatureMin) } : {}),
    ...(normalizeOptionalNumber(payload.temperatureMax) !== undefined ? { temperatureMax: normalizeOptionalNumber(payload.temperatureMax) } : {}),
    ...(normalizeOptionalNumber(payload.humidity) !== undefined ? { humidity: normalizeOptionalNumber(payload.humidity) } : {}),
    ...(normalizeOptionalString(payload.audioRecordUrl) !== undefined ? { audioRecordUrl: normalizeOptionalString(payload.audioRecordUrl) } : {}),
  }

  const parsed = createDailyRecordSchema.safeParse(finalPayload)
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors
    throw new DailySyncValidationError(
      buildInvalidInputMessage(fieldErrors),
      fieldErrors,
      originalPayload,
      mappedPayload,
      {
        ...finalPayload,
        date: finalPayload.date instanceof Date ? finalPayload.date.toISOString() : finalPayload.date,
      },
    )
  }

  return {
    serverPayload: parsed.data,
    debug: {
      originalPayload,
      mappedPayload,
      finalPayload: {
        ...parsed.data,
        date: parsed.data.date.toISOString(),
      },
    } satisfies DailySyncDebugPayload,
  }
}
