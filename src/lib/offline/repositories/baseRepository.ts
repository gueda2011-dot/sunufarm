"use client"

import { requestToPromise, withStore } from "@/src/lib/offline/db"
import { emitOfflineEvent, OFFLINE_EVENTS } from "@/src/lib/offline/events"
import type { OfflineRecord, OfflineSyncStatus } from "@/src/lib/offline/types"

export class OfflineRepository<TData = unknown> {
  constructor(
    private readonly storeName: string,
    private readonly scope: OfflineRecord<TData>["scope"],
    private readonly entityType: string,
  ) {}

  async getAll(organizationId: string): Promise<Array<OfflineRecord<TData>>> {
    const items = await withStore<Array<OfflineRecord<TData>>>(
      this.storeName,
      "readonly",
      async (store) => requestToPromise(store.getAll()),
    )

    return items
      .filter((item) => item.organizationId === organizationId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  async getById(id: string): Promise<OfflineRecord<TData> | null> {
    const item = await withStore<OfflineRecord<TData> | undefined>(
      this.storeName,
      "readonly",
      async (store) => requestToPromise(store.get(id)),
    )
    return item ?? null
  }

  async listRecent(organizationId: string, limit = 20): Promise<Array<OfflineRecord<TData>>> {
    const items = await this.getAll(organizationId)
    return items.slice(0, limit)
  }

  async upsertMany(records: Array<OfflineRecord<TData>>) {
    if (records.length === 0) return

    await withStore<void>(this.storeName, "readwrite", async (store) => {
      await Promise.all(records.map((record) => requestToPromise(store.put(record))))
    })
    emitOfflineEvent(OFFLINE_EVENTS.storageChanged)
  }

  async upsert(record: OfflineRecord<TData>) {
    await this.upsertMany([record])
  }

  async delete(localId: string) {
    await withStore<void>(this.storeName, "readwrite", async (store) => {
      await requestToPromise(store.delete(localId))
    })
    emitOfflineEvent(OFFLINE_EVENTS.storageChanged)
  }

  async createLocal(params: {
    localId: string
    organizationId: string
    data: TData
    label?: string
    serverId?: string | null
  }): Promise<OfflineRecord<TData>> {
    const now = new Date().toISOString()
    const record: OfflineRecord<TData> = {
      localId: params.localId,
      serverId: params.serverId ?? null,
      organizationId: params.organizationId,
      entityType: this.entityType,
      scope: this.scope,
      label: params.label,
      syncStatus: "pending",
      createdAt: now,
      updatedAt: now,
      lastSyncAttemptAt: null,
      syncError: null,
      data: params.data,
    }

    await this.upsert(record)
    return record
  }

  async updateStatus(
    localId: string,
    syncStatus: OfflineSyncStatus,
    options?: {
      serverId?: string | null
      syncError?: string | null
      lastSyncAttemptAt?: string | null
    },
  ) {
    const current = await this.getById(localId)
    if (!current) return null

    const updated: OfflineRecord<TData> = {
      ...current,
      syncStatus,
      serverId: options?.serverId ?? current.serverId ?? null,
      syncError: options?.syncError ?? null,
      lastSyncAttemptAt: options?.lastSyncAttemptAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await this.upsert(updated)
    return updated
  }

  markPending(localId: string) {
    return this.updateStatus(localId, "pending")
  }

  markSynced(localId: string, serverId?: string | null) {
    return this.updateStatus(localId, "synced", { serverId, syncError: null })
  }

  markFailed(localId: string, syncError?: string | null) {
    return this.updateStatus(localId, "failed", { syncError: syncError ?? null })
  }

  markConflict(localId: string, syncError?: string | null) {
    return this.updateStatus(localId, "conflict", { syncError: syncError ?? null })
  }
}
