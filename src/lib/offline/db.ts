"use client"

import { runOfflineMigrations } from "@/src/lib/offline/migrations"
import { OFFLINE_DB_NAME, OFFLINE_DB_VERSION } from "@/src/lib/offline/schema"

export function openOfflineDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION)

    request.onupgradeneeded = () => {
      const upgradeTransaction = request.transaction
      if (!upgradeTransaction) return
      runOfflineMigrations(request.result, upgradeTransaction)
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

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error("INDEXED_DB_TX_FAILED"))
    transaction.onabort = () => reject(transaction.error ?? new Error("INDEXED_DB_TX_ABORTED"))
  })
}

export async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore, transaction: IDBTransaction) => Promise<T>,
): Promise<T> {
  const db = await openOfflineDatabase()
  const transaction = db.transaction(storeName, mode)
  const store = transaction.objectStore(storeName)

  try {
    const result = await handler(store, transaction)
    await transactionDone(transaction)
    return result
  } finally {
    db.close()
  }
}

export async function withStores<T>(
  storeNames: string[],
  mode: IDBTransactionMode,
  handler: (
    stores: Record<string, IDBObjectStore>,
    transaction: IDBTransaction,
  ) => Promise<T>,
): Promise<T> {
  const db = await openOfflineDatabase()
  const transaction = db.transaction(storeNames, mode)
  const stores = Object.fromEntries(
    storeNames.map((storeName) => [storeName, transaction.objectStore(storeName)]),
  ) as Record<string, IDBObjectStore>

  try {
    const result = await handler(stores, transaction)
    await transactionDone(transaction)
    return result
  } finally {
    db.close()
  }
}
