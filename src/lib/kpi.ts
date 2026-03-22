/**
 * SunuFarm — Formules KPI avicoles
 *
 * Fonctions pures, sans effet de bord, sans dépendance Prisma.
 * Toutes les divisions sont protégées contre le zéro.
 * Les taux retournés sont des pourcentages (0–100), pas des ratios (0–1).
 * Les entrées physiquement non négatives sont clampées à 0.
 */

import { KPI_THRESHOLDS } from "@/src/constants/kpi-thresholds"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlertLevel = "ok" | "warning" | "critical"

/**
 * Résultat d'un calcul de marge.
 *
 * Convention MVP (unique, documentée) :
 *   rate = (marge / coûts) × 100
 *
 * Ce taux mesure la rentabilité sur investissement :
 * combien de FCFA gagnés pour 100 FCFA investis.
 * Ex : rate = 25 signifie 25 FCFA de bénéfice pour 100 FCFA de charges.
 * Un rate négatif signifie une perte.
 * rate est null si les coûts sont à 0 (division impossible).
 */
export interface MarginResult {
  /** Marge en FCFA — peut être négative (perte) */
  amount: number
  /** (marge / coûts) × 100 — null si coûts = 0 */
  rate: number | null
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

/** Division protégée : retourne null si diviseur = 0 */
function safeDivide(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null
  return numerator / denominator
}

/** Arrondit à n décimales */
function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/**
 * Clamp à 0 pour les grandeurs physiquement non négatives.
 * Évite les KPI incohérents issus d'une saisie invalide côté UI.
 */
function clamp0(value: number): number {
  return Math.max(0, value)
}

// ---------------------------------------------------------------------------
// Effectif et mortalité
// ---------------------------------------------------------------------------

/**
 * Taux de mortalité cumulé depuis le début du lot.
 * @returns Pourcentage (ex: 2.5 pour 2.5%) ou null si effectif initial = 0
 */
export function mortalityRate(
  dead: number,
  initial: number,
): number | null {
  const rate = safeDivide(clamp0(dead), clamp0(initial))
  if (rate === null) return null
  return round(rate * 100)
}

/**
 * Taux de mortalité journalier.
 * @returns Pourcentage ou null si effectif vivant en début de journée = 0
 */
export function dailyMortalityRate(
  deadToday: number,
  livingAtStartOfDay: number,
): number | null {
  const rate = safeDivide(clamp0(deadToday), clamp0(livingAtStartOfDay))
  if (rate === null) return null
  return round(rate * 100)
}

/**
 * Taux de survie cumulé.
 * @returns Pourcentage ou null si effectif initial = 0
 */
export function survivalRate(
  dead: number,
  initial: number,
): number | null {
  const mortality = mortalityRate(dead, initial)
  if (mortality === null) return null
  return round(100 - mortality)
}

/**
 * Effectif vivant actuel.
 * @param culled Sujets réformés (hors vente normale) — défaut 0
 */
export function livingCount(
  initial: number,
  dead: number,
  culled = 0,
): number {
  return Math.max(0, clamp0(initial) - clamp0(dead) - clamp0(culled))
}

// ---------------------------------------------------------------------------
// Alimentation
// ---------------------------------------------------------------------------

/**
 * Consommation journalière d'aliment par sujet vivant.
 * @returns Grammes par sujet par jour, ou null si effectif = 0
 */
export function dailyFeedPerBird(
  feedKg: number,
  livingBirds: number,
): number | null {
  const grams = clamp0(feedKg) * 1000
  const result = safeDivide(grams, clamp0(livingBirds))
  if (result === null) return null
  return round(result, 1)
}

/**
 * Consommation cumulée d'aliment sur l'ensemble d'un lot.
 * @param dailyRecords Tableau de { feedKg } — un enregistrement par jour
 * @returns Total en kg
 */
export function cumulativeFeedConsumption(
  dailyRecords: ReadonlyArray<{ feedKg: number }>,
): number {
  return round(
    dailyRecords.reduce((sum, r) => sum + clamp0(r.feedKg), 0),
    2,
  )
}

/**
 * Indice de Consommation (IC / FCR).
 * kg d'aliment consommé / kg de poids gagné.
 * Un IC bas est meilleur (Cobb 500 visé : ~1.7–1.8 à 35 jours).
 * @returns IC ou null si gain de poids = 0
 */
export function feedConversionRatio(
  totalFeedKg: number,
  totalWeightGainKg: number,
): number | null {
  const result = safeDivide(clamp0(totalFeedKg), clamp0(totalWeightGainKg))
  if (result === null) return null
  return round(result)
}

// ---------------------------------------------------------------------------
// Croissance (lots chair)
// ---------------------------------------------------------------------------

/**
 * Gain Moyen Quotidien (GMQ / ADG).
 * @param currentWeightG Poids moyen actuel en grammes
 * @param entryWeightG   Poids moyen à l'entrée en grammes
 * @param ageDays        Jours écoulés depuis l'entrée (doit être > 0)
 * @returns GMQ en g/jour ou null si ageDays = 0
 */
export function averageDailyGain(
  currentWeightG: number,
  entryWeightG: number,
  ageDays: number,
): number | null {
  const gain = clamp0(currentWeightG) - clamp0(entryWeightG)
  const result = safeDivide(gain, clamp0(ageDays))
  if (result === null) return null
  return round(result, 1)
}

// ---------------------------------------------------------------------------
// Production d'œufs (lots pondeuses)
// ---------------------------------------------------------------------------

/**
 * Taux de ponte journalier.
 * @param eggsProduced Nombre total d'œufs ramassés dans la journée
 * @param livingHens   Nombre de poules vivantes en début de journée
 * @returns Pourcentage ou null si effectif = 0
 */
export function layingRate(
  eggsProduced: number,
  livingHens: number,
): number | null {
  const rate = safeDivide(clamp0(eggsProduced), clamp0(livingHens))
  if (rate === null) return null
  return round(rate * 100)
}

/**
 * Taux d'œufs cassés sur le total produit.
 * @returns Pourcentage ou null si total = 0
 */
export function brokenEggRate(
  broken: number,
  total: number,
): number | null {
  const rate = safeDivide(clamp0(broken), clamp0(total))
  if (rate === null) return null
  return round(rate * 100)
}

// ---------------------------------------------------------------------------
// Finances
// ---------------------------------------------------------------------------

/**
 * Marge brute d'un lot.
 * Marge brute = recettes - charges directes (poussins + aliment + médicaments)
 *
 * rate = (marge brute / charges directes) × 100
 * Ex : rate = 30 → 30 FCFA gagnés pour 100 FCFA de charges directes.
 */
export function grossMargin(revenue: number, directCosts: number): MarginResult {
  const amount = revenue - directCosts
  const rate   = directCosts === 0 ? null : round((amount / directCosts) * 100)
  return { amount, rate }
}

/**
 * Marge nette d'un lot.
 * Marge nette = recettes - toutes les charges (directes + indirectes)
 *
 * rate = (marge nette / charges totales) × 100
 * Ex : rate = 15 → 15 FCFA gagnés pour 100 FCFA de charges totales.
 * Un rate négatif indique une perte sur le lot.
 */
export function netMargin(revenue: number, totalCosts: number): MarginResult {
  const amount = revenue - totalCosts
  const rate   = totalCosts === 0 ? null : round((amount / totalCosts) * 100)
  return { amount, rate }
}

// ---------------------------------------------------------------------------
// Alertes (seuils définis dans constants/kpi-thresholds.ts)
// ---------------------------------------------------------------------------

/**
 * Niveau d'alerte pour la mortalité journalière.
 * @param dailyRatePct Taux de mortalité du jour en % (ex : 0.5 pour 0.5%)
 */
export function getMortalityAlert(dailyRatePct: number): AlertLevel {
  if (dailyRatePct >= KPI_THRESHOLDS.MORTALITY_DAILY_CRITICAL_RATE * 100) return "critical"
  if (dailyRatePct >= KPI_THRESHOLDS.MORTALITY_DAILY_WARNING_RATE  * 100) return "warning"
  return "ok"
}

/**
 * Niveau d'alerte pour le taux de ponte.
 * @param ratePct Taux de ponte en % (ex : 68 pour 68%)
 */
export function getLayingRateAlert(ratePct: number): AlertLevel {
  if (ratePct < KPI_THRESHOLDS.LAYING_RATE_CRITICAL_RATE * 100) return "critical"
  if (ratePct < KPI_THRESHOLDS.LAYING_RATE_WARNING_RATE  * 100) return "warning"
  return "ok"
}

/**
 * Niveau d'alerte pour un stock (aliment ou médicament).
 * @param remainingDays Jours de stock restants estimés
 */
export function getStockAlert(remainingDays: number): AlertLevel {
  if (remainingDays <= KPI_THRESHOLDS.FEED_STOCK_CRITICAL_DAYS) return "critical"
  if (remainingDays <= KPI_THRESHOLDS.FEED_STOCK_WARNING_DAYS)  return "warning"
  return "ok"
}
