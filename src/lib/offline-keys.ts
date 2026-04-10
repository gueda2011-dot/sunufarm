export const OFFLINE_DB_NAME = "sunufarm-offline"
export const OFFLINE_DB_VERSION = 2

export const OFFLINE_QUEUE_STORE = "mutation-outbox"
export const OFFLINE_RESOURCE_STORE = "resource-cache"
export const OFFLINE_OPTIMISTIC_STORE = "optimistic-items"

export const OFFLINE_CACHE_EVENT = "sunufarm:offline-cache-changed"
export const OFFLINE_SESSION_STORAGE_KEY = "sunufarm:offline-session-context"

export const OFFLINE_RESOURCE_KEYS = {
  dailyBatches: "daily:batches",
  dailyFeedStocks: "daily:feed-stocks",
  dailyRecords: (batchId: string) => `daily:records:${batchId}`,
  healthBatches: "health:batches",
  healthMedicineStocks: "health:medicine-stocks",
  healthVaccinations: "health:vaccinations",
  healthTreatments: "health:treatments",
  healthVaccinationPlans: "health:vaccination-plans",
  healthBatchAlerts: "health:batch-alerts",
  stockFeedStocks: "stock:feed-stocks",
  stockMedicineStocks: "stock:medicine-stocks",
  stockFarms: "stock:farms",
  stockBatches: "stock:batches",
  stockFeedMovements: "stock:feed-movements",
  stockMedicineMovements: "stock:medicine-movements",
  saleCustomers: "sales:new:customers",
  saleBatches: "sales:new:batches",
  eggsBatches: "eggs:batches",
  eggsRecords: "eggs:records",
  eggsMetrics: "eggs:metrics",
  purchasesList: "purchases:list",
  purchasesSuppliers: "purchases:suppliers",
  purchasesFeedStocks: "purchases:feed-stocks",
  purchasesMedicineStocks: "purchases:medicine-stocks",
} as const
