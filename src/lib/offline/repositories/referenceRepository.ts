"use client"

import { requestToPromise, withStore } from "@/src/lib/offline/db"
import { emitOfflineEvent, OFFLINE_EVENTS } from "@/src/lib/offline/events"
import type { OfflineModuleScope, OfflineReferenceRecord } from "@/src/lib/offline/types"

export class OfflineReferenceRepository<TData = unknown> {
  constructor(
    private readonly storeName: string,
    private readonly scope: OfflineModuleScope,
    private readonly entityType: string,
  ) {}

  async getAll(organizationId: string): Promise<Array<OfflineReferenceRecord<TData>>> {
    const items = await withStore<Array<OfflineReferenceRecord<TData>>>(
      this.storeName,
      "readonly",
      async (store) => requestToPromise(store.getAll()),
    )

    return items
      .filter((item) => item.organizationId === organizationId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  async getById(id: string) {
    const item = await withStore<OfflineReferenceRecord<TData> | undefined>(
      this.storeName,
      "readonly",
      async (store) => requestToPromise(store.get(id)),
    )
    return item ?? null
  }

  async upsertMany(
    organizationId: string,
    rows: Array<{
      id: string
      serverId?: string | null
      data: TData
    }>,
  ) {
    if (rows.length === 0) return

    const now = new Date().toISOString()
    await withStore<void>(this.storeName, "readwrite", async (store) => {
      await Promise.all(rows.map((row) => requestToPromise(store.put({
        id: row.id,
        organizationId,
        entityType: this.entityType,
        scope: this.scope,
        serverId: row.serverId ?? row.id,
        data: row.data,
        savedAt: now,
        updatedAt: now,
      }))))
    })
    emitOfflineEvent(OFFLINE_EVENTS.storageChanged)
  }
}
