export const OFFLINE_STORE_NAMES = {
  appMeta: "app_meta",
  offlineSession: "offline_session",
  organizations: "organizations",
  users: "users",
  farms: "farms",
  batches: "batches",
  customers: "customers",
  suppliers: "suppliers",
  stockItems: "stock_items",
  stockMovements: "stock_movements",
  dailyEntries: "daily_entries",
  healthEvents: "health_events",
  vaccinationPlans: "vaccination_plans",
  eggProductions: "egg_productions",
  sales: "sales",
  purchases: "purchases",
  expenses: "expenses",
  syncQueue: "sync_queue",
  syncMappings: "sync_mappings",
  syncErrors: "sync_errors",
  legacyResourceCache: "resource_cache",
  legacyOptimistic: "optimistic_items",
} as const

export const OFFLINE_DB_NAME = "sunufarm-offline"
export const OFFLINE_DB_VERSION = 4
export const OFFLINE_BOOTSTRAP_VERSION = "2026.04.offline-first"

type StoreName = (typeof OFFLINE_STORE_NAMES)[keyof typeof OFFLINE_STORE_NAMES]

interface StoreDefinition {
  name: StoreName
  keyPath: string
  indexes: Array<{
    name: string
    keyPath: string | string[]
    options?: IDBIndexParameters
  }>
}

export const OFFLINE_STORE_DEFINITIONS: StoreDefinition[] = [
  {
    name: OFFLINE_STORE_NAMES.appMeta,
    keyPath: "id",
    indexes: [
      { name: "organizationId", keyPath: "organizationId" },
      { name: "status", keyPath: "status" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.offlineSession,
    keyPath: "id",
    indexes: [
      { name: "organizationId", keyPath: "organizationId" },
      { name: "expiresAt", keyPath: "expiresAt" },
      { name: "savedAt", keyPath: "savedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.organizations,
    keyPath: "id",
    indexes: [{ name: "organizationId", keyPath: "organizationId" }],
  },
  {
    name: OFFLINE_STORE_NAMES.users,
    keyPath: "id",
    indexes: [{ name: "organizationId", keyPath: "organizationId" }],
  },
  {
    name: OFFLINE_STORE_NAMES.farms,
    keyPath: "id",
    indexes: [
      { name: "organizationId", keyPath: "organizationId" },
      { name: "scope", keyPath: "scope" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.batches,
    keyPath: "id",
    indexes: [
      { name: "organizationId", keyPath: "organizationId" },
      { name: "scope", keyPath: "scope" },
      { name: "syncStatus", keyPath: "syncStatus" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.customers,
    keyPath: "id",
    indexes: [
      { name: "organizationId", keyPath: "organizationId" },
      { name: "scope", keyPath: "scope" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.suppliers,
    keyPath: "id",
    indexes: [
      { name: "organizationId", keyPath: "organizationId" },
      { name: "scope", keyPath: "scope" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.stockItems,
    keyPath: "id",
    indexes: [
      { name: "organizationId", keyPath: "organizationId" },
      { name: "scope", keyPath: "scope" },
      { name: "syncStatus", keyPath: "syncStatus" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.stockMovements,
    keyPath: "id",
    indexes: [
      { name: "organizationId", keyPath: "organizationId" },
      { name: "scope", keyPath: "scope" },
      { name: "syncStatus", keyPath: "syncStatus" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.dailyEntries,
    keyPath: "id",
    indexes: [
      { name: "organizationId", keyPath: "organizationId" },
      { name: "scope", keyPath: "scope" },
      { name: "syncStatus", keyPath: "syncStatus" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.healthEvents,
    keyPath: "id",
    indexes: [
      { name: "organizationId", keyPath: "organizationId" },
      { name: "scope", keyPath: "scope" },
      { name: "syncStatus", keyPath: "syncStatus" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.vaccinationPlans,
    keyPath: "id",
    indexes: [
      { name: "organizationId", keyPath: "organizationId" },
      { name: "scope", keyPath: "scope" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.eggProductions,
    keyPath: "id",
    indexes: [
      { name: "organizationId", keyPath: "organizationId" },
      { name: "scope", keyPath: "scope" },
      { name: "syncStatus", keyPath: "syncStatus" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.sales,
    keyPath: "id",
    indexes: [
      { name: "organizationId", keyPath: "organizationId" },
      { name: "scope", keyPath: "scope" },
      { name: "syncStatus", keyPath: "syncStatus" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.purchases,
    keyPath: "id",
    indexes: [
      { name: "organizationId", keyPath: "organizationId" },
      { name: "scope", keyPath: "scope" },
      { name: "syncStatus", keyPath: "syncStatus" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.expenses,
    keyPath: "localId",
    indexes: [
      { name: "organizationId", keyPath: "organizationId" },
      { name: "scope", keyPath: "scope" },
      { name: "syncStatus", keyPath: "syncStatus" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.syncQueue,
    keyPath: "id",
    indexes: [
      { name: "organizationId", keyPath: "organizationId" },
      { name: "scope", keyPath: "scope" },
      { name: "status", keyPath: "status" },
      { name: "createdAt", keyPath: "createdAt" },
      { name: "updatedAt", keyPath: "updatedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.syncMappings,
    keyPath: "id",
    indexes: [
      { name: "organizationId", keyPath: "organizationId" },
      { name: "entityLocal", keyPath: ["entityType", "localId"] },
      { name: "entityServer", keyPath: ["entityType", "serverId"] },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.syncErrors,
    keyPath: "id",
    indexes: [
      { name: "organizationId", keyPath: "organizationId" },
      { name: "scope", keyPath: "scope" },
      { name: "createdAt", keyPath: "createdAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.legacyResourceCache,
    keyPath: "id",
    indexes: [
      { name: "organizationId", keyPath: "organizationId" },
      { name: "key", keyPath: "key" },
      { name: "savedAt", keyPath: "savedAt" },
    ],
  },
  {
    name: OFFLINE_STORE_NAMES.legacyOptimistic,
    keyPath: "id",
    indexes: [
      { name: "organizationId", keyPath: "organizationId" },
      { name: "scope", keyPath: "scope" },
      { name: "status", keyPath: "status" },
      { name: "createdAt", keyPath: "createdAt" },
    ],
  },
]
