"use client"

import { requestToPromise, withStore } from "@/src/lib/offline/db"
import { emitOfflineEvent, OFFLINE_EVENTS } from "@/src/lib/offline/events"
import { OFFLINE_STORE_NAMES } from "@/src/lib/offline/schema"
import type { OfflineModuleScope, OfflineSyncCommand, OfflineSyncStatus } from "@/src/lib/offline/types"

export async function enqueueSyncCommand<TPayload>(command: OfflineSyncCommand<TPayload>) {
  await withStore<void>(OFFLINE_STORE_NAMES.syncQueue, "readwrite", async (store) => {
    await requestToPromise(store.put(command))
  })
  emitOfflineEvent(OFFLINE_EVENTS.syncChanged)
  return command
}

export async function listSyncCommands(organizationId: string, scope?: OfflineModuleScope) {
  const items = await withStore<Array<OfflineSyncCommand>>(
    OFFLINE_STORE_NAMES.syncQueue,
    "readonly",
    async (store) => requestToPromise(store.getAll()),
  )

  return items
    .filter((item) => item.organizationId === organizationId)
    .filter((item) => !scope || item.scope === scope)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export async function listPendingSyncCommands(organizationId: string, scope?: OfflineModuleScope) {
  const items = await listSyncCommands(organizationId, scope)
  return items.filter((item) => item.status === "pending" || item.status === "failed")
}

// Délai au-delà duquel un item "syncing" est considéré bloqué (crash mid-sync)
const SYNC_STUCK_TIMEOUT_MS = 5 * 60 * 1000

export async function recoverStuckSyncingCommands(organizationId: string) {
  const items = await listSyncCommands(organizationId)
  const stuckItems = items.filter((item) => {
    if (item.status !== "syncing") return false
    const lastAttempt = item.lastAttemptAt ? new Date(item.lastAttemptAt).getTime() : 0
    return Date.now() - lastAttempt > SYNC_STUCK_TIMEOUT_MS
  })

  for (const item of stuckItems) {
    await updateSyncCommandStatus(item.id, "pending", { retryCount: item.retryCount })
  }

  return stuckItems.length
}

export async function getSyncCommand(id: string) {
  const item = await withStore<OfflineSyncCommand | undefined>(
    OFFLINE_STORE_NAMES.syncQueue,
    "readonly",
    async (store) => requestToPromise(store.get(id)),
  )
  return item ?? null
}

export async function updateSyncCommandStatus(
  id: string,
  status: OfflineSyncStatus,
  updates?: Partial<Pick<OfflineSyncCommand, "serverId" | "error" | "retryCount" | "lastAttemptAt">>,
) {
  const current = await getSyncCommand(id)
  if (!current) return null

  const next: OfflineSyncCommand = {
    ...current,
    status,
    serverId: updates?.serverId ?? current.serverId ?? null,
    error: updates?.error ?? null,
    retryCount: updates?.retryCount ?? current.retryCount,
    lastAttemptAt: updates?.lastAttemptAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  await enqueueSyncCommand(next)
  return next
}

export async function deleteSyncCommand(id: string) {
  await withStore<void>(OFFLINE_STORE_NAMES.syncQueue, "readwrite", async (store) => {
    await requestToPromise(store.delete(id))
  })
  emitOfflineEvent(OFFLINE_EVENTS.syncChanged)
}
