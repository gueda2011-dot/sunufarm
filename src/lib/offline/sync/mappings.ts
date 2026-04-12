"use client"

import { requestToPromise, withStore } from "@/src/lib/offline/db"
import { OFFLINE_STORE_NAMES } from "@/src/lib/offline/schema"
import type { OfflineSyncMapping } from "@/src/lib/offline/types"

function buildMappingId(entityType: string, localId: string) {
  return `${entityType}:${localId}`
}

export async function saveSyncMapping(mapping: Omit<OfflineSyncMapping, "id" | "createdAt" | "updatedAt">) {
  const now = new Date().toISOString()
  const record: OfflineSyncMapping = {
    id: buildMappingId(mapping.entityType, mapping.localId),
    createdAt: now,
    updatedAt: now,
    ...mapping,
  }

  await withStore<void>(OFFLINE_STORE_NAMES.syncMappings, "readwrite", async (store) => {
    await requestToPromise(store.put(record))
  })

  return record
}

export async function findServerId(entityType: string, localId: string) {
  const mapping = await withStore<OfflineSyncMapping | undefined>(
    OFFLINE_STORE_NAMES.syncMappings,
    "readonly",
    async (store) => requestToPromise(store.get(buildMappingId(entityType, localId))),
  )

  return mapping?.serverId ?? null
}
