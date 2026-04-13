/**
 * SunuFarm — Moteur de reconstruction de consommation alimentaire depuis un sac
 *
 * Problème résolu :
 *   Un éleveur déclare qu'un sac de N kg a été ouvert à startDate et terminé
 *   à endDate. Le système doit reconstruire la consommation journalière estimée
 *   pour chaque jour de la période, en utilisant la courbe zootechnique de
 *   référence comme pondération (pas une répartition plate).
 *
 * Algorithme CURVE_WEIGHTED :
 *   1. Charger la courbe ajustée pour [startAgeDay..endAgeDay]
 *   2. Calculer la proportion de chaque jour :
 *        proportion[j] = curve[j].dailyFeedGPerBird / sum(curve[start..end])
 *   3. Distribuer le poids réel du sac :
 *        estimatedFeedKg[j] = bagWeightKg × proportion[j]
 *
 * Algorithme LINEAR (fallback) :
 *   Utilisé si aucune courbe n'est disponible pour la souche.
 *   Répartition plate : bagWeightKg / duration jours.
 *   Toujours confidence = LOW.
 *
 * Règle de priorité :
 *   Un DailyRecord MANUAL_KG existant pour la même date n'est JAMAIS écrasé.
 *   Cette règle est appliquée dans les server actions (feed-bags.ts), pas ici.
 *
 * Ce module est une librairie pure (pas d'accès DB direct).
 * L'accès DB est délégué aux paramètres (curvePoints passés en entrée).
 */

import {
  computeConfidence,
  distributeLinear,
  type CurveDay,
  type DailyFeedEstimate,
  type BagReconstructionInput,
} from "@/src/lib/feed-reference-core"

// =============================================================================
// Reconstruction principale
// =============================================================================

/**
 * Reconstruit la consommation journalière depuis un événement sac.
 *
 * @param input    Paramètres du sac (poids, dates, effectif, souche, profils)
 * @param adjustedCurve  Courbe ajustée pour la période (depuis getAdjustedCurveForBatch)
 *                       Vide → fallback LINEAR automatique
 *
 * @returns Un tableau de DailyFeedEstimate, un par jour de la période.
 *          La somme de estimatedFeedKg = input.bagWeightKg (à ±0.001 kg près).
 */
export function reconstructDailyFromBagEvent(
  input: BagReconstructionInput,
  adjustedCurve: CurveDay[]
): DailyFeedEstimate[] {
  // Fallback linéaire si aucune courbe disponible
  if (adjustedCurve.length === 0) {
    return distributeLinear(input)
  }

  const duration = input.endAgeDay - input.startAgeDay + 1

  // Construire un index par ageDay pour un accès O(1)
  const curveByDay = new Map<number, CurveDay>()
  for (const point of adjustedCurve) {
    curveByDay.set(point.ageDay, point)
  }

  // Collecter les valeurs de référence pour chaque jour de la période
  // Si un jour manque dans la courbe → interpolation plate depuis voisins
  const dayValues: { ageDay: number; feedG: number; qualityLevel: string }[] = []
  for (let i = 0; i < duration; i++) {
    const ageDay = input.startAgeDay + i
    const point = curveByDay.get(ageDay)
    if (point) {
      dayValues.push({ ageDay, feedG: point.dailyFeedGPerBird, qualityLevel: point.qualityLevel })
    } else {
      // Interpolation des voisins pour remplir les trous
      const interpolated = interpolateMissingDay(ageDay, curveByDay, input.startAgeDay, input.endAgeDay)
      dayValues.push({ ageDay, feedG: interpolated, qualityLevel: "ESTIMATED" })
    }
  }

  // Calculer la somme totale des valeurs de référence sur la période
  const totalReferenceG = dayValues.reduce((sum, d) => sum + d.feedG, 0)

  // Si la courbe est nulle sur toute la période → fallback linéaire
  if (totalReferenceG <= 0) {
    return distributeLinear(input)
  }

  // Calculer les proportions et distribuer le poids réel
  const confidence = computeConfidence(input, adjustedCurve)
  const curveVersion = adjustedCurve[0]?.version ?? null

  const theoreticalReferenceKg =
    (totalReferenceG * input.livingBirdsEstimate) / 1000

  const results: DailyFeedEstimate[] = []
  let remainingKg = input.bagWeightKg

  for (let i = 0; i < dayValues.length; i++) {
    const { ageDay, feedG } = dayValues[i]
    const date = new Date(input.startDate)
    date.setUTCDate(date.getUTCDate() + i)

    const isLast = i === dayValues.length - 1

    // Pour le dernier jour, utiliser le solde restant (évite les erreurs d'arrondi)
    const proportion = feedG / totalReferenceG
    const estimatedFeedKg = isLast
      ? Math.round(remainingKg * 1000) / 1000
      : Math.round(input.bagWeightKg * proportion * 1000) / 1000

    remainingKg -= estimatedFeedKg

    const estimatedFeedGPerBird =
      input.livingBirdsEstimate > 0
        ? Math.round((estimatedFeedKg * 1000) / input.livingBirdsEstimate * 10) / 10
        : 0

    results.push({
      ageDay,
      date,
      estimatedFeedKg,
      estimatedFeedGPerBird,
      dataSource: "ESTIMATED_FROM_BAG",
      estimationMethod: "CURVE_WEIGHTED",
      confidence,
      theoreticalReferenceKg,
      curveVersion,
    })
  }

  return results
}

// =============================================================================
// Helpers internes
// =============================================================================

/**
 * Interpole la valeur g/bird/jour pour un jour absent de la courbe,
 * en cherchant les voisins les plus proches dans la carte.
 */
function interpolateMissingDay(
  ageDay: number,
  curveByDay: Map<number, CurveDay>,
  startAgeDay: number,
  endAgeDay: number
): number {
  // Chercher le point inférieur le plus proche
  let lower: CurveDay | null = null
  for (let d = ageDay - 1; d >= startAgeDay; d--) {
    const p = curveByDay.get(d)
    if (p) { lower = p; break }
  }

  // Chercher le point supérieur le plus proche
  let upper: CurveDay | null = null
  for (let d = ageDay + 1; d <= endAgeDay; d++) {
    const p = curveByDay.get(d)
    if (p) { upper = p; break }
  }

  if (lower && upper) {
    // Interpolation linéaire
    const progress = (ageDay - lower.ageDay) / (upper.ageDay - lower.ageDay)
    return lower.dailyFeedGPerBird + progress * (upper.dailyFeedGPerBird - lower.dailyFeedGPerBird)
  }
  if (lower) return lower.dailyFeedGPerBird
  if (upper) return upper.dailyFeedGPerBird
  return 0
}

// =============================================================================
// Utilitaire : vérification de la somme (tests / assertions)
// =============================================================================

/**
 * Vérifie que la somme des estimations = bagWeightKg, à une tolérance près.
 * Utilisé dans les tests unitaires.
 */
export function assertReconstructionSum(
  estimates: DailyFeedEstimate[],
  expectedTotalKg: number,
  toleranceKg = 0.01
): boolean {
  const actualTotal = estimates.reduce((sum, e) => sum + e.estimatedFeedKg, 0)
  return Math.abs(actualTotal - expectedTotalKg) <= toleranceKg
}
