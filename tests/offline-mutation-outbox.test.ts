import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  createDailyRecordMock,
  createEggRecordMock,
  createExpenseMock,
  createPurchaseMock,
  createVaccinationMock,
  createTreatmentMock,
  createSaleMock,
  createFeedMovementMock,
  createMedicineMovementMock,
} = vi.hoisted(() => ({
  createDailyRecordMock: vi.fn(),
  createEggRecordMock: vi.fn(),
  createExpenseMock: vi.fn(),
  createPurchaseMock: vi.fn(),
  createVaccinationMock: vi.fn(),
  createTreatmentMock: vi.fn(),
  createSaleMock: vi.fn(),
  createFeedMovementMock: vi.fn(),
  createMedicineMovementMock: vi.fn(),
}))

vi.mock("@/src/actions/daily-records", () => ({
  createDailyRecord: createDailyRecordMock,
}))

vi.mock("@/src/actions/expenses", () => ({
  createExpense: createExpenseMock,
}))

vi.mock("@/src/actions/eggs", () => ({
  createEggRecord: createEggRecordMock,
}))

vi.mock("@/src/actions/health", () => ({
  createVaccination: createVaccinationMock,
  createTreatment: createTreatmentMock,
}))

vi.mock("@/src/actions/purchases", () => ({
  createPurchase: createPurchaseMock,
}))

vi.mock("@/src/actions/sales", () => ({
  createSale: createSaleMock,
}))

vi.mock("@/src/actions/stock", () => ({
  createFeedMovement: createFeedMovementMock,
  createMedicineMovement: createMedicineMovementMock,
}))

import {
  enqueueOfflineDailyRecord,
  enqueueOfflineExpense,
  enqueueOfflineSale,
  flushOfflineDailyQueue,
  listPendingOfflineDailyQueueItems,
  listPendingOfflineQueueItemsByScope,
  readOfflineDailySyncMeta,
  retryOfflineDailyQueueItem,
} from "@/src/lib/offline-mutation-outbox"

class FakeRequest<T> {
  onsuccess: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  result!: T
  error: Error | null = null

  succeed(result: T) {
    this.result = result
    queueMicrotask(() => {
      this.onsuccess?.(new Event("success"))
    })
  }
}

class FakeObjectStore {
  constructor(
    private readonly records: Map<string, unknown>,
    private readonly transaction: FakeTransaction,
  ) {}

  createIndex() {
    return undefined
  }

  getAll() {
    const request = new FakeRequest<unknown[]>()
    request.succeed(Array.from(this.records.values()))
    this.transaction.completeSoon()
    return request as unknown as IDBRequest<unknown[]>
  }

  get(key: string) {
    const request = new FakeRequest<unknown>()
    request.succeed(this.records.get(key))
    this.transaction.completeSoon()
    return request as unknown as IDBRequest<unknown>
  }

  put(value: unknown) {
    const request = new FakeRequest<IDBValidKey>()
    const item = value as { id: string }
    this.records.set(item.id, value)
    request.succeed(item.id)
    this.transaction.completeSoon()
    return request as unknown as IDBRequest<IDBValidKey>
  }

  delete(key: string) {
    const request = new FakeRequest<undefined>()
    this.records.delete(key)
    request.succeed(undefined)
    this.transaction.completeSoon()
    return request as unknown as IDBRequest<undefined>
  }
}

class FakeTransaction {
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  error: Error | null = null
  private completeListeners = new Set<() => void>()

  constructor(private readonly records: Map<string, unknown>) {}

  objectStore() {
    return new FakeObjectStore(this.records, this) as unknown as IDBObjectStore
  }

  addEventListener(name: string, listener: () => void) {
    if (name === "complete") {
      this.completeListeners.add(listener)
    }
  }

  completeSoon() {
    queueMicrotask(() => {
      this.completeListeners.forEach((listener) => listener())
    })
  }
}

class FakeDatabase {
  objectStoreNames = {
    contains: (name: string) => this.storeNames.has(name),
  }
  private storeNames = new Set<string>()

  constructor(private readonly records: Map<string, unknown>) {}

  createObjectStore(name: string) {
    this.storeNames.add(name)
    return {
      createIndex: () => undefined,
    }
  }

  transaction() {
    return new FakeTransaction(this.records) as unknown as IDBTransaction
  }

  close() {
    return undefined
  }
}

class FakeOpenRequest extends FakeRequest<FakeDatabase> {
  onupgradeneeded: (() => void) | null = null
}

class FakeIndexedDbFactory {
  private readonly records = new Map<string, unknown>()
  private initialized = false

  open() {
    const request = new FakeOpenRequest()
    const database = new FakeDatabase(this.records)

    queueMicrotask(() => {
      request.result = database
      if (!this.initialized) {
        this.initialized = true
        request.onupgradeneeded?.()
      }
      request.onsuccess?.(new Event("success"))
    })

    return request as unknown as IDBOpenDBRequest
  }
}

class FakeLocalStorage {
  private readonly store = new Map<string, string>()

  clear() {
    this.store.clear()
  }

  getItem(key: string) {
    return this.store.get(key) ?? null
  }

  removeItem(key: string) {
    this.store.delete(key)
  }

  setItem(key: string, value: string) {
    this.store.set(key, value)
  }
}

function installBrowserMocks() {
  const eventTarget = new EventTarget()
  const localStorage = new FakeLocalStorage()
  const indexedDB = new FakeIndexedDbFactory()

  class FakeCustomEvent<T = unknown> extends Event {
    detail: T | undefined

    constructor(type: string, init?: CustomEventInit<T>) {
      super(type)
      this.detail = init?.detail
    }
  }

  const windowMock = {
    indexedDB,
    localStorage,
    addEventListener: eventTarget.addEventListener.bind(eventTarget),
    removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
    dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
  }

  Object.defineProperty(globalThis, "window", {
    value: windowMock,
    configurable: true,
    writable: true,
  })

  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true },
    configurable: true,
  })

  Object.defineProperty(globalThis, "CustomEvent", {
    value: FakeCustomEvent,
    configurable: true,
    writable: true,
  })
}

describe("offline daily queue", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installBrowserMocks()
  })

  it("range une vente hors ligne dans le scope sales", async () => {
    await enqueueOfflineSale({
      clientMutationId: "sale:1",
      organizationId: "org-1",
      saleDate: "2026-04-01",
      productType: "OEUF",
      notes: "client marche",
      items: [
        {
          description: "Plateaux d oeufs",
          quantity: 10,
          unit: "PLATEAU",
          unitPriceFcfa: 2500,
        },
      ],
    })

    const items = await listPendingOfflineQueueItemsByScope("sales")

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      type: "CREATE_SALE",
      status: "pending",
      scope: "sales",
    })
    expect(items[0].label).toContain("Vente OEUF")
  })

  it("permet de retenter un element en echec puis le resynchronise", async () => {
    createExpenseMock.mockResolvedValueOnce({
      success: false,
      error: "Montant invalide",
    })
    createExpenseMock.mockResolvedValueOnce({
      success: true,
      data: { id: "expense-1" },
    })

    const queued = await enqueueOfflineExpense({
      clientMutationId: "expense:1",
      organizationId: "org-1",
      description: "Carburant",
      amountFcfa: 20000,
      date: "2026-04-01",
    })

    const firstFlush = await flushOfflineDailyQueue()
    expect(firstFlush.failed).toBe(1)

    const failedItems = await listPendingOfflineQueueItemsByScope("expenses")
    expect(failedItems[0]).toMatchObject({
      id: queued.id,
      status: "failed",
      lastError: "Montant invalide",
    })

    await retryOfflineDailyQueueItem(queued.id)
    const retryFlush = await flushOfflineDailyQueue({ itemId: queued.id })
    expect(retryFlush.synced).toBe(1)

    const remainingItems = await listPendingOfflineQueueItemsByScope("expenses")
    expect(remainingItems).toHaveLength(0)
  })

  it("supprime une saisie journaliere deja traitee cote serveur", async () => {
    createDailyRecordMock.mockResolvedValue({
      success: false,
      error: "Une saisie existe deja pour ce lot a cette date",
    })

    await enqueueOfflineDailyRecord({
      clientMutationId: "daily:1",
      organizationId: "org-1",
      batchId: "batch-1",
      dateIso: "2026-04-01T00:00:00.000Z",
      mortality: 2,
      feedKg: 12,
    })

    const flushResult = await flushOfflineDailyQueue()
    expect(flushResult.synced).toBe(1)

    const items = await listPendingOfflineDailyQueueItems()
    expect(items).toHaveLength(0)

    const meta = readOfflineDailySyncMeta()
    expect(meta.lastSyncedAt).not.toBeNull()
    expect(meta.lastError).toBeNull()
  })
})
