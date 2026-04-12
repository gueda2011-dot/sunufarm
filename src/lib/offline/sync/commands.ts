"use client"

import type { OfflineModuleScope, OfflineSyncCommand } from "@/src/lib/offline/types"

export function createOfflineCommand<TPayload>(params: {
  organizationId: string
  entityType: string
  scope: OfflineModuleScope
  action: string
  localId: string
  payload: TPayload
  label?: string
  serverId?: string | null
  maxRetries?: number
}): OfflineSyncCommand<TPayload> {
  const now = new Date().toISOString()
  return {
    id: `${params.scope}:${params.action}:${params.localId}`,
    organizationId: params.organizationId,
    entityType: params.entityType,
    scope: params.scope,
    action: params.action,
    localId: params.localId,
    serverId: params.serverId ?? null,
    payload: params.payload,
    status: "pending",
    retryCount: 0,
    maxRetries: params.maxRetries ?? 5,
    createdAt: now,
    updatedAt: now,
    lastAttemptAt: null,
    error: null,
    label: params.label,
  }
}
