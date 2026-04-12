import { describe, expect, it } from "vitest"
import { runOfflineMigrations } from "@/src/lib/offline/migrations"
import { OFFLINE_STORE_NAMES } from "@/src/lib/offline/schema"

class FakeStore {
  indexNames = {
    contains: (name: string) => this.indexes.has(name),
  }
  indexes = new Set<string>()
  createIndex(name: string) {
    this.indexes.add(name)
  }
}

class FakeDb {
  stores = new Map<string, FakeStore>()
  objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  }
  createObjectStore(name: string) {
    const store = new FakeStore()
    this.stores.set(name, store)
    return store as unknown as IDBObjectStore
  }
}

class FakeTransaction {
  constructor(private readonly db: FakeDb) {}
  objectStore(name: string) {
    return this.db.stores.get(name) as unknown as IDBObjectStore
  }
}

describe("runOfflineMigrations", () => {
  it("cree les stores et indexes attendus", () => {
    const db = new FakeDb()
    const transaction = new FakeTransaction(db)

    runOfflineMigrations(db as unknown as IDBDatabase, transaction as unknown as IDBTransaction)

    expect(db.stores.has(OFFLINE_STORE_NAMES.syncQueue)).toBe(true)
    expect(db.stores.has(OFFLINE_STORE_NAMES.dailyEntries)).toBe(true)
    expect(db.stores.has(OFFLINE_STORE_NAMES.appMeta)).toBe(true)
  })
})
