/**
 * SunuFarm — Extraction de features prédictives stock
 *
 * Fonctions pures, sans effet de bord, sans dépendance Prisma.
 * Entrées : données brutes mouvements + stock actuel.
 * Sorties : features numériques consommables par les règles prédictives.
 */

// ---------------------------------------------------------------------------
// Types d'entrée
// ---------------------------------------------------------------------------

/** Un mouvement de sortie aliment (SORTIE uniquement) */
export interface FeedSortieMovement {
  feedStockId: string
  quantityKg: number
  date: Date
}

/** Un mouvement de sortie médicament (SORTIE uniquement) */
export interface MedicineSortieMovement {
  medicineStockId: string
  quantity: number
  date: Date
}

// ---------------------------------------------------------------------------
// Types de sortie
// ---------------------------------------------------------------------------

export interface FeedStockFeatures {
  feedStockId: string
  currentQuantityKg: number
  avgDailyConsumptionKg: number
  /** Taille de la fenêtre d'observation en jours (dénominateur fixe du calcul de moyenne) */
  windowDays: number
  /** Jours avant rupture estimée. null = aucune consommation connue → pas de prédiction. */
  daysToStockout: number | null
}

export interface MedicineStockFeatures {
  medicineStockId: string
  currentQuantityOnHand: number
  unit: string
  avgDailyConsumption: number
  windowDays: number
  /** Jours avant rupture estimée. null = aucune consommation connue. */
  daysToStockout: number | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calcule la consommation moyenne journalière sur une fenêtre glissante.
 * @param totalConsumed Quantité totale consommée sur la fenêtre
 * @param windowDays Nombre de jours de la fenêtre d'observation
 * @returns Consommation par jour, ou 0 si aucune donnée
 */
function avgDailyFromWindow(totalConsumed: number, windowDays: number): number {
  if (windowDays <= 0 || totalConsumed <= 0) return 0
  return totalConsumed / windowDays
}

/**
 * Calcule les jours avant rupture.
 * @returns null si pas de consommation connue (stock dure indéfiniment sur les données disponibles)
 */
function computeDaysToStockout(
  currentQty: number,
  avgDailyConsumption: number,
): number | null {
  if (avgDailyConsumption <= 0) return null
  if (currentQty <= 0) return 0
  return currentQty / avgDailyConsumption
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Calcule les features prédictives d'un stock aliment à partir de ses sorties récentes.
 *
 * @param feedStockId ID du stock aliment
 * @param currentQuantityKg Quantité actuelle en stock (kg)
 * @param sortieMovements Mouvements SORTIE des N derniers jours pour ce stock
 * @param windowDays Taille de la fenêtre d'observation (défaut : 14 jours)
 */
export function computeFeedStockFeatures(
  feedStockId: string,
  currentQuantityKg: number,
  sortieMovements: FeedSortieMovement[],
  windowDays = 14,
): FeedStockFeatures {
  const relevant = sortieMovements.filter((m) => m.feedStockId === feedStockId)
  const totalConsumed = relevant.reduce((sum, m) => sum + m.quantityKg, 0)
  const avgDailyConsumptionKg = avgDailyFromWindow(totalConsumed, windowDays)
  const daysToStockout = computeDaysToStockout(currentQuantityKg, avgDailyConsumptionKg)

  return {
    feedStockId,
    currentQuantityKg,
    avgDailyConsumptionKg,
    windowDays,
    daysToStockout,
  }
}

/**
 * Calcule les features prédictives d'un stock médicament à partir de ses sorties récentes.
 *
 * @param medicineStockId ID du stock médicament
 * @param currentQuantityOnHand Quantité actuelle en stock
 * @param unit Unité du stock (ex: "flacon", "kg", "dose")
 * @param sortieMovements Mouvements SORTIE des N derniers jours pour ce stock
 * @param windowDays Taille de la fenêtre d'observation (défaut : 14 jours)
 */
export function computeMedicineStockFeatures(
  medicineStockId: string,
  currentQuantityOnHand: number,
  unit: string,
  sortieMovements: MedicineSortieMovement[],
  windowDays = 14,
): MedicineStockFeatures {
  const relevant = sortieMovements.filter((m) => m.medicineStockId === medicineStockId)
  const totalConsumed = relevant.reduce((sum, m) => sum + m.quantity, 0)
  const avgDailyConsumption = avgDailyFromWindow(totalConsumed, windowDays)
  const daysToStockout = computeDaysToStockout(currentQuantityOnHand, avgDailyConsumption)

  return {
    medicineStockId,
    currentQuantityOnHand,
    unit,
    avgDailyConsumption,
    windowDays,
    daysToStockout,
  }
}
