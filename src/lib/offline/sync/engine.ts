"use client"

import { createDailyRecord } from "@/src/actions/daily-records"
import { createEggRecord } from "@/src/actions/eggs"
import { createExpense } from "@/src/actions/expenses"
import { createPurchase } from "@/src/actions/purchases"
import { createSale } from "@/src/actions/sales"
import { createFeedMovement, createMedicineMovement } from "@/src/actions/stock"
import { createTreatment, createVaccination } from "@/src/actions/health"
import { emitOfflineEvent, OFFLINE_EVENTS } from "@/src/lib/offline/events"
import {
  dailyRepository,
  eggProductionRepository,
  healthRepository,
  purchasesRepository,
  salesRepository,
  stockMovementRepository,
} from "@/src/lib/offline/repositories"
import { logSyncError } from "@/src/lib/offline/sync/errors"
import { buildDailyServerPayload, type DailySyncDebugPayload } from "@/src/lib/offline/sync/daily"
import { saveSyncMapping } from "@/src/lib/offline/sync/mappings"
import {
  deleteSyncCommand,
  listPendingSyncCommands,
  updateSyncCommandStatus,
} from "@/src/lib/offline/sync/queue"
import type { OfflineSyncCommand } from "@/src/lib/offline/types"

function isTemporarySyncError(error: unknown) {
  return (
    (typeof navigator !== "undefined" && !navigator.onLine) ||
    (error instanceof Error && /fetch|network|offline|failed to fetch/i.test(error.message))
  )
}

function isConflictMessage(message?: string | null) {
  return !!message && /deja|already|duplicate|conflict/i.test(message)
}

async function replayCommand(command: OfflineSyncCommand) {
  switch (command.action) {
    case "CREATE_DAILY_RECORD": {
      const { serverPayload, debug } = await buildDailyServerPayload(
        command.payload as Parameters<typeof buildDailyServerPayload>[0],
        { fallbackLocalId: command.localId },
      )

      console.info("[offline-sync][daily] payload before mapping", {
        commandId: command.id,
        localId: command.localId,
        payload: debug.originalPayload,
      })
      console.info("[offline-sync][daily] payload after mapping", {
        commandId: command.id,
        localId: command.localId,
        payload: debug.mappedPayload,
      })

      return {
        debug,
        result: await createDailyRecord(serverPayload),
      }
    }
    case "CREATE_EXPENSE":
      return createExpense(command.payload)
    case "CREATE_VACCINATION":
      return createVaccination({
        ...(command.payload as Record<string, unknown>),
        date: new Date((command.payload as { date: string }).date),
      })
    case "CREATE_TREATMENT":
      return createTreatment({
        ...(command.payload as Record<string, unknown>),
        startDate: new Date((command.payload as { startDate: string }).startDate),
      })
    case "CREATE_SALE":
      return createSale(command.payload)
    case "CREATE_FEED_MOVEMENT":
      return createFeedMovement({
        ...(command.payload as Record<string, unknown>),
        date: new Date((command.payload as { date: string }).date),
      })
    case "CREATE_MEDICINE_MOVEMENT":
      return createMedicineMovement({
        ...(command.payload as Record<string, unknown>),
        date: new Date((command.payload as { date: string }).date),
      })
    case "CREATE_EGG_RECORD":
      return createEggRecord({
        ...(command.payload as Record<string, unknown>),
        date: new Date((command.payload as { date: string }).date),
      })
    case "CREATE_PURCHASE":
      return createPurchase({
        ...(command.payload as Record<string, unknown>),
        purchaseDate: new Date((command.payload as { purchaseDate: string }).purchaseDate),
      })
    default:
      return { success: false, error: `SYNC_ACTION_NOT_SUPPORTED:${command.action}` }
  }
}

async function markLocalRecordAfterSync(command: OfflineSyncCommand, resultData: unknown) {
  const serverId =
    typeof resultData === "object" && resultData !== null && "id" in resultData
      ? String((resultData as { id: string }).id)
      : null

  if (serverId) {
    await saveSyncMapping({
      organizationId: command.organizationId,
      entityType: command.entityType,
      localId: command.localId,
      serverId,
    })
  }

  switch (command.scope) {
    case "daily":
      await dailyRepository.markSynced(command.localId, serverId)
      break
    case "health":
      await healthRepository.markSynced(command.localId, serverId)
      break
    case "stock":
      await stockMovementRepository.markSynced(command.localId, serverId)
      break
    case "eggs":
      await eggProductionRepository.markSynced(command.localId, serverId)
      break
    case "sales":
      await salesRepository.markSynced(command.localId, serverId)
      break
    case "purchases":
      await purchasesRepository.markSynced(command.localId, serverId)
      break
  }
}

async function markLocalRecordFailure(command: OfflineSyncCommand, message: string, conflict: boolean) {
  switch (command.scope) {
    case "daily":
      await (conflict
        ? dailyRepository.markConflict(command.localId, message)
        : dailyRepository.markFailed(command.localId, message))
      break
    case "health":
      await (conflict
        ? healthRepository.markConflict(command.localId, message)
        : healthRepository.markFailed(command.localId, message))
      break
    case "stock":
      await (conflict
        ? stockMovementRepository.markConflict(command.localId, message)
        : stockMovementRepository.markFailed(command.localId, message))
      break
    case "eggs":
      await (conflict
        ? eggProductionRepository.markConflict(command.localId, message)
        : eggProductionRepository.markFailed(command.localId, message))
      break
    case "sales":
      await (conflict
        ? salesRepository.markConflict(command.localId, message)
        : salesRepository.markFailed(command.localId, message))
      break
    case "purchases":
      await (conflict
        ? purchasesRepository.markConflict(command.localId, message)
        : purchasesRepository.markFailed(command.localId, message))
      break
  }
}

export async function runOfflineSync(organizationId: string, scope?: OfflineSyncCommand["scope"]) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { processed: 0, synced: 0, failed: 0 }
  }

  const commands = await listPendingSyncCommands(organizationId, scope)
  let processed = 0
  let synced = 0
  let failed = 0
  let lastError: string | null = null

  for (const command of commands) {
    processed += 1

    try {
      const replayed = await replayCommand(command)
      const result =
        replayed && typeof replayed === "object" && "result" in replayed
          ? replayed.result
          : replayed
      const debug =
        replayed && typeof replayed === "object" && "debug" in replayed
          ? (replayed.debug as DailySyncDebugPayload | undefined)
          : undefined

      if (result && typeof result === "object" && "success" in result && result.success) {
        await markLocalRecordAfterSync(
          command,
          "data" in result ? result.data : null,
        )
        await deleteSyncCommand(command.id)
        synced += 1
        continue
      }

      const errorMessage =
        result && typeof result === "object" && "error" in result
          ? result.error
          : "SYNC_FAILED"
      const conflict = isConflictMessage(errorMessage)
      const nextStatus = conflict ? "conflict" : "failed"
      const retryCount = conflict ? command.retryCount : command.retryCount + 1

      await updateSyncCommandStatus(command.id, nextStatus, {
        error: errorMessage,
        retryCount,
      })
      await markLocalRecordFailure(command, errorMessage ?? "SYNC_FAILED", conflict)
      await logSyncError({
        organizationId,
        entityType: command.entityType,
        localId: command.localId,
        commandId: command.id,
        scope: command.scope,
        message: errorMessage ?? "SYNC_FAILED",
        backendReason: errorMessage ?? "SYNC_FAILED",
        conflict,
        payload: debug?.originalPayload ?? command.payload,
        mappedPayload: debug?.mappedPayload,
      })
      lastError = errorMessage ?? "SYNC_FAILED"
      failed += 1
    } catch (error) {
      if (isTemporarySyncError(error)) {
        break
      }

      const message = error instanceof Error ? error.message : "SYNC_FAILED"
      const retryCount = command.retryCount + 1
      const exhausted = retryCount >= command.maxRetries

      await updateSyncCommandStatus(command.id, exhausted ? "failed" : "pending", {
        error: message,
        retryCount,
      })
      await markLocalRecordFailure(command, message, false)
      await logSyncError({
        organizationId,
        entityType: command.entityType,
        localId: command.localId,
        commandId: command.id,
        scope: command.scope,
        message,
        backendReason: null,
        conflict: false,
        payload: command.payload,
        mappedPayload: null,
      })
      lastError = message
      failed += 1
    }
  }

  emitOfflineEvent(OFFLINE_EVENTS.syncChanged)
  return { processed, synced, failed, lastError }
}
