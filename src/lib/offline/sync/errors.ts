"use client"

import { requestToPromise, withStore } from "@/src/lib/offline/db"
import { OFFLINE_STORE_NAMES } from "@/src/lib/offline/schema"
import { emitOfflineEvent, OFFLINE_EVENTS } from "@/src/lib/offline/events"
import type { OfflineSyncError } from "@/src/lib/offline/types"

export async function logSyncError(
  error: Omit<OfflineSyncError, "id" | "createdAt">,
) {
  const record: OfflineSyncError = {
    ...error,
    id: `${error.scope}:${error.entityType}:${error.localId ?? error.commandId ?? Date.now()}`,
    createdAt: new Date().toISOString(),
  }

  await withStore<void>(OFFLINE_STORE_NAMES.syncErrors, "readwrite", async (store) => {
    await requestToPromise(store.put(record))
  })
  emitOfflineEvent(OFFLINE_EVENTS.syncChanged)
  return record
}

export async function listSyncErrors(organizationId: string) {
  const items = await withStore<OfflineSyncError[]>(
    OFFLINE_STORE_NAMES.syncErrors,
    "readonly",
    async (store) => requestToPromise(store.getAll()),
  )

  return items
    .filter((item) => item.organizationId === organizationId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}
