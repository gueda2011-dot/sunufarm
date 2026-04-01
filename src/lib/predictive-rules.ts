/**
 * SunuFarm — Règles prédictives rupture de stock
 *
 * Fonctions pures. Entrée : features calculées par predictive-features.ts.
 * Sortie : prédiction structurée prête à l'affichage et au stockage.
 */

import { KPI_THRESHOLDS } from "@/src/constants/kpi-thresholds"
import type { AlertLevel } from "@/src/lib/kpi"
import type { FeedStockFeatures, MedicineStockFeatures } from "@/src/lib/predictive-features"

// ---------------------------------------------------------------------------
// Types de sortie
// ---------------------------------------------------------------------------

export interface StockRupturePrediction {
  /** ID de référence (feedStockId ou medicineStockId) */
  stockId: string
  /** Jours avant rupture estimée. null = consommation inconnue (pas de prédiction). */
  daysToStockout: number | null
  /**
   * Date calendaire estimée de rupture (snapshotDate + daysToStockout arrondis).
   * null si daysToStockout est null.
   * Facilite le tri, le reporting et l'affichage "rupture le 15 avril".
   */
  estimatedRuptureDate: Date | null
  /** Consommation journalière moyenne utilisée pour la prédiction */
  avgDailyConsumption: number
  /** Unité de la consommation (kg pour aliment, unité propre pour médicament) */
  unit: string
  /** Niveau d'alerte calculé selon les seuils KPI */
  alertLevel: AlertLevel
  /** Label lisible pour l'affichage UI */
  label: string
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

function alertLevelFromDays(
  daysToStockout: number | null,
  criticalDays: number,
  warningDays: number,
): AlertLevel {
  if (daysToStockout === null) return "ok"
  if (daysToStockout <= criticalDays) return "critical"
  if (daysToStockout <= warningDays) return "warning"
  return "ok"
}

/**
 * Calcule la date calendaire de rupture à partir d'aujourd'hui + daysToStockout.
 * On tronque à minuit UTC pour que la date soit comparable entre snapshots.
 */
function estimatedRuptureDateFromDays(daysToStockout: number | null, from = new Date()): Date | null {
  if (daysToStockout === null) return null
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  d.setUTCDate(d.getUTCDate() + Math.ceil(daysToStockout))
  return d
}

function labelFromDays(daysToStockout: number | null): string {
  if (daysToStockout === null) return "Pas de donnees"
  if (daysToStockout <= 0) return "Rupture"
  if (daysToStockout < 1) return "Rupture imminente (< 1 j)"
  const days = Math.round(daysToStockout)
  if (days === 1) return "Rupture dans 1 jour"
  return `Rupture dans ${days} jours`
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Produit une prédiction de rupture à partir des features d'un stock aliment.
 */
export function predictFeedStockRupture(
  features: FeedStockFeatures,
): StockRupturePrediction {
  const alertLevel = alertLevelFromDays(
    features.daysToStockout,
    KPI_THRESHOLDS.FEED_STOCK_CRITICAL_DAYS,
    KPI_THRESHOLDS.FEED_STOCK_WARNING_DAYS,
  )
  const label = labelFromDays(features.daysToStockout)

  const roundedDays = features.daysToStockout !== null ? Math.round(features.daysToStockout * 10) / 10 : null
  return {
    stockId: features.feedStockId,
    daysToStockout: roundedDays,
    estimatedRuptureDate: estimatedRuptureDateFromDays(roundedDays),
    avgDailyConsumption: Math.round(features.avgDailyConsumptionKg * 10) / 10,
    unit: "kg",
    alertLevel,
    label,
  }
}

/**
 * Produit une prédiction de rupture à partir des features d'un stock médicament.
 */
export function predictMedicineStockRupture(
  features: MedicineStockFeatures,
): StockRupturePrediction {
  const alertLevel = alertLevelFromDays(
    features.daysToStockout,
    KPI_THRESHOLDS.MEDICINE_STOCK_CRITICAL_DAYS,
    KPI_THRESHOLDS.MEDICINE_STOCK_WARNING_DAYS,
  )
  const label = labelFromDays(features.daysToStockout)

  const roundedDays = features.daysToStockout !== null ? Math.round(features.daysToStockout * 10) / 10 : null
  return {
    stockId: features.medicineStockId,
    daysToStockout: roundedDays,
    estimatedRuptureDate: estimatedRuptureDateFromDays(roundedDays),
    avgDailyConsumption: Math.round(features.avgDailyConsumption * 10) / 10,
    unit: features.unit,
    alertLevel,
    label,
  }
}
