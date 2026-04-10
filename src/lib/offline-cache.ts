"use client"

import {
  OFFLINE_CACHE_EVENT,
  OFFLINE_DB_NAME,
  OFFLINE_DB_VERSION,
  OFFLINE_OPTIMISTIC_STORE,
  OFFLINE_QUEUE_STORE,
  OFFLINE_RESOURCE_STORE,
} from "@/src/lib/offline-keys"

export interface OfflineCacheEntry<T = unknown> {
  key: string
  version: number
  organizationId: string
  savedAt: string
  ttlMs: number
  data: T
}

function emitOfflineCacheChanged() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(OFFLINE_CACHE_EVENT))
}

function ensureOfflineStores(db: IDBDatabase) {
  if (!db.objectStoreNames.contains(OFFLINE_QUEUE_STORE)) {
    const store = db.createObjectStore(OFFLINE_QUEUE_STORE, { keyPath: "id" })
    store.createIndex("status", "status", { unique: false })
    store.createIndex("createdAt", "createdAt", { unique: false })
    store.createIndex("type", "type", { unique: false })
  }

  if (!db.objectStoreNames.contains(OFFLINE_RESOURCE_STORE)) {
    const store = db.createObjectStore(OFFLINE_RESOURCE_STORE, { keyPath: "id" })
    store.createIndex("organizationId", "organizationId", { unique: false })
    store.createIndex("key", "key", { unique: false })
    store.createIndex("savedAt", "savedAt", { unique: false })
  }

  if (!db.objectStoreNames.contains(OFFLINE_OPTIMISTIC_STORE)) {
    const store = db.createObjectStore(OFFLINE_OPTIMISTIC_STORE, { keyPath: "id" })
    store.createIndex("organizationId", "organizationId", { unique: false })
    store.createIndex("scope", "scope", { unique: false })
    store.createIndex("status", "status", { unique: false })
    store.createIndex("createdAt", "createdAt", { unique: false })
  }
}

export function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION)

    request.onupgradeneeded = () => {
      ensureOfflineStores(request.result)
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("INDEXED_DB_OPEN_FAILED"))
  })
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("INDEXED_DB_REQUEST_FAILED"))
  })
}

export function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  return openOfflineDb().then((db) => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const store = transaction.objectStore(storeName)

    transaction.onerror = () => reject(transaction.error ?? new Error("INDEXED_DB_TX_FAILED"))
    transaction.onabort = () => reject(transaction.error ?? new Error("INDEXED_DB_TX_ABORTED"))
    transaction.addEventListener("complete", () => db.close())

    void handler(store).then(resolve).catch(reject)
  }))
}

function buildResourceEntryId(key: string, organizationId: string) {
  return `${organizationId}:${key}`
}

export function isCacheFresh(savedAt: string, ttlMs: number) {
  return Date.now() - new Date(savedAt).getTime() <= ttlMs
}

export async function getCachedResource<T>(
  key: string,
  organizationId: string,
): Promise<OfflineCacheEntry<T> | null> {
  if (typeof window === "undefined") return null

  try {
    const entry = await withStore<OfflineCacheEntry<T> | undefined>(
      OFFLINE_RESOURCE_STORE,
      "readonly",
      async (store) => requestToPromise(store.get(buildResourceEntryId(key, organizationId))),
    )

    return entry ?? null
  } catch {
    return null
  }
}

export async function listCachedResources(organizationId: string): Promise<OfflineCacheEntry[]> {
  if (typeof window === "undefined") return []

  try {
    const entries = await withStore<OfflineCacheEntry[]>(
      OFFLINE_RESOURCE_STORE,
      "readonly",
      async (store) => requestToPromise(store.getAll()),
    )

    return entries
      .filter((entry) => entry.organizationId === organizationId)
      .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
  } catch {
    return []
  }
}

export async function setCachedResource<T>(
  entry: OfflineCacheEntry<T>,
): Promise<void> {
  if (typeof window === "undefined") return

  const nextEntry = {
    ...entry,
    id: buildResourceEntryId(entry.key, entry.organizationId),
  }

  await withStore<void>(
    OFFLINE_RESOURCE_STORE,
    "readwrite",
    async (store) => {
      await requestToPromise(store.put(nextEntry))
    },
  )
  emitOfflineCacheChanged()
}

export async function removeCachedResource(
  key: string,
  organizationId: string,
): Promise<void> {
  if (typeof window === "undefined") return

  await withStore<void>(
    OFFLINE_RESOURCE_STORE,
    "readwrite",
    async (store) => {
      await requestToPromise(store.delete(buildResourceEntryId(key, organizationId)))
    },
  )
  emitOfflineCacheChanged()
}

export async function clearOrganizationCache(organizationId: string): Promise<void> {
  if (typeof window === "undefined") return

  const entries = await listCachedResources(organizationId)
  await withStore<void>(
    OFFLINE_RESOURCE_STORE,
    "readwrite",
    async (store) => {
      await Promise.all(entries.map((entry) => requestToPromise(store.delete(buildResourceEntryId(entry.key, organizationId)))))
    },
  )
  emitOfflineCacheChanged()
}

export function subscribeToOfflineCache(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {}
  }

  const handler = () => callback()
  window.addEventListener(OFFLINE_CACHE_EVENT, handler)

  return () => {
    window.removeEventListener(OFFLINE_CACHE_EVENT, handler)
  }
}

