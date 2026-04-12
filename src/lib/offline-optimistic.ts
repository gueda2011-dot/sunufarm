"use client"

import { withStore, requestToPromise } from "@/src/lib/offline-cache"
import { OFFLINE_OPTIMISTIC_STORE } from "@/src/lib/offline-keys"

export interface OptimisticItem<T = unknown> {
  id: string
  organizationId: string
  scope: string
  type: string
  status: "pending" | "synced" | "failed"
  createdAt: string
  updatedAt: string
  label?: string
  error?: string
  data: T
}

function emitOptimisticChanged() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent("sunufarm:offline-optimistic-changed"))
}

export async function addOptimisticItem<T>(item: Omit<OptimisticItem<T>, "createdAt" | "updatedAt" | "status"> & {
  status?: OptimisticItem["status"]
}) {
  const now = new Date().toISOString()
  const nextItem: OptimisticItem<T> = {
    ...item,
    status: item.status ?? "pending",
    createdAt: now,
    updatedAt: now,
  }

  await withStore<void>(
    OFFLINE_OPTIMISTIC_STORE,
    "readwrite",
    async (store) => {
      await requestToPromise(store.put(nextItem))
    },
  )
  emitOptimisticChanged()
  return nextItem
}

export async function removeOptimisticItem(id: string) {
  await withStore<void>(
    OFFLINE_OPTIMISTIC_STORE,
    "readwrite",
    async (store) => {
      await requestToPromise(store.delete(id))
    },
  )
  emitOptimisticChanged()
}

export async function listOptimisticItems<T = unknown>(
  organizationId: string,
  scope?: string,
): Promise<Array<OptimisticItem<T>>> {
  const items = await withStore<Array<OptimisticItem<T>>>(
    OFFLINE_OPTIMISTIC_STORE,
    "readonly",
    async (store) => requestToPromise(store.getAll()),
  )

  return items
    .filter((item) => item.organizationId === organizationId)
    .filter((item) => !scope || item.scope === scope)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export async function markOptimisticItemSynced(id: string) {
  await updateOptimisticItem(id, { status: "synced", error: undefined })
}

export async function markOptimisticItemFailed(id: string, error?: string) {
  await updateOptimisticItem(id, { status: "failed", error })
}

async function updateOptimisticItem(
  id: string,
  updates: Partial<Pick<OptimisticItem, "status" | "error">>,
) {
  await withStore<void>(
    OFFLINE_OPTIMISTIC_STORE,
    "readwrite",
    async (store) => {
      const current = await requestToPromise<OptimisticItem | undefined>(store.get(id))
      if (!current) return
      await requestToPromise(store.put({
        ...current,
        ...updates,
        updatedAt: new Date().toISOString(),
      }))
    },
  )
  emitOptimisticChanged()
}

export function subscribeToOptimisticItems(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {}
  }

  const handler = () => callback()
  window.addEventListener("sunufarm:offline-optimistic-changed", handler)

  return () => {
    window.removeEventListener("sunufarm:offline-optimistic-changed", handler)
  }
}

