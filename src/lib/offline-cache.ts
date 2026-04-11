"use client"

import {
  OFFLINE_CACHE_EVENT,
  OFFLINE_OPTIMISTIC_STORE,
  OFFLINE_QUEUE_STORE,
  OFFLINE_RESOURCE_STORE,
} from "@/src/lib/offline-keys"
import { requestToPromise, withStore, openOfflineDatabase } from "@/src/lib/offline/db"
import { emitOfflineEvent, subscribeOfflineEvent } from "@/src/lib/offline/events"
import type { OfflineResourceCacheEntry } from "@/src/lib/offline/types"

export type OfflineCacheEntry<T = unknown> = OfflineResourceCacheEntry<T>

function emitOfflineCacheChanged() {
  emitOfflineEvent(OFFLINE_CACHE_EVENT)
}

export function openOfflineDb(): Promise<IDBDatabase> {
  return openOfflineDatabase()
}

export { requestToPromise, withStore }

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
  entry: Omit<OfflineCacheEntry<T>, "id">,
): Promise<void> {
  if (typeof window === "undefined") return

  const nextEntry: OfflineCacheEntry<T> = {
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
      await Promise.all(entries.map((entry) => requestToPromise(store.delete(entry.id))))
    },
  )
  emitOfflineCacheChanged()
}

export function subscribeToOfflineCache(callback: () => void) {
  return subscribeOfflineEvent(OFFLINE_CACHE_EVENT, callback)
}

export { OFFLINE_QUEUE_STORE, OFFLINE_OPTIMISTIC_STORE }
