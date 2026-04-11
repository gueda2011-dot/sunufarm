export type OfflineSyncStatus = "pending" | "synced" | "failed" | "conflict"

export type OfflineBootstrapStatus =
  | "idle"
  | "started"
  | "in_progress"
  | "completed"
  | "failed"

export type OfflineModuleScope =
  | "daily"
  | "health"
  | "stock"
  | "sales"
  | "eggs"
  | "purchases"
  | "expenses"
  | "offline"
  | "references"
  | "session"

export interface OfflineEntityState {
  localId: string
  serverId?: string | null
  organizationId: string
  syncStatus: OfflineSyncStatus
  createdAt: string
  updatedAt: string
  lastSyncAttemptAt?: string | null
  syncError?: string | null
}

export interface OfflineRecord<TData = unknown>
  extends OfflineEntityState {
  entityType: string
  scope: OfflineModuleScope
  label?: string
  data: TData
}

export interface OfflineReferenceRecord<TData = unknown> {
  id: string
  organizationId: string
  entityType: string
  scope: OfflineModuleScope
  serverId?: string | null
  data: TData
  savedAt: string
  updatedAt: string
}

export interface OfflineResourceCacheEntry<T = unknown> {
  id: string
  key: string
  version: number
  organizationId: string
  savedAt: string
  ttlMs: number
  data: T
}

export interface OfflineSessionRecord {
  id: string
  userId: string
  organizationId: string
  displayName: string
  role: string
  permissions: {
    farmPermissions?: unknown
    modulePermissions?: unknown
  }
  lastValidatedAt: string
  expiresAt: string
  devicePrepared: boolean
  savedAt: string
}

export interface OfflineBootstrapMeta {
  id: string
  organizationId: string
  status: OfflineBootstrapStatus
  startedAt?: string | null
  completedAt?: string | null
  lastBootstrapAt?: string | null
  bootstrapVersion: string
  modulesReady: string[]
  counts: Record<string, number>
  error?: string | null
  updatedAt: string
}

export interface OfflineSyncCommand<TPayload = unknown> {
  id: string
  organizationId: string
  entityType: string
  scope: OfflineModuleScope
  action: string
  localId: string
  serverId?: string | null
  payload: TPayload
  status: OfflineSyncStatus
  retryCount: number
  maxRetries: number
  createdAt: string
  updatedAt: string
  lastAttemptAt?: string | null
  error?: string | null
  label?: string
}

export interface OfflineSyncMapping {
  id: string
  organizationId: string
  entityType: string
  localId: string
  serverId: string
  createdAt: string
  updatedAt: string
}

export interface OfflineSyncError {
  id: string
  organizationId: string
  entityType: string
  localId?: string | null
  commandId?: string | null
  scope: OfflineModuleScope
  message: string
  backendReason?: string | null
  conflict: boolean
  payload?: unknown
  mappedPayload?: unknown
  createdAt: string
}
