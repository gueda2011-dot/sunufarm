"use client"

import { OFFLINE_STORE_NAMES } from "@/src/lib/offline/schema"
import { OfflineReferenceRepository } from "@/src/lib/offline/repositories/referenceRepository"
import { OfflineRepository } from "@/src/lib/offline/repositories/baseRepository"

export const dailyRepository = new OfflineRepository(
  OFFLINE_STORE_NAMES.dailyEntries,
  "daily",
  "daily_entry",
)

export const healthRepository = new OfflineRepository(
  OFFLINE_STORE_NAMES.healthEvents,
  "health",
  "health_event",
)

export const stockMovementRepository = new OfflineRepository(
  OFFLINE_STORE_NAMES.stockMovements,
  "stock",
  "stock_movement",
)

export const eggProductionRepository = new OfflineRepository(
  OFFLINE_STORE_NAMES.eggProductions,
  "eggs",
  "egg_production",
)

export const salesRepository = new OfflineRepository(
  OFFLINE_STORE_NAMES.sales,
  "sales",
  "sale",
)

export const purchasesRepository = new OfflineRepository(
  OFFLINE_STORE_NAMES.purchases,
  "purchases",
  "purchase",
)

export const expensesRepository = new OfflineRepository(
  OFFLINE_STORE_NAMES.expenses,
  "expenses",
  "expense",
)

export const batchesRepository = new OfflineReferenceRepository(
  OFFLINE_STORE_NAMES.batches,
  "references",
  "batch",
)

export const farmsRepository = new OfflineReferenceRepository(
  OFFLINE_STORE_NAMES.farms,
  "references",
  "farm",
)

export const customersRepository = new OfflineReferenceRepository(
  OFFLINE_STORE_NAMES.customers,
  "references",
  "customer",
)

export const suppliersRepository = new OfflineReferenceRepository(
  OFFLINE_STORE_NAMES.suppliers,
  "references",
  "supplier",
)

export const stockItemsRepository = new OfflineReferenceRepository(
  OFFLINE_STORE_NAMES.stockItems,
  "references",
  "stock_item",
)

export const vaccinationPlansRepository = new OfflineReferenceRepository(
  OFFLINE_STORE_NAMES.vaccinationPlans,
  "references",
  "vaccination_plan",
)

export { adjustDailyFeedStockQuantityLocally } from "@/src/lib/offline/repositories/dailyRepository"
