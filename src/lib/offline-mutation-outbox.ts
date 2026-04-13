"use client"

import { emitOfflineEvent, OFFLINE_EVENTS, subscribeOfflineEvent } from "@/src/lib/offline/events"
import { requestToPromise, withStores } from "@/src/lib/offline/db"
import { OFFLINE_RESOURCE_KEYS } from "@/src/lib/offline-keys"
import { OFFLINE_STORE_NAMES } from "@/src/lib/offline/schema"
import {
  adjustDailyFeedStockQuantityLocally,
  dailyRepository,
  eggProductionRepository,
  healthRepository,
  purchasesRepository,
  salesRepository,
  stockMovementRepository,
} from "@/src/lib/offline/repositories"
import { createOfflineCommand } from "@/src/lib/offline/sync/commands"
import { clearSyncErrors, listSyncErrors } from "@/src/lib/offline/sync/errors"
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

export interface OfflineFeedBagEventQueuePayload {
  clientMutationId: string
  organizationId: string
  batchId: string
  feedStockId?: string
  startDateIso: string
  endDateIso: string
  startAgeDay: number
  endAgeDay: number
  bagCount: number
  bagWeightKg: number
  totalFeedKg: number
  notes?: string
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
  | OfflineFeedBagEventQueuePayload
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
  | "CREATE_FEED_BAG_EVENT"
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
  status: "pending" | "syncing" | "failed" | "conflict"
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

function toDateKey(value: string) {
  return new Date(value).toISOString().slice(0, 10)
}

function isFeedBagEventPayload(value: unknown): value is OfflineFeedBagEventQueuePayload {
  return typeof value === "object" && value !== null && "startDateIso" in value && "bagCount" in value
}

function extractDailyIdentity(payload: OfflineQueuePayload) {
  if ("dateIso" in payload) {
    return {
      batchId: payload.batchId,
      dateIso: payload.dateIso,
    }
  }

  if (isFeedBagEventPayload(payload)) {
    return {
      batchId: payload.batchId,
      dateIso: payload.startDateIso,
    }
  }

  return {
    batchId: undefined,
    dateIso: undefined,
  }
}

function buildDailyDraftStorageKey(organizationId: string, batchId: string, dateIso: string) {
  return `sunufarm:draft:daily:${organizationId}:${batchId}:${toDateKey(dateIso)}`
}

function buildDailyDraftFormKey(organizationId: string, batchId: string, dateIso: string) {
  return `daily:${organizationId}:${batchId}:${toDateKey(dateIso)}`
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

async function purgeDailyIndexedDbArtifacts(command: NonNullable<Awaited<ReturnType<typeof getSyncCommand>>>) {
  const payload = command.payload as OfflineQueuePayload
  const { batchId, dateIso } = extractDailyIdentity(payload)
  const targetCacheKey = batchId ? OFFLINE_RESOURCE_KEYS.dailyRecords(batchId) : null

  return withStores(
    [
      OFFLINE_STORE_NAMES.syncQueue,
      OFFLINE_STORE_NAMES.dailyEntries,
      OFFLINE_STORE_NAMES.syncErrors,
      OFFLINE_STORE_NAMES.legacyOptimistic,
      OFFLINE_STORE_NAMES.legacyResourceCache,
    ],
    "readwrite",
    async (stores) => {
      await requestToPromise(stores[OFFLINE_STORE_NAMES.syncQueue].delete(command.id))
      await requestToPromise(stores[OFFLINE_STORE_NAMES.dailyEntries].delete(command.localId))

      const syncErrors = await requestToPromise<Array<Record<string, unknown>>>(
        stores[OFFLINE_STORE_NAMES.syncErrors].getAll(),
      )
      const matchingErrors = syncErrors.filter((item) => (
        item.organizationId === command.organizationId &&
        item.localId === command.localId &&
        item.commandId === command.id &&
        item.scope === command.scope
      ))
      await Promise.all(
        matchingErrors.map((item) =>
          requestToPromise(stores[OFFLINE_STORE_NAMES.syncErrors].delete(String(item.id)))),
      )

      const optimisticItems = await requestToPromise<Array<Record<string, unknown>>>(
        stores[OFFLINE_STORE_NAMES.legacyOptimistic].getAll(),
      )
      const matchingOptimistic = optimisticItems.filter((item) => {
        if (item.organizationId !== command.organizationId || item.scope !== command.scope) {
          return false
        }
        if (item.id === command.localId) return true

        const data = (item.data ?? null) as Record<string, unknown> | null
        if (!data || !batchId || !dateIso) return false
        const itemBatchId = typeof data.batchId === "string" ? data.batchId : undefined
        const itemDateIso =
          typeof data.dateIso === "string"
            ? data.dateIso
            : typeof data.date === "string"
              ? data.date
              : undefined

        return itemBatchId === batchId && itemDateIso !== undefined && toDateKey(itemDateIso) === toDateKey(dateIso)
      })
      await Promise.all(
        matchingOptimistic.map((item) =>
          requestToPromise(stores[OFFLINE_STORE_NAMES.legacyOptimistic].delete(String(item.id)))),
      )

      const cacheEntries = await requestToPromise<Array<Record<string, unknown>>>(
        stores[OFFLINE_STORE_NAMES.legacyResourceCache].getAll(),
      )
      const matchingCacheEntries = cacheEntries.filter((item) => (
        item.organizationId === command.organizationId &&
        targetCacheKey !== null &&
        item.key === targetCacheKey
      ))
      await Promise.all(
        matchingCacheEntries.map((item) =>
          requestToPromise(stores[OFFLINE_STORE_NAMES.legacyResourceCache].delete(String(item.id)))),
      )

      return {
        deletedQueueId: command.id,
        deletedDailyEntryId: command.localId,
        deletedSyncErrorIds: matchingErrors.map((item) => String(item.id)),
        deletedLegacyOptimisticIds: matchingOptimistic.map((item) => String(item.id)),
        deletedLegacyCacheIds: matchingCacheEntries.map((item) => String(item.id)),
      }
    },
  )
}

async function clearDailyDraftArtifacts(payload: { organizationId: string } & OfflineQueuePayload) {
  const { batchId, dateIso } = extractDailyIdentity(payload)
  if (!batchId || !dateIso) return null

  const formKey = buildDailyDraftFormKey(payload.organizationId, batchId, dateIso)
  const storageKey = buildDailyDraftStorageKey(payload.organizationId, batchId, dateIso)

  if (typeof window !== "undefined") {
    window.localStorage.removeItem(storageKey)
  }

  try {
    const { clearFormDraft } = await import("@/src/actions/form-drafts")
    await clearFormDraft({
      formKey,
      organizationId: payload.organizationId,
    })
  } catch (error) {
    console.warn("[offline-delete][daily] failed to clear server draft", {
      formKey,
      organizationId: payload.organizationId,
      error,
    })
  }

  return { formKey, storageKey }
}

async function purgeDailyOfflineArtifacts(command: Awaited<ReturnType<typeof getSyncCommand>>) {
  if (!command || command.scope !== "daily") {
    return null
  }

  const payload = command.payload as Partial<OfflineDailyQueuePayload>
  const indexedDbPurge = await purgeDailyIndexedDbArtifacts(command)

  const draftArtifacts =
    payload.organizationId
      ? await clearDailyDraftArtifacts(payload as OfflineQueuePayload & { organizationId: string })
      : null

  return {
    indexedDbPurge,
    draftArtifacts,
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
    case "CREATE_FEED_BAG_EVENT": {
      const bagPayload = payload as OfflineFeedBagEventQueuePayload
      return `Mode sac ${bagPayload.startDateIso.slice(0, 10)}`
    }
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
    case "CREATE_FEED_BAG_EVENT":
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
    case "CREATE_FEED_BAG_EVENT":
      if ((payload as OfflineFeedBagEventQueuePayload).feedStockId) {
        await adjustDailyFeedStockQuantityLocally(
          payload.organizationId,
          (payload as OfflineFeedBagEventQueuePayload).feedStockId as string,
          -(payload as OfflineFeedBagEventQueuePayload).totalFeedKg,
        )
      }
      await dailyRepository.createLocal({
        localId: (payload as OfflineFeedBagEventQueuePayload).clientMutationId,
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
    status: item.status === "pending" || item.status === "syncing"
      ? item.status
      : item.status === "conflict"
        ? "conflict"
        : "failed",
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
  console.info("[offline-delete] start", { commandId: id, scope: current?.scope })

  // Phase 1 — CRITICAL: remove from sync queue unconditionally.
  // This is the only thing that controls visibility in the UI.
  // We do this first so the item disappears from the pending list even if
  // subsequent cleanup fails (e.g. on mobile with a flaky multi-store transaction).
  await deleteSyncCommand(id)

  // Phase 2 — BEST-EFFORT: clean up shadow records and draft artifacts.
  // Errors here are logged but must not prevent phase 1 from taking effect.
  if (current) {
    try {
      if (current.action === "CREATE_FEED_BAG_EVENT") {
        const payload = current.payload as Partial<OfflineFeedBagEventQueuePayload>
        if (payload.feedStockId && typeof payload.totalFeedKg === "number") {
          await adjustDailyFeedStockQuantityLocally(
            current.organizationId,
            payload.feedStockId,
            payload.totalFeedKg,
          )
        }
      }

      if (current.scope === "daily") {
        // purgeDailyOfflineArtifacts also tries to delete from syncQueue (already done above,
        // so that inner delete is a harmless no-op) then cleans up daily entry, syncErrors,
        // legacyOptimistic and legacyResourceCache.
        await purgeDailyOfflineArtifacts(current)
      } else {
        await clearOfflineShadow(current.scope, current.localId)
        await clearSyncErrors({
          organizationId: current.organizationId,
          localId: current.localId,
          commandId: current.id,
          scope: current.scope,
        })
      }
    } catch (cleanupError) {
      // Cleanup failed but the sync queue entry was already removed — the item will
      // no longer appear in the pending list. Log and continue.
      console.warn("[offline-delete] best-effort cleanup failed — queue entry already removed", {
        commandId: id,
        scope: current.scope,
        error: cleanupError,
      })
    }
  }

  writeOfflineDailySyncMeta({
    lastSyncedAt: readOfflineDailySyncMeta().lastSyncedAt,
    lastError: null,
  })
  console.info("[offline-delete] completed", { commandId: id })
  emitQueueChanged()
}

export const deleteOfflineQueueItem = deleteOfflineDailyQueueItem

export async function purgeOfflineDailyItemLocally(id: string) {
  const current = await getSyncCommand(id)
  if (!current) {
    return { success: false, reason: "COMMAND_NOT_FOUND" }
  }

  await deleteOfflineDailyQueueItem(id)
  return { success: true, localId: current.localId }
}

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

export async function enqueueOfflineFeedBagEvent(payload: OfflineFeedBagEventQueuePayload) {
  return enqueueOfflineItem("CREATE_FEED_BAG_EVENT", payload)
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
