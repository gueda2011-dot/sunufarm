"use client"

import { getBatches } from "@/src/actions/batches"
import { getCustomers } from "@/src/actions/customers"
import { getEggRecords } from "@/src/actions/eggs"
import { getFarms } from "@/src/actions/farms"
import { getVaccinationPlans } from "@/src/actions/health"
import { getPurchases, getSuppliers } from "@/src/actions/purchases"
import { getSales } from "@/src/actions/sales"
import { getFeedMovements, getFeedStocks, getMedicineMovements, getMedicineStocks } from "@/src/actions/stock"
import { requestToPromise, withStore } from "@/src/lib/offline/db"
import { emitOfflineEvent, OFFLINE_EVENTS } from "@/src/lib/offline/events"
import {
  batchesRepository,
  customersRepository,
  eggProductionRepository,
  farmsRepository,
  purchasesRepository,
  salesRepository,
  stockItemsRepository,
  stockMovementRepository,
  suppliersRepository,
  vaccinationPlansRepository,
} from "@/src/lib/offline/repositories"
import { OFFLINE_BOOTSTRAP_VERSION, OFFLINE_STORE_NAMES } from "@/src/lib/offline/schema"
import { markOfflineDevicePrepared } from "@/src/lib/offline-session"
import type { OfflineBootstrapMeta } from "@/src/lib/offline/types"

const BOOTSTRAP_META_ID = "bootstrap"

async function writeBootstrapMeta(meta: OfflineBootstrapMeta) {
  await withStore<void>(OFFLINE_STORE_NAMES.appMeta, "readwrite", async (store) => {
    await requestToPromise(store.put(meta))
  })
  emitOfflineEvent(OFFLINE_EVENTS.bootstrapChanged)
}

export async function getOfflineBootstrapMeta(organizationId: string) {
  const meta = await withStore<OfflineBootstrapMeta | undefined>(
    OFFLINE_STORE_NAMES.appMeta,
    "readonly",
    async (store) => requestToPromise(store.get(BOOTSTRAP_META_ID)),
  )

  if (!meta || meta.organizationId !== organizationId) {
    return null
  }

  return meta
}

export async function prepareOfflineWorkspace(organizationId: string) {
  const startedAt = new Date().toISOString()

  await writeBootstrapMeta({
    id: BOOTSTRAP_META_ID,
    organizationId,
    status: "started",
    startedAt,
    completedAt: null,
    lastBootstrapAt: null,
    bootstrapVersion: OFFLINE_BOOTSTRAP_VERSION,
    modulesReady: [],
    counts: {},
    error: null,
    updatedAt: startedAt,
  })

  try {
    const [
      farms,
      batches,
      customers,
      suppliers,
      feedStocks,
      medicineStocks,
      feedMovements,
      medicineMovements,
      vaccinationPlans,
      eggRecords,
      sales,
      purchases,
    ] = await Promise.all([
      getFarms({ organizationId }),
      getBatches({ organizationId, status: "ACTIVE", limit: 100 }),
      getCustomers({ organizationId, limit: 100 }),
      getSuppliers({ organizationId }),
      getFeedStocks({ organizationId, limit: 100 }),
      getMedicineStocks({ organizationId, limit: 100 }),
      getFeedMovements({ organizationId, limit: 100 }),
      getMedicineMovements({ organizationId, limit: 100 }),
      getVaccinationPlans({ organizationId, limit: 100 }),
      getEggRecords({ organizationId, limit: 100 }),
      getSales({ organizationId, limit: 100 }),
      getPurchases({ organizationId, limit: 100 }),
    ])

    if (!farms.success) throw new Error(farms.error)
    if (!batches.success) throw new Error(batches.error)
    if (!customers.success) throw new Error(customers.error)
    if (!suppliers.success) throw new Error(suppliers.error)
    if (!feedStocks.success) throw new Error(feedStocks.error)
    if (!medicineStocks.success) throw new Error(medicineStocks.error)
    if (!feedMovements.success) throw new Error(feedMovements.error)
    if (!medicineMovements.success) throw new Error(medicineMovements.error)
    if (!vaccinationPlans.success) throw new Error(vaccinationPlans.error)
    if (!eggRecords.success) throw new Error(eggRecords.error)
    if (!sales.success) throw new Error(sales.error)
    if (!purchases.success) throw new Error(purchases.error)

    await farmsRepository.upsertMany(
      organizationId,
      farms.data.map((farm) => ({ id: farm.id, serverId: farm.id, data: farm as unknown })),
    )
    await batchesRepository.upsertMany(
      organizationId,
      batches.data.map((batch) => ({ id: batch.id, serverId: batch.id, data: batch as unknown })),
    )
    await customersRepository.upsertMany(
      organizationId,
      customers.data.map((customer) => ({ id: customer.id, serverId: customer.id, data: customer as unknown })),
    )
    await suppliersRepository.upsertMany(
      organizationId,
      suppliers.data.map((supplier) => ({ id: supplier.id, serverId: supplier.id, data: supplier as unknown })),
    )
    await stockItemsRepository.upsertMany(
      organizationId,
      [
        ...feedStocks.data.map((item) => ({ id: `feed:${item.id}`, serverId: item.id, data: item as unknown })),
        ...medicineStocks.data.map((item) => ({ id: `medicine:${item.id}`, serverId: item.id, data: item as unknown })),
      ],
    )
    await stockMovementRepository.upsertMany([
      ...feedMovements.data.map((item) => ({
        localId: `feed:${item.id}`,
        serverId: item.id,
        organizationId,
        entityType: "feed_movement",
        scope: "stock" as const,
        syncStatus: "synced" as const,
        createdAt: item.createdAt.toString(),
        updatedAt: item.createdAt.toString(),
        lastSyncAttemptAt: item.createdAt.toString(),
        syncError: null,
        data: item as unknown,
      })),
      ...medicineMovements.data.map((item) => ({
        localId: `medicine:${item.id}`,
        serverId: item.id,
        organizationId,
        entityType: "medicine_movement",
        scope: "stock" as const,
        syncStatus: "synced" as const,
        createdAt: item.createdAt.toString(),
        updatedAt: item.createdAt.toString(),
        lastSyncAttemptAt: item.createdAt.toString(),
        syncError: null,
        data: item as unknown,
      })),
    ])
    await vaccinationPlansRepository.upsertMany(
      organizationId,
      vaccinationPlans.data.map((plan) => ({ id: plan.id, serverId: plan.id, data: plan as unknown })),
    )
    await eggProductionRepository.upsertMany(
      eggRecords.data.map((item) => ({
        localId: item.id,
        serverId: item.id,
        organizationId,
        entityType: "egg_production",
        scope: "eggs",
        syncStatus: "synced" as const,
        createdAt: item.createdAt.toString(),
        updatedAt: item.createdAt.toString(),
        lastSyncAttemptAt: item.createdAt.toString(),
        syncError: null,
        data: item as unknown,
      })),
    )
    await salesRepository.upsertMany(
      sales.data.map((item) => ({
        localId: item.id,
        serverId: item.id,
        organizationId,
        entityType: "sale",
        scope: "sales",
        syncStatus: "synced" as const,
        createdAt: item.createdAt.toString(),
        updatedAt: item.createdAt.toString(),
        lastSyncAttemptAt: item.createdAt.toString(),
        syncError: null,
        data: item as unknown,
      })),
    )
    await purchasesRepository.upsertMany(
      purchases.data.map((item) => ({
        localId: item.id,
        serverId: item.id,
        organizationId,
        entityType: "purchase",
        scope: "purchases",
        syncStatus: "synced" as const,
        createdAt: item.createdAt.toString(),
        updatedAt: item.createdAt.toString(),
        lastSyncAttemptAt: item.createdAt.toString(),
        syncError: null,
        data: item as unknown,
      })),
    )

    const completedAt = new Date().toISOString()
    const modulesReady = ["daily", "health", "stock", "sales", "eggs", "purchases"]
    await writeBootstrapMeta({
      id: BOOTSTRAP_META_ID,
      organizationId,
      status: "completed",
      startedAt,
      completedAt,
      lastBootstrapAt: completedAt,
      bootstrapVersion: OFFLINE_BOOTSTRAP_VERSION,
      modulesReady,
      counts: {
        farms: farms.data.length,
        batches: batches.data.length,
        customers: customers.data.length,
        suppliers: suppliers.data.length,
        stockItems: feedStocks.data.length + medicineStocks.data.length,
        stockMovements: feedMovements.data.length + medicineMovements.data.length,
        vaccinationPlans: vaccinationPlans.data.length,
        eggProductions: eggRecords.data.length,
        sales: sales.data.length,
        purchases: purchases.data.length,
      },
      error: null,
      updatedAt: completedAt,
    })
    await markOfflineDevicePrepared(true)

    return { success: true as const, modulesReady }
  } catch (error) {
    const updatedAt = new Date().toISOString()
    const message = error instanceof Error ? error.message : "OFFLINE_BOOTSTRAP_FAILED"
    await writeBootstrapMeta({
      id: BOOTSTRAP_META_ID,
      organizationId,
      status: "failed",
      startedAt,
      completedAt: null,
      lastBootstrapAt: null,
      bootstrapVersion: OFFLINE_BOOTSTRAP_VERSION,
      modulesReady: [],
      counts: {},
      error: message,
      updatedAt,
    })

    return { success: false as const, error: message }
  }
}
