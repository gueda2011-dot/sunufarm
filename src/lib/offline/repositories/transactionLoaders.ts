"use client"

/**
 * SunuFarm — Loaders lecture IndexedDB pour les pages de listing
 *
 * Ces fonctions extraient les données bootstrappées (syncStatus = "synced")
 * depuis les repositories mutation (purchases, sales, stock, eggs) et les
 * repositories référence (stockItems) pour alimenter les localLoader des
 * hooks useOfflineData quand l'appareil est hors ligne.
 *
 * Convention de préfixe (bootstrap.ts) :
 *   stockMovementRepository : "feed:<id>" pour feedMovements, "medicine:<id>" pour medicineMovements
 *   stockItemsRepository    : "feed:<id>" pour feedStocks,    "medicine:<id>" pour medicineStocks
 */

import type { PurchaseSummary } from "@/src/actions/purchases"
import type { SaleSummary } from "@/src/actions/sales"
import type { EggRecordSummary } from "@/src/actions/eggs"
import type { ExpenseSummary } from "@/src/actions/expenses"
import type { TreatmentSummary, VaccinationSummary } from "@/src/actions/health"
import type {
  FeedMovementSummary,
  FeedStockSummary,
  MedicineMovementSummary,
  MedicineStockSummary,
} from "@/src/actions/stock"
import {
  eggProductionRepository,
  expensesRepository,
  healthRepository,
  purchasesRepository,
  salesRepository,
  stockItemsRepository,
  stockMovementRepository,
} from "@/src/lib/offline/repositories"

// ── Type guards ──────────────────────────────────────────────────────────────

function isPurchaseSummary(d: unknown): d is PurchaseSummary {
  return (
    typeof d === "object" &&
    d !== null &&
    "totalFcfa" in d &&
    "purchaseDate" in d &&
    "items" in d
  )
}

function isSaleSummary(d: unknown): d is SaleSummary {
  return (
    typeof d === "object" &&
    d !== null &&
    "totalFcfa" in d &&
    "saleDate" in d &&
    "productType" in d
  )
}

function isEggRecordSummary(d: unknown): d is EggRecordSummary {
  return (
    typeof d === "object" &&
    d !== null &&
    "totalEggs" in d &&
    "sellableEggs" in d &&
    "batchId" in d
  )
}

function isExpenseSummary(d: unknown): d is ExpenseSummary {
  return (
    typeof d === "object" &&
    d !== null &&
    "amountFcfa" in d &&
    "date" in d &&
    "description" in d
  )
}

function isVaccinationSummary(d: unknown): d is VaccinationSummary {
  return (
    typeof d === "object" &&
    d !== null &&
    "batchId" in d &&
    "date" in d &&
    "vaccineName" in d &&
    "countVaccinated" in d
  )
}

function isTreatmentSummary(d: unknown): d is TreatmentSummary {
  return (
    typeof d === "object" &&
    d !== null &&
    "batchId" in d &&
    "startDate" in d &&
    "medicineName" in d
  )
}

function isFeedMovementSummary(d: unknown): d is FeedMovementSummary {
  return (
    typeof d === "object" &&
    d !== null &&
    "feedStockId" in d &&
    "quantityKg" in d &&
    "type" in d
  )
}

function isMedicineMovementSummary(d: unknown): d is MedicineMovementSummary {
  return (
    typeof d === "object" &&
    d !== null &&
    "medicineStockId" in d &&
    "quantity" in d &&
    "type" in d
  )
}

function isFeedStockSummary(d: unknown): d is FeedStockSummary {
  return (
    typeof d === "object" &&
    d !== null &&
    "quantityKg" in d &&
    "feedTypeId" in d &&
    "farmId" in d
  )
}

function isMedicineStockSummary(d: unknown): d is MedicineStockSummary {
  return (
    typeof d === "object" &&
    d !== null &&
    "quantityOnHand" in d &&
    "farmId" in d &&
    "unit" in d
  )
}

// ── Loaders ──────────────────────────────────────────────────────────────────

export async function loadPurchasesFromLocal(
  organizationId: string,
): Promise<PurchaseSummary[] | undefined> {
  const rows = await purchasesRepository.getAll(organizationId)
  const results = rows
    .filter((r) => r.syncStatus === "synced")
    .map((r) => r.data)
    .filter(isPurchaseSummary)
  return results.length > 0 ? results : undefined
}

export async function loadSalesFromLocal(
  organizationId: string,
): Promise<SaleSummary[] | undefined> {
  const rows = await salesRepository.getAll(organizationId)
  const results = rows
    .filter((r) => r.syncStatus === "synced")
    .map((r) => r.data)
    .filter(isSaleSummary)
  return results.length > 0 ? results : undefined
}

export async function loadEggRecordsFromLocal(
  organizationId: string,
): Promise<EggRecordSummary[] | undefined> {
  const rows = await eggProductionRepository.getAll(organizationId)
  const results = rows
    .filter((r) => r.syncStatus === "synced")
    .map((r) => r.data)
    .filter(isEggRecordSummary)
  return results.length > 0 ? results : undefined
}

export async function loadExpensesFromLocal(
  organizationId: string,
): Promise<ExpenseSummary[] | undefined> {
  const rows = await expensesRepository.getAll(organizationId)
  const results = rows
    .filter((r) => r.syncStatus === "synced")
    .map((r) => r.data)
    .filter(isExpenseSummary)
  return results.length > 0 ? results : undefined
}

export async function loadVaccinationsFromLocal(
  organizationId: string,
): Promise<VaccinationSummary[] | undefined> {
  const rows = await healthRepository.getAll(organizationId)
  const results = rows
    .filter((r) => r.syncStatus === "synced" && r.entityType === "vaccination")
    .map((r) => r.data)
    .filter(isVaccinationSummary)
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
  return results.length > 0 ? results : undefined
}

export async function loadTreatmentsFromLocal(
  organizationId: string,
): Promise<TreatmentSummary[] | undefined> {
  const rows = await healthRepository.getAll(organizationId)
  const results = rows
    .filter((r) => r.syncStatus === "synced" && r.entityType === "treatment")
    .map((r) => r.data)
    .filter(isTreatmentSummary)
    .sort((left, right) => new Date(right.startDate).getTime() - new Date(left.startDate).getTime())
  return results.length > 0 ? results : undefined
}

export async function loadFeedMovementsFromLocal(
  organizationId: string,
): Promise<FeedMovementSummary[] | undefined> {
  const rows = await stockMovementRepository.getAll(organizationId)
  const results = rows
    .filter((r) => r.localId.startsWith("feed:") && r.syncStatus === "synced")
    .map((r) => r.data)
    .filter(isFeedMovementSummary)
  return results.length > 0 ? results : undefined
}

export async function loadMedicineMovementsFromLocal(
  organizationId: string,
): Promise<MedicineMovementSummary[] | undefined> {
  const rows = await stockMovementRepository.getAll(organizationId)
  const results = rows
    .filter((r) => r.localId.startsWith("medicine:") && r.syncStatus === "synced")
    .map((r) => r.data)
    .filter(isMedicineMovementSummary)
  return results.length > 0 ? results : undefined
}

export async function loadFeedStocksFromLocal(
  organizationId: string,
): Promise<FeedStockSummary[] | undefined> {
  const rows = await stockItemsRepository.getAll(organizationId)
  const results = rows
    .filter((r) => r.id.startsWith("feed:"))
    .map((r) => r.data)
    .filter(isFeedStockSummary)
  return results.length > 0 ? results : undefined
}

export async function loadMedicineStocksFromLocal(
  organizationId: string,
): Promise<MedicineStockSummary[] | undefined> {
  const rows = await stockItemsRepository.getAll(organizationId)
  const results = rows
    .filter((r) => r.id.startsWith("medicine:"))
    .map((r) => r.data)
    .filter(isMedicineStockSummary)
  return results.length > 0 ? results : undefined
}
