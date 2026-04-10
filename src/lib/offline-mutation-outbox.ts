"use client"

import { createDailyRecord } from "@/src/actions/daily-records"
import { createExpense } from "@/src/actions/expenses"
import { createEggRecord } from "@/src/actions/eggs"
import { createTreatment, createVaccination } from "@/src/actions/health"
import { createPurchase } from "@/src/actions/purchases"
import { createSale } from "@/src/actions/sales"
import { createFeedMovement, createMedicineMovement } from "@/src/actions/stock"
import { markOptimisticItemFailed, markOptimisticItemSynced, removeOptimisticItem } from "@/src/lib/offline-optimistic"
import {
  openOfflineDb,
  requestToPromise,
} from "@/src/lib/offline-cache"
import { OFFLINE_QUEUE_STORE } from "@/src/lib/offline-keys"

const SYNC_META_KEY = "sunufarm:offline-sync-meta"
const QUEUE_EVENT = "sunufarm:offline-outbox-changed"

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

export interface OfflineExpenseQueuePayload {
  clientMutationId: string
  organizationId: string
  date: string
  description: string
  amountFcfa: number
  reference?: string
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

export interface OfflineDailyQueueItem extends OfflineQueueItem {
  type: "CREATE_DAILY_RECORD"
  payload: OfflineDailyQueuePayload
}

export interface OfflineDailySyncMeta {
  lastSyncedAt: string | null
  lastError: string | null
}

export type OfflineSyncMeta = OfflineDailySyncMeta

function emitQueueChanged() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT))
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

function withStore<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  return openOfflineDb().then((db) => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(OFFLINE_QUEUE_STORE, mode)
    const store = transaction.objectStore(OFFLINE_QUEUE_STORE)

    transaction.onerror = () => reject(transaction.error ?? new Error("INDEXED_DB_TX_FAILED"))
    transaction.onabort = () => reject(transaction.error ?? new Error("INDEXED_DB_TX_ABORTED"))
    transaction.addEventListener("complete", () => db.close())

    void handler(store).then(resolve).catch(reject)
  }))
}

function createQueueKey(parts: string[]) {
  return parts.join(":")
}

export function createClientMutationId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}:${crypto.randomUUID()}`
  }

  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`
}

function buildQueueLabel(item: {
  type: OfflineQueueItemType
  payload: OfflineQueuePayload
}) {
  switch (item.type) {
    case "CREATE_DAILY_RECORD": {
      const payload = item.payload as OfflineDailyQueuePayload
      return `Saisie journaliere ${payload.batchId} - ${payload.dateIso.slice(0, 10)}`
    }
    case "CREATE_EXPENSE": {
      const payload = item.payload as OfflineExpenseQueuePayload
      return `Depense - ${payload.description}`
    }
    case "CREATE_VACCINATION": {
      const payload = item.payload as OfflineVaccinationQueuePayload
      return `Vaccination ${payload.vaccineName}`
    }
    case "CREATE_TREATMENT": {
      const payload = item.payload as OfflineTreatmentQueuePayload
      return `Traitement ${payload.medicineName}`
    }
    case "CREATE_SALE": {
      const payload = item.payload as OfflineSaleQueuePayload
      return `Vente ${payload.productType} - ${payload.saleDate}`
    }
    case "CREATE_FEED_MOVEMENT": {
      const payload = item.payload as OfflineFeedMovementQueuePayload
      return `Mouvement aliment ${payload.type} - ${payload.date}`
    }
    case "CREATE_MEDICINE_MOVEMENT": {
      const payload = item.payload as OfflineMedicineMovementQueuePayload
      return `Mouvement medicament ${payload.type} - ${payload.date}`
    }
    case "CREATE_EGG_RECORD": {
      const payload = item.payload as OfflineEggRecordQueuePayload
      return `Production oeufs - ${payload.date.slice(0, 10)}`
    }
    case "CREATE_PURCHASE": {
      const payload = item.payload as OfflinePurchaseQueuePayload
      return `Achat fournisseur - ${payload.purchaseDate.slice(0, 10)}`
    }
  }
}

function buildQueueScope(item: {
  type: OfflineQueueItemType
  payload: OfflineQueuePayload
}) {
  switch (item.type) {
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

function isLikelyOfflineError(error: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true
  if (!(error instanceof Error)) return false
  return /fetch|network|offline|failed to fetch/i.test(error.message)
}

function isAlreadyCreatedError(message: string | undefined) {
  return !!message && /Une saisie existe deja pour ce lot a cette date/i.test(message)
}

function isAlreadyHandledError(item: OfflineQueueItem, message: string | undefined) {
  if (!message) return false

  if (item.type === "CREATE_DAILY_RECORD") {
    return isAlreadyCreatedError(message)
  }

  if (item.type === "CREATE_EGG_RECORD") {
    return /record.*oeufs.*existe.*deja|un record d.?oeufs existe/i.test(message)
  }

  return false
}

function getOptimisticId(item: OfflineQueueItem): string | null {
  const payload = item.payload as { clientMutationId?: string }
  return payload.clientMutationId ?? null
}

async function listOfflineQueueItems(): Promise<OfflineQueueItem[]> {
  return withStore<OfflineQueueItem[]>("readonly", async (store) => {
    const request = store.getAll()
    return requestToPromise(request)
  })
}

export async function listPendingOfflineDailyQueueItems(): Promise<OfflineQueueItem[]> {
  const items = await listOfflineQueueItems()
  return items
    .filter((item) => item.status === "pending" || item.status === "failed")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export const listPendingOfflineQueueItems = listPendingOfflineDailyQueueItems

export async function listPendingOfflineQueueItemsByScope(scope: string) {
  const items = await listPendingOfflineDailyQueueItems()
  return items.filter((item) => item.scope === scope)
}

export async function flushOfflineQueueByScope(scope: string) {
  const items = await listPendingOfflineQueueItemsByScope(scope)
  let processed = 0
  let synced = 0

  for (const item of items) {
    const result = await flushOfflineDailyQueue({ itemId: item.id })
    processed += result.processed
    synced += result.synced
  }

  const remainingItems = await listPendingOfflineQueueItemsByScope(scope)

  return {
    processed,
    synced,
    failed: remainingItems.length,
  }
}

async function getOfflineQueueItem(id: string): Promise<OfflineQueueItem | undefined> {
  return withStore<OfflineQueueItem | undefined>("readonly", async (store) => {
    const request = store.get(id)
    return requestToPromise(request)
  })
}

async function putQueueItem(item: OfflineQueueItem) {
  await withStore<void>("readwrite", (store) => requestToPromise(store.put(item)).then(() => undefined))
  emitQueueChanged()
}

export async function deleteOfflineDailyQueueItem(id: string) {
  const item = await getOfflineQueueItem(id)
  await withStore<void>("readwrite", (store) => requestToPromise(store.delete(id)).then(() => undefined))
  const optimisticId = item ? getOptimisticId(item) : null
  if (optimisticId) {
    await removeOptimisticItem(optimisticId)
  }
  emitQueueChanged()
}

export const deleteOfflineQueueItem = deleteOfflineDailyQueueItem

export async function retryOfflineDailyQueueItem(id: string) {
  const item = await getOfflineQueueItem(id)
  if (!item) return null

  const nextItem: OfflineQueueItem = {
    ...item,
    status: "pending",
    updatedAt: new Date().toISOString(),
    lastError: undefined,
  }

  await putQueueItem(nextItem)
  return nextItem
}

export const retryOfflineQueueItem = retryOfflineDailyQueueItem

async function enqueueOfflineItem(
  type: OfflineQueueItemType,
  payload: OfflineQueuePayload,
  id: string,
): Promise<OfflineQueueItem> {
  const now = new Date().toISOString()
  const item: OfflineQueueItem = {
    id,
    type,
    status: "pending",
    payload,
    label: buildQueueLabel({ type, payload }),
    scope: buildQueueScope({ type, payload }),
    createdAt: now,
    updatedAt: now,
  }

  await putQueueItem(item)
  return item
}

export async function enqueueOfflineDailyRecord(
  payload: OfflineDailyQueuePayload,
): Promise<OfflineDailyQueueItem> {
  return enqueueOfflineItem(
    "CREATE_DAILY_RECORD",
    payload,
    createQueueKey(["daily", payload.organizationId, payload.batchId, payload.dateIso]),
  ) as Promise<OfflineDailyQueueItem>
}

export async function enqueueOfflineExpense(payload: OfflineExpenseQueuePayload) {
  return enqueueOfflineItem(
    "CREATE_EXPENSE",
    payload,
    createQueueKey(["expense", payload.organizationId, payload.date, payload.description]),
  )
}

export async function enqueueOfflineVaccination(payload: OfflineVaccinationQueuePayload) {
  return enqueueOfflineItem(
    "CREATE_VACCINATION",
    payload,
    createQueueKey(["vaccination", payload.organizationId, payload.batchId, payload.date, payload.vaccineName]),
  )
}

export async function enqueueOfflineTreatment(payload: OfflineTreatmentQueuePayload) {
  return enqueueOfflineItem(
    "CREATE_TREATMENT",
    payload,
    createQueueKey(["treatment", payload.organizationId, payload.batchId, payload.startDate, payload.medicineName]),
  )
}

export async function enqueueOfflineSale(payload: OfflineSaleQueuePayload) {
  return enqueueOfflineItem(
    "CREATE_SALE",
    payload,
    payload.clientMutationId,
  )
}

export async function enqueueOfflineFeedMovement(payload: OfflineFeedMovementQueuePayload) {
  return enqueueOfflineItem(
    "CREATE_FEED_MOVEMENT",
    payload,
    payload.clientMutationId,
  )
}

export async function enqueueOfflineMedicineMovement(payload: OfflineMedicineMovementQueuePayload) {
  return enqueueOfflineItem(
    "CREATE_MEDICINE_MOVEMENT",
    payload,
    payload.clientMutationId,
  )
}

export async function enqueueOfflineEggRecord(payload: OfflineEggRecordQueuePayload) {
  return enqueueOfflineItem(
    "CREATE_EGG_RECORD",
    payload,
    createQueueKey(["egg", payload.organizationId, payload.batchId, payload.date]),
  )
}

export async function enqueueOfflinePurchase(payload: OfflinePurchaseQueuePayload) {
  return enqueueOfflineItem(
    "CREATE_PURCHASE",
    payload,
    payload.clientMutationId,
  )
}

async function replayQueueItem(item: OfflineQueueItem) {
  switch (item.type) {
    case "CREATE_DAILY_RECORD": {
      const payload = item.payload as OfflineDailyQueuePayload
      return createDailyRecord({
        clientMutationId: payload.clientMutationId,
        organizationId: payload.organizationId,
        batchId: payload.batchId,
        date: new Date(payload.dateIso),
        mortality: payload.mortality,
        feedKg: payload.feedKg,
        feedStockId: payload.feedStockId,
        waterLiters: payload.waterLiters,
        avgWeightG: payload.avgWeightG,
        observations: payload.observations,
        temperatureMin: payload.temperatureMin,
        temperatureMax: payload.temperatureMax,
        humidity: payload.humidity,
        audioRecordUrl: payload.audioRecordUrl,
      })
    }
    case "CREATE_EXPENSE": {
      const payload = item.payload as OfflineExpenseQueuePayload
      return createExpense({
        clientMutationId: payload.clientMutationId,
        organizationId: payload.organizationId,
        description: payload.description,
        amountFcfa: payload.amountFcfa,
        date: payload.date,
        reference: payload.reference,
        notes: payload.notes,
      })
    }
    case "CREATE_VACCINATION": {
      const payload = item.payload as OfflineVaccinationQueuePayload
      return createVaccination({
        clientMutationId: payload.clientMutationId,
        organizationId: payload.organizationId,
        batchId: payload.batchId,
        date: new Date(payload.date),
        vaccineName: payload.vaccineName,
        route: payload.route,
        dose: payload.dose,
        countVaccinated: payload.countVaccinated,
        medicineStockId: payload.medicineStockId,
        medicineQuantity: payload.medicineQuantity,
        notes: payload.notes,
      })
    }
    case "CREATE_TREATMENT": {
      const payload = item.payload as OfflineTreatmentQueuePayload
      return createTreatment({
        clientMutationId: payload.clientMutationId,
        organizationId: payload.organizationId,
        batchId: payload.batchId,
        startDate: new Date(payload.startDate),
        medicineName: payload.medicineName,
        dose: payload.dose,
        durationDays: payload.durationDays,
        countTreated: payload.countTreated,
        medicineStockId: payload.medicineStockId,
        medicineQuantity: payload.medicineQuantity,
        indication: payload.indication,
        notes: payload.notes,
      })
    }
    case "CREATE_SALE": {
      const payload = item.payload as OfflineSaleQueuePayload
      return createSale({
        clientMutationId: payload.clientMutationId,
        organizationId: payload.organizationId,
        customerId: payload.customerId,
        saleDate: payload.saleDate,
        productType: payload.productType,
        notes: payload.notes,
        items: payload.items,
      })
    }
    case "CREATE_FEED_MOVEMENT": {
      const payload = item.payload as OfflineFeedMovementQueuePayload
      return createFeedMovement({
        clientMutationId: payload.clientMutationId,
        organizationId: payload.organizationId,
        feedStockId: payload.feedStockId,
        type: payload.type,
        quantityKg: payload.quantityKg,
        unitPriceFcfa: payload.unitPriceFcfa,
        batchId: payload.batchId,
        reference: payload.reference,
        notes: payload.notes,
        date: new Date(payload.date),
      })
    }
    case "CREATE_MEDICINE_MOVEMENT": {
      const payload = item.payload as OfflineMedicineMovementQueuePayload
      return createMedicineMovement({
        clientMutationId: payload.clientMutationId,
        organizationId: payload.organizationId,
        medicineStockId: payload.medicineStockId,
        type: payload.type,
        quantity: payload.quantity,
        unitPriceFcfa: payload.unitPriceFcfa,
        batchId: payload.batchId,
        reference: payload.reference,
        notes: payload.notes,
        date: new Date(payload.date),
      })
    }
    case "CREATE_EGG_RECORD": {
      const payload = item.payload as OfflineEggRecordQueuePayload
      return createEggRecord({
        clientMutationId: payload.clientMutationId,
        organizationId: payload.organizationId,
        batchId: payload.batchId,
        date: new Date(payload.date),
        totalEggs: payload.totalEggs,
        sellableEggs: payload.sellableEggs,
        brokenEggs: payload.brokenEggs ?? 0,
        dirtyEggs: payload.dirtyEggs ?? 0,
        smallEggs: payload.smallEggs ?? 0,
        passageCount: payload.passageCount ?? 1,
        observations: payload.observations,
      })
    }
    case "CREATE_PURCHASE": {
      const payload = item.payload as OfflinePurchaseQueuePayload
      return createPurchase({
        clientMutationId: payload.clientMutationId,
        organizationId: payload.organizationId,
        supplierId: payload.supplierId,
        purchaseDate: payload.purchaseDate,
        reference: payload.reference,
        notes: payload.notes,
        items: payload.items,
      })
    }
  }
}

export async function flushOfflineDailyQueue(options?: { itemId?: string }) {
  const targetItem = options?.itemId ? await getOfflineQueueItem(options.itemId) : null
  const items = targetItem
    ? [targetItem]
    : options?.itemId
      ? []
      : await listPendingOfflineDailyQueueItems()

  if (items.length === 0) {
    const previous = readOfflineDailySyncMeta()
    writeOfflineDailySyncMeta({
      lastSyncedAt: previous.lastSyncedAt ?? new Date().toISOString(),
      lastError: null,
    })
    emitQueueChanged()
    return { processed: 0, synced: 0, failed: 0 }
  }

  let synced = 0

  for (const item of items) {
    try {
      const result = await replayQueueItem(item)

      if (result.success || isAlreadyHandledError(item, result.error)) {
        const optimisticId = getOptimisticId(item)
        if (optimisticId) {
          await markOptimisticItemSynced(optimisticId)
        }
        await deleteOfflineDailyQueueItem(item.id)
        synced += 1
        continue
      }

      await putQueueItem({
        ...item,
        status: "failed",
        updatedAt: new Date().toISOString(),
        lastError: result.error,
      })
      const optimisticId = getOptimisticId(item)
      if (optimisticId) {
        await markOptimisticItemFailed(optimisticId, result.error)
      }
    } catch (error) {
      if (isLikelyOfflineError(error)) {
        break
      }

      await putQueueItem({
        ...item,
        status: "failed",
        updatedAt: new Date().toISOString(),
        lastError: error instanceof Error ? error.message : "SYNC_FAILED",
      })
      const optimisticId = getOptimisticId(item)
      if (optimisticId) {
        await markOptimisticItemFailed(
          optimisticId,
          error instanceof Error ? error.message : "SYNC_FAILED",
        )
      }
    }
  }

  const remainingItems = await listPendingOfflineDailyQueueItems()
  writeOfflineDailySyncMeta({
    lastSyncedAt: new Date().toISOString(),
    lastError: remainingItems[0]?.lastError ?? null,
  })
  emitQueueChanged()

  return {
    processed: items.length,
    synced,
    failed: remainingItems.length,
  }
}

export const flushOfflineMutationOutbox = flushOfflineDailyQueue

export function subscribeToOfflineDailyQueue(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {}
  }

  const handler = () => callback()
  window.addEventListener(QUEUE_EVENT, handler)

  return () => {
    window.removeEventListener(QUEUE_EVENT, handler)
  }
}

export const subscribeToOfflineMutationOutbox = subscribeToOfflineDailyQueue
export const readOfflineSyncMeta = readOfflineDailySyncMeta
