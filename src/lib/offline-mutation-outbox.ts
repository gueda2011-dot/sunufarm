"use client"

import { emitOfflineEvent, OFFLINE_EVENTS, subscribeOfflineEvent } from "@/src/lib/offline/events"
import {
  dailyRepository,
  eggProductionRepository,
  healthRepository,
  purchasesRepository,
  salesRepository,
  stockMovementRepository,
} from "@/src/lib/offline/repositories"
import { createOfflineCommand } from "@/src/lib/offline/sync/commands"
import { clearSyncErrors } from "@/src/lib/offline/sync/errors"
import { runOfflineSync } from "@/src/lib/offline/sync/engine"
import {
  deleteSyncCommand,
  enqueueSyncCommand,
  getSyncCommand,
  listPendingSyncCommands,
  updateSyncCommandStatus,
} from "@/src/lib/offline/sync/queue"
import type { OfflineModuleScope } from "@/src/lib/offline/types"

const SYNC_META_KEY = "sunufarm:offline-sync-meta"

export interface OfflineDailyQueuePayload {
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

export interface OfflineVaccinationQueuePayload {
  clientMutationId: string
  organizationId: string
  batchId: string
  date: string
  vaccineName: string
  route?: string
  dose?: string
  countVaccinated: number
  medicineStockId?: string
  medicineQuantity?: number
  notes?: string
}

export interface OfflineExpenseQueuePayload {
  clientMutationId: string
  organizationId: string
  date: string
  description: string
  amountFcfa: number
  reference?: string
  notes?: string
}

export interface OfflineTreatmentQueuePayload {
  clientMutationId: string
  organizationId: string
  batchId: string
  startDate: string
  medicineName: string
  dose?: string
  durationDays?: number
  countTreated?: number
  medicineStockId?: string
  medicineQuantity?: number
  indication?: string
  notes?: string
}

export interface OfflineSaleQueueItemPayload {
  batchId?: string
  description: string
  quantity: number
  unit: "KG" | "PIECE" | "PLATEAU" | "CAISSE"
  unitPriceFcfa: number
}

export interface OfflineSaleQueuePayload {
  clientMutationId: string
  organizationId: string
  customerId?: string
  saleDate: string
  productType: "POULET_VIF" | "OEUF" | "FIENTE"
  notes?: string
  items: OfflineSaleQueueItemPayload[]
}

export interface OfflineFeedMovementQueuePayload {
  clientMutationId: string
  organizationId: string
  feedStockId: string
  type: "ENTREE" | "SORTIE" | "INVENTAIRE" | "AJUSTEMENT"
  quantityKg: number
  unitPriceFcfa?: number
  batchId?: string
  reference?: string
  notes?: string
  date: string
}

export interface OfflineMedicineMovementQueuePayload {
  clientMutationId: string
  organizationId: string
  medicineStockId: string
  type: "ENTREE" | "SORTIE" | "PEREMPTION" | "INVENTAIRE"
  quantity: number
  unitPriceFcfa?: number
  batchId?: string
  reference?: string
  notes?: string
  date: string
}

export interface OfflineEggRecordQueuePayload {
  clientMutationId: string
  organizationId: string
  batchId: string
  date: string
  totalEggs: number
  sellableEggs: number
  brokenEggs?: number
  dirtyEggs?: number
  smallEggs?: number
  passageCount?: number
  observations?: string
}

export interface OfflinePurchaseItemQueuePayload {
  description: string
  quantity: number
  unit: string
  unitPriceFcfa: number
}

export interface OfflinePurchaseQueuePayload {
  clientMutationId: string
  organizationId: string
  supplierId?: string
  purchaseDate: string
  reference?: string
  notes?: string
  items: OfflinePurchaseItemQueuePayload[]
}

type OfflineQueuePayload =
  | OfflineDailyQueuePayload
  | OfflineExpenseQueuePayload
  | OfflineVaccinationQueuePayload
  | OfflineTreatmentQueuePayload
  | OfflineSaleQueuePayload
  | OfflineFeedMovementQueuePayload
  | OfflineMedicineMovementQueuePayload
  | OfflineEggRecordQueuePayload
  | OfflinePurchaseQueuePayload

export type OfflineQueueItemType =
  | "CREATE_DAILY_RECORD"
  | "CREATE_EXPENSE"
  | "CREATE_VACCINATION"
  | "CREATE_TREATMENT"
  | "CREATE_SALE"
  | "CREATE_FEED_MOVEMENT"
  | "CREATE_MEDICINE_MOVEMENT"
  | "CREATE_EGG_RECORD"
  | "CREATE_PURCHASE"

export interface OfflineQueueItem {
  id: string
  type: OfflineQueueItemType
  status: "pending" | "failed"
  payload: OfflineQueuePayload
  label: string
  scope: string
  createdAt: string
  updatedAt: string
  lastError?: string
}

export interface OfflineDailySyncMeta {
  lastSyncedAt: string | null
  lastError: string | null
}

function emitQueueChanged() {
  emitOfflineEvent(OFFLINE_EVENTS.syncChanged)
}

function getDefaultSyncMeta(): OfflineDailySyncMeta {
  return {
    lastSyncedAt: null,
    lastError: null,
  }
}

export function readOfflineDailySyncMeta(): OfflineDailySyncMeta {
  if (typeof window === "undefined") {
    return getDefaultSyncMeta()
  }

  try {
    const raw = window.localStorage.getItem(SYNC_META_KEY)
    if (!raw) return getDefaultSyncMeta()
    return {
      ...getDefaultSyncMeta(),
      ...(JSON.parse(raw) as Partial<OfflineDailySyncMeta>),
    }
  } catch {
    return getDefaultSyncMeta()
  }
}

function writeOfflineDailySyncMeta(meta: OfflineDailySyncMeta) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta))
}

async function clearOfflineShadow(scope: OfflineModuleScope, localId: string) {
  switch (scope) {
    case "daily":
      await dailyRepository.delete(localId)
      break
    case "health":
      await healthRepository.delete(localId)
      break
    case "stock":
      await stockMovementRepository.delete(localId)
      break
    case "eggs":
      await eggProductionRepository.delete(localId)
      break
    case "sales":
      await salesRepository.delete(localId)
      break
    case "purchases":
    case "expenses":
      await purchasesRepository.delete(localId)
      break
  }
}

export function createClientMutationId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}:${crypto.randomUUID()}`
  }

  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`
}

function buildQueueLabel(type: OfflineQueueItemType, payload: OfflineQueuePayload) {
  switch (type) {
    case "CREATE_DAILY_RECORD":
      return `Saisie journaliere ${(payload as OfflineDailyQueuePayload).dateIso.slice(0, 10)}`
    case "CREATE_EXPENSE":
      return `Depense ${(payload as OfflineExpenseQueuePayload).description}`
    case "CREATE_VACCINATION":
      return `Vaccination ${(payload as OfflineVaccinationQueuePayload).vaccineName}`
    case "CREATE_TREATMENT":
      return `Traitement ${(payload as OfflineTreatmentQueuePayload).medicineName}`
    case "CREATE_SALE":
      return `Vente ${(payload as OfflineSaleQueuePayload).saleDate}`
    case "CREATE_FEED_MOVEMENT":
      return `Mouvement aliment ${(payload as OfflineFeedMovementQueuePayload).type}`
    case "CREATE_MEDICINE_MOVEMENT":
      return `Mouvement medicament ${(payload as OfflineMedicineMovementQueuePayload).type}`
    case "CREATE_EGG_RECORD":
      return `Production oeufs ${(payload as OfflineEggRecordQueuePayload).date}`
    case "CREATE_PURCHASE":
      return `Achat ${(payload as OfflinePurchaseQueuePayload).purchaseDate}`
  }
}

function buildQueueScope(type: OfflineQueueItemType): OfflineModuleScope {
  switch (type) {
    case "CREATE_DAILY_RECORD":
      return "daily"
    case "CREATE_EXPENSE":
      return "expenses"
    case "CREATE_VACCINATION":
    case "CREATE_TREATMENT":
      return "health"
    case "CREATE_SALE":
      return "sales"
    case "CREATE_FEED_MOVEMENT":
    case "CREATE_MEDICINE_MOVEMENT":
      return "stock"
    case "CREATE_EGG_RECORD":
      return "eggs"
    case "CREATE_PURCHASE":
      return "purchases"
  }
}

async function createLocalShadow(type: OfflineQueueItemType, payload: OfflineQueuePayload) {
  switch (type) {
    case "CREATE_DAILY_RECORD":
      await dailyRepository.createLocal({
        localId: (payload as OfflineDailyQueuePayload).clientMutationId,
        organizationId: payload.organizationId,
        label: buildQueueLabel(type, payload),
        data: payload as unknown,
      })
      break
    case "CREATE_EXPENSE":
      await purchasesRepository.createLocal({
        localId: (payload as OfflineExpenseQueuePayload).clientMutationId,
        organizationId: payload.organizationId,
        label: buildQueueLabel(type, payload),
        data: payload as unknown,
      })
      break
    case "CREATE_VACCINATION":
    case "CREATE_TREATMENT":
      await healthRepository.createLocal({
        localId:
          "clientMutationId" in payload ? payload.clientMutationId : createClientMutationId("health"),
        organizationId: payload.organizationId,
        label: buildQueueLabel(type, payload),
        data: payload as unknown,
      })
      break
    case "CREATE_SALE":
      await salesRepository.createLocal({
        localId: (payload as OfflineSaleQueuePayload).clientMutationId,
        organizationId: payload.organizationId,
        label: buildQueueLabel(type, payload),
        data: payload as unknown,
      })
      break
    case "CREATE_FEED_MOVEMENT":
    case "CREATE_MEDICINE_MOVEMENT":
      await stockMovementRepository.createLocal({
        localId:
          "clientMutationId" in payload ? payload.clientMutationId : createClientMutationId("stock"),
        organizationId: payload.organizationId,
        label: buildQueueLabel(type, payload),
        data: payload as unknown,
      })
      break
    case "CREATE_EGG_RECORD":
      await eggProductionRepository.createLocal({
        localId: (payload as OfflineEggRecordQueuePayload).clientMutationId,
        organizationId: payload.organizationId,
        label: buildQueueLabel(type, payload),
        data: payload as unknown,
      })
      break
    case "CREATE_PURCHASE":
      await purchasesRepository.createLocal({
        localId: (payload as OfflinePurchaseQueuePayload).clientMutationId,
        organizationId: payload.organizationId,
        label: buildQueueLabel(type, payload),
        data: payload as unknown,
      })
      break
  }
}

async function enqueueOfflineItem(
  type: OfflineQueueItemType,
  payload: OfflineQueuePayload,
) {
  const localId =
    "clientMutationId" in payload ? payload.clientMutationId : createClientMutationId(type.toLowerCase())
  const scope = buildQueueScope(type)
  const command = createOfflineCommand({
    organizationId: payload.organizationId,
    entityType: scope,
    scope,
    action: type,
    localId,
    payload,
    label: buildQueueLabel(type, payload),
  })

  await createLocalShadow(type, payload)
  await enqueueSyncCommand(command)
  emitQueueChanged()
  return command
}

export async function listPendingOfflineDailyQueueItems(): Promise<OfflineQueueItem[]> {
  const context = await import("@/src/lib/offline-session").then((module) =>
    module.readOfflineSessionContext({ allowExpired: true }),
  )
  if (!context?.organizationId) return []

  const items = await listPendingSyncCommands(context.organizationId)
  return items.map((item) => ({
    id: item.id,
    type: item.action as OfflineQueueItemType,
    status: item.status === "pending" ? "pending" : "failed",
    payload: item.payload as unknown as OfflineQueuePayload,
    label: item.label ?? item.id,
    scope: item.scope,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lastError: item.error ?? undefined,
  }))
}

export const listPendingOfflineQueueItems = listPendingOfflineDailyQueueItems

export async function listPendingOfflineQueueItemsByScope(scope: string) {
  const items = await listPendingOfflineDailyQueueItems()
  return items.filter((item) => item.scope === scope)
}

export async function flushOfflineQueueByScope(scope: string) {
  const context = await import("@/src/lib/offline-session").then((module) =>
    module.readOfflineSessionContext({ allowExpired: true }),
  )
  if (!context?.organizationId) return { processed: 0, synced: 0, failed: 0 }

  const result = await runOfflineSync(context.organizationId, scope as OfflineModuleScope)
  writeOfflineDailySyncMeta({
    lastSyncedAt: new Date().toISOString(),
    lastError: result.lastError ?? null,
  })
  emitQueueChanged()
  return result
}

export async function deleteOfflineDailyQueueItem(id: string) {
  const current = await getSyncCommand(id)
  await deleteSyncCommand(id)
  if (current) {
    await clearOfflineShadow(current.scope, current.localId)
    await clearSyncErrors({
      organizationId: current.organizationId,
      localId: current.localId,
      commandId: current.id,
      scope: current.scope,
    })
  }
  writeOfflineDailySyncMeta({
    lastSyncedAt: readOfflineDailySyncMeta().lastSyncedAt,
    lastError: null,
  })
  emitQueueChanged()
}

export const deleteOfflineQueueItem = deleteOfflineDailyQueueItem

export async function retryOfflineDailyQueueItem(id: string) {
  const current = await getSyncCommand(id)
  if (!current) return null

  const next = await updateSyncCommandStatus(id, "pending", {
    error: null,
  })
  emitQueueChanged()
  return next
}

export const retryOfflineQueueItem = retryOfflineDailyQueueItem

export async function enqueueOfflineDailyRecord(payload: OfflineDailyQueuePayload) {
  return enqueueOfflineItem("CREATE_DAILY_RECORD", payload)
}

export async function enqueueOfflineExpense(payload: OfflineExpenseQueuePayload) {
  return enqueueOfflineItem("CREATE_EXPENSE", payload)
}

export async function enqueueOfflineVaccination(payload: OfflineVaccinationQueuePayload) {
  return enqueueOfflineItem("CREATE_VACCINATION", payload)
}

export async function enqueueOfflineTreatment(payload: OfflineTreatmentQueuePayload) {
  return enqueueOfflineItem("CREATE_TREATMENT", payload)
}

export async function enqueueOfflineSale(payload: OfflineSaleQueuePayload) {
  return enqueueOfflineItem("CREATE_SALE", payload)
}

export async function enqueueOfflineFeedMovement(payload: OfflineFeedMovementQueuePayload) {
  return enqueueOfflineItem("CREATE_FEED_MOVEMENT", payload)
}

export async function enqueueOfflineMedicineMovement(payload: OfflineMedicineMovementQueuePayload) {
  return enqueueOfflineItem("CREATE_MEDICINE_MOVEMENT", payload)
}

export async function enqueueOfflineEggRecord(payload: OfflineEggRecordQueuePayload) {
  return enqueueOfflineItem("CREATE_EGG_RECORD", payload)
}

export async function enqueueOfflinePurchase(payload: OfflinePurchaseQueuePayload) {
  return enqueueOfflineItem("CREATE_PURCHASE", payload)
}

export async function flushOfflineDailyQueue(options?: { itemId?: string }) {
  const context = await import("@/src/lib/offline-session").then((module) =>
    module.readOfflineSessionContext({ allowExpired: true }),
  )
  if (!context?.organizationId) return { processed: 0, synced: 0, failed: 0 }

  const scope = options?.itemId
    ? (await getSyncCommand(options.itemId))?.scope as OfflineModuleScope | undefined
    : undefined
  const result = await runOfflineSync(context.organizationId, scope)
  writeOfflineDailySyncMeta({
    lastSyncedAt: new Date().toISOString(),
    lastError: result.lastError ?? null,
  })
  emitQueueChanged()
  return result
}

export const flushOfflineMutationOutbox = flushOfflineDailyQueue

export function subscribeToOfflineDailyQueue(callback: () => void) {
  return subscribeOfflineEvent(OFFLINE_EVENTS.syncChanged, callback)
}

export const subscribeToOfflineMutationOutbox = subscribeToOfflineDailyQueue
export const readOfflineSyncMeta = readOfflineDailySyncMeta
