"use client"

import { requestToPromise, withStore } from "@/src/lib/offline/db"
import { emitOfflineEvent, OFFLINE_EVENTS } from "@/src/lib/offline/events"
import { OFFLINE_STORE_NAMES } from "@/src/lib/offline/schema"
import type { OfflineSessionRecord } from "@/src/lib/offline/types"

const OFFLINE_SESSION_ID = "current"
const DEFAULT_OFFLINE_SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7

export interface OfflineSessionContext {
  userId: string
  organizationId: string
  displayName: string
  organizationName?: string
  role: string
  userRole?: string
  permissions: {
    farmPermissions?: unknown
    modulePermissions?: unknown
  }
  lastValidatedAt: string
  expiresAt: string
  devicePrepared: boolean
  savedAt: string
}

function normalizeLegacyContext(raw: unknown): OfflineSessionContext | null {
  if (!raw || typeof raw !== "object") return null
  const legacy = raw as Record<string, unknown>
  if (typeof legacy.userId !== "string" || typeof legacy.organizationId !== "string") {
    return null
  }

  const savedAt = typeof legacy.savedAt === "string" ? legacy.savedAt : new Date().toISOString()
  const expiresAt =
    typeof legacy.expiresAt === "string"
      ? legacy.expiresAt
      : new Date(new Date(savedAt).getTime() + DEFAULT_OFFLINE_SESSION_MAX_AGE_MS).toISOString()

  return {
    userId: legacy.userId,
    organizationId: legacy.organizationId,
    displayName:
      typeof legacy.displayName === "string"
        ? legacy.displayName
        : typeof legacy.organizationName === "string"
          ? legacy.organizationName
          : "Utilisateur SunuFarm",
    organizationName:
      typeof legacy.organizationName === "string" ? legacy.organizationName : undefined,
    role:
      typeof legacy.role === "string"
        ? legacy.role
        : typeof legacy.userRole === "string"
          ? legacy.userRole
          : "UNKNOWN",
    permissions: {
      farmPermissions: legacy.farmPermissions,
      modulePermissions: legacy.modulePermissions,
    },
    lastValidatedAt:
      typeof legacy.lastValidatedAt === "string"
        ? legacy.lastValidatedAt
        : savedAt,
    expiresAt,
    devicePrepared: Boolean(legacy.devicePrepared),
    savedAt,
  }
}

function toRecord(context: OfflineSessionContext): OfflineSessionRecord {
  return {
    id: OFFLINE_SESSION_ID,
    userId: context.userId,
    organizationId: context.organizationId,
    displayName: context.displayName,
    role: context.role,
    permissions: context.permissions,
    lastValidatedAt: context.lastValidatedAt,
    expiresAt: context.expiresAt,
    devicePrepared: context.devicePrepared,
    savedAt: context.savedAt,
  }
}

function fromRecord(record: OfflineSessionRecord | null): OfflineSessionContext | null {
  if (!record) return null
  return {
    userId: record.userId,
    organizationId: record.organizationId,
    displayName: record.displayName,
    organizationName: undefined,
    role: record.role,
    userRole: record.role,
    permissions: record.permissions,
    lastValidatedAt: record.lastValidatedAt,
    expiresAt: record.expiresAt,
    devicePrepared: record.devicePrepared,
    savedAt: record.savedAt,
  }
}

export async function readOfflineSessionContext(
  options?: { allowExpired?: boolean },
): Promise<OfflineSessionContext | null> {
  if (typeof window === "undefined") return null

  try {
    const record = await withStore<OfflineSessionRecord | undefined>(
      OFFLINE_STORE_NAMES.offlineSession,
      "readonly",
      async (store) => requestToPromise(store.get(OFFLINE_SESSION_ID)),
    )

    const context = fromRecord(record ?? null)
    if (!context) return null

    if (!options?.allowExpired && new Date(context.expiresAt).getTime() < Date.now()) {
      return null
    }

    return context
  } catch {
    return null
  }
}

export async function writeOfflineSessionContext(
  input: Partial<OfflineSessionContext> & {
    userId: string
    organizationId: string
  },
  options?: { maxAgeMs?: number },
) {
  if (typeof window === "undefined") return

  const base = normalizeLegacyContext(input) ?? {
    userId: input.userId,
    organizationId: input.organizationId,
    displayName: input.displayName ?? "Utilisateur SunuFarm",
    organizationName: input.organizationName,
    role: input.role ?? "UNKNOWN",
    userRole: input.userRole ?? input.role ?? "UNKNOWN",
    permissions: input.permissions ?? {},
    lastValidatedAt: input.lastValidatedAt ?? new Date().toISOString(),
    expiresAt:
      input.expiresAt ??
      new Date(Date.now() + (options?.maxAgeMs ?? DEFAULT_OFFLINE_SESSION_MAX_AGE_MS)).toISOString(),
    devicePrepared: input.devicePrepared ?? false,
    savedAt: input.savedAt ?? new Date().toISOString(),
  }

  await withStore<void>(OFFLINE_STORE_NAMES.offlineSession, "readwrite", async (store) => {
    await requestToPromise(store.put(toRecord(base)))
  })
  emitOfflineEvent(OFFLINE_EVENTS.sessionChanged)
}

export async function clearOfflineSessionContext() {
  if (typeof window === "undefined") return

  await withStore<void>(OFFLINE_STORE_NAMES.offlineSession, "readwrite", async (store) => {
    await requestToPromise(store.delete(OFFLINE_SESSION_ID))
  })
  emitOfflineEvent(OFFLINE_EVENTS.sessionChanged)
}

export async function markOfflineDevicePrepared(devicePrepared: boolean) {
  const current = await readOfflineSessionContext({ allowExpired: true })
  if (!current) return

  await writeOfflineSessionContext({
    ...current,
    devicePrepared,
    savedAt: new Date().toISOString(),
  })
}

export function isOfflineSessionValid(context: OfflineSessionContext | null) {
  if (!context) return false
  return new Date(context.expiresAt).getTime() >= Date.now()
}
