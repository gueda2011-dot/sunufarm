import { OFFLINE_STORE_DEFINITIONS } from "@/src/lib/offline/schema"

export function runOfflineMigrations(db: IDBDatabase, transaction: IDBTransaction) {
  for (const definition of OFFLINE_STORE_DEFINITIONS) {
    const store = db.objectStoreNames.contains(definition.name)
      ? transaction.objectStore(definition.name)
      : db.createObjectStore(definition.name, { keyPath: definition.keyPath })

    for (const index of definition.indexes) {
      const hasIndex =
        typeof store.indexNames?.contains === "function"
          ? store.indexNames.contains(index.name)
          : false
      if (!hasIndex) {
        store.createIndex(index.name, index.keyPath, index.options)
      }
    }
  }
}
