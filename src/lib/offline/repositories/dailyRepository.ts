"use client"

import type { BatchSummary } from "@/src/actions/batches"
import type { DailyRecordDetail } from "@/src/actions/daily-records"
import { batchesRepository, dailyRepository, stockItemsRepository } from "@/src/lib/offline/repositories"
import type { OfflineRecord } from "@/src/lib/offline/types"

interface DailyFeedStockReference {
  id: string
  farmId: string
  name: string
  quantityKg: number
}

interface DailyLocalPayload {
  clientMutationId: string
  organizationId: string
  batchId: string
  dateIso: string
  mortality: number
  feedKg: number
  feedStockId?: string
  waterLiters?: number
  avgWeightG?: number
  observations?: string
  temperatureMin?: number
  temperatureMax?: number
  humidity?: number
  audioRecordUrl?: string | null
}

interface DailyPendingRow {
  id: string
  date: string
  mortality: number
  feedKg: number
  waterLiters?: number
  audioRecordUrl?: string | null
  isOptimistic: true
  syncStatus: "pending" | "failed" | "conflict"
  syncError?: string
}

function isDailyPayload(value: unknown): value is DailyLocalPayload {
  return typeof value === "object" && value !== null && "batchId" in value && "dateIso" in value
}

function toDailyRecordDetail(record: OfflineRecord<unknown>): DailyRecordDetail | null {
  const payload = record.data
  if (!isDailyPayload(payload)) return null

  return {
    id: record.serverId ?? record.localId,
    organizationId: record.organizationId,
    batchId: payload.batchId,
    date: new Date(payload.dateIso),
    mortality: payload.mortality,
    feedKg: payload.feedKg,
    feedStockId: payload.feedStockId ?? null,
    feedStockName: null,
    waterLiters: payload.waterLiters ?? null,
    temperatureMin: payload.temperatureMin ?? null,
    temperatureMax: payload.temperatureMax ?? null,
    humidity: payload.humidity ?? null,
    avgWeightG: payload.avgWeightG ?? null,
    observations: payload.observations ?? null,
    audioRecordUrl: payload.audioRecordUrl ?? null,
    recordedById: null,
    lockedAt: null,
    isLocked: false,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
    mortalityRecords: [],
  }
}

export async function saveDailyBatchesToLocal(
  organizationId: string,
  batches: BatchSummary[],
) {
  await batchesRepository.upsertMany(
    organizationId,
    batches.map((batch) => ({
      id: batch.id,
      serverId: batch.id,
      data: batch,
    })),
  )
}

export async function loadDailyBatchesFromLocal(organizationId: string): Promise<BatchSummary[] | undefined> {
  const rows = await batchesRepository.getAll(organizationId)
  const batches = rows.map((row) => row.data as BatchSummary)
  return batches.length > 0 ? batches : undefined
}

export async function saveDailyFeedStocksToLocal(
  organizationId: string,
  feedStocks: DailyFeedStockReference[],
) {
  await stockItemsRepository.upsertMany(
    organizationId,
    feedStocks.map((stock) => ({
      id: `feed:${stock.id}`,
      serverId: stock.id,
      data: stock,
    })),
  )
}

export async function loadDailyFeedStocksFromLocal(
  organizationId: string,
): Promise<DailyFeedStockReference[] | undefined> {
  const rows = await stockItemsRepository.getAll(organizationId)
  const feedStocks = rows
    .filter((row) => row.id.startsWith("feed:"))
    .map((row) => row.data as DailyFeedStockReference)
  return feedStocks.length > 0 ? feedStocks : undefined
}

export async function saveDailyRecordsToLocal(
  organizationId: string,
  records: DailyRecordDetail[],
) {
  await dailyRepository.upsertMany(
    records.map((record) => ({
      localId: record.id,
      serverId: record.id,
      organizationId,
      entityType: "daily_entry",
      scope: "daily",
      syncStatus: "synced" as const,
      createdAt: new Date(record.createdAt).toISOString(),
      updatedAt: new Date(record.updatedAt).toISOString(),
      lastSyncAttemptAt: new Date().toISOString(),
      syncError: null,
      label: `Saisie journaliere ${new Date(record.date).toISOString().slice(0, 10)}`,
      data: record,
    })),
  )
}

export async function loadDailyRecordsFromLocal(
  organizationId: string,
  batchId: string,
): Promise<DailyRecordDetail[] | undefined> {
  const rows = await dailyRepository.getAll(organizationId)
  const records = rows
    .map((row) => {
      const serverLike = row.data as Partial<DailyRecordDetail>
      if (serverLike.batchId === batchId && serverLike.date) {
        return {
          ...serverLike,
          id: String(serverLike.id ?? row.serverId ?? row.localId),
          batchId,
          organizationId,
          createdAt: new Date(serverLike.createdAt ?? row.createdAt),
          updatedAt: new Date(serverLike.updatedAt ?? row.updatedAt),
          date: new Date(serverLike.date),
          mortality: Number(serverLike.mortality ?? 0),
          feedKg: Number(serverLike.feedKg ?? 0),
          feedStockId: serverLike.feedStockId ?? null,
          feedStockName: serverLike.feedStockName ?? null,
          waterLiters: serverLike.waterLiters ?? null,
          temperatureMin: serverLike.temperatureMin ?? null,
          temperatureMax: serverLike.temperatureMax ?? null,
          humidity: serverLike.humidity ?? null,
          avgWeightG: serverLike.avgWeightG ?? null,
          observations: serverLike.observations ?? null,
          audioRecordUrl: serverLike.audioRecordUrl ?? null,
          recordedById: serverLike.recordedById ?? null,
          lockedAt: serverLike.lockedAt ? new Date(serverLike.lockedAt) : null,
          isLocked: Boolean(serverLike.isLocked),
          mortalityRecords: serverLike.mortalityRecords ?? [],
        } as DailyRecordDetail
      }

      const localRecord = toDailyRecordDetail(row)
      return localRecord?.batchId === batchId ? localRecord : null
    })
    .filter((record): record is DailyRecordDetail => record !== null)
    .sort((left, right) => right.date.getTime() - left.date.getTime())

  return records.length > 0 ? records : undefined
}

export async function loadPendingDailyRecordsFromLocal(
  organizationId: string,
  batchId: string,
) : Promise<DailyPendingRow[]> {
  const rows = await dailyRepository.getAll(organizationId)
  return rows
    .filter((row) => row.syncStatus !== "synced")
    .filter((row) => isDailyPayload(row.data) && row.data.batchId === batchId)
    .map((row) => ({
      id: row.localId,
      date: (row.data as DailyLocalPayload).dateIso,
      mortality: (row.data as DailyLocalPayload).mortality,
      feedKg: (row.data as DailyLocalPayload).feedKg,
      waterLiters: (row.data as DailyLocalPayload).waterLiters,
      audioRecordUrl: (row.data as DailyLocalPayload).audioRecordUrl,
      isOptimistic: true,
      syncStatus: row.syncStatus as "pending" | "failed" | "conflict",
      syncError: row.syncError ?? undefined,
    }))
}
