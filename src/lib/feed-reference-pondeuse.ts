/**
 * SunuFarm — Référentiel alimentaire : logique spécifique PONDEUSE (layers)
 *
 * Fonctions propres aux lots de pondeuses :
 *   - Taux de ponte
 *   - Masse d'oeuf produite
 *   - Indice de consommation par oeuf (IC/oeuf ou feed per egg)
 *   - Comparaison réel vs référence ajustée pondeuse
 *
 * Ces fonctions sont pures. Les références zootechniques sont lues via
 * feed-reference-core.ts → ZootechnicalCurvePoint.
 *
 * Note sur les unités pondeuse :
 *   - Le taux de ponte est en % (0–100)
 *   - La masse d'oeuf est en g/oiseau/jour
 *   - L'IC oeuf est en g aliment / g oeuf produit
 */

import type { PrismaClient } from "@/src/generated/prisma"
import {
  getCurvePoints,
  getAdjustedSingleDay,
  type FarmAdjustmentFactors,
} from "@/src/lib/feed-reference-core"
import {
  resolveSenegalProfile,
  type SenegalProfileCode,
} from "@/src/constants/senegal-profiles"

// =============================================================================
// Types pondeuse
// =============================================================================

export interface LayerReferenceComparison {
  ageDay: number
  /** Taux de ponte réel en % */
  actualLayingRatePct: number | null
  /** Taux de ponte théorique ajusté en % */
  adjustedLayingRatePct: number | null
  /** Écart en points de % (réel - référence) */
  layingRateDeviationPts: number | null
  /** Consommation réelle en g/oiseau/jour */
  actualFeedGPerBird: number | null
  /** Consommation théorique ajustée en g/oiseau/jour */
  adjustedFeedGPerBird: number | null
  feedDeviationPct: number | null
  /** Masse d'oeufs réelle en g/oiseau/jour */
  actualEggMassGPerBird: number | null
  /** Masse théorique ajustée en g/oiseau/jour */
  adjustedEggMassGPerBird: number | null
  /** IC oeuf réel (g aliment / g oeuf) */
  actualFeedPerEggG: number | null
  /** IC oeuf théorique ajusté */
  adjustedFeedPerEggG: number | null
}

// =============================================================================
// Taux de ponte
// =============================================================================

/**
 * Calcule le taux de ponte journalier.
 *
 * Taux = (oeufs ramassés / oiseaux vivants) × 100
 * Un taux > 100% est impossible — clampé.
 *
 * @returns Pourcentage (0–100) ou null si oiseaux = 0
 */
export function computeLayingRate(
  eggsProduced: number,
  livingBirds: number
): number | null {
  if (livingBirds <= 0) return null
  const rate = (Math.max(0, eggsProduced) / livingBirds) * 100
  return Math.round(Math.min(100, rate) * 10) / 10
}

// =============================================================================
// Masse d'oeuf
// =============================================================================

/**
 * Masse d'oeuf produite par oiseau et par jour.
 *
 * eggMass = (oeufs × poidsOeuf) / oiseaux / jour
 * Exprimée en g/oiseau/jour.
 *
 * @param eggsProduced  Nombre d'oeufs ramassés sur la période
 * @param avgEggWeightG Poids moyen d'un oeuf en grammes (ex: 62)
 * @param livingBirds   Effectif vivant moyen sur la période
 * @param days          Nombre de jours de la période
 * @returns g/oiseau/jour ou null si données manquantes
 */
export function computeEggMass(
  eggsProduced: number,
  avgEggWeightG: number,
  livingBirds: number,
  days = 1
): number | null {
  if (livingBirds <= 0 || days <= 0 || avgEggWeightG <= 0) return null
  const totalMassG = eggsProduced * avgEggWeightG
  return Math.round((totalMassG / livingBirds / days) * 10) / 10
}

// =============================================================================
// Indice de consommation oeuf (IC oeuf)
// =============================================================================

/**
 * Indice de consommation par oeuf.
 *
 * IC = (aliment consommé g) / (masse oeuf produite g)
 * Un IC bas est meilleur (moins d'aliment pour produire la même masse d'oeuf).
 * Référence ISA Brown optimale : ~2.1–2.2 en pic de ponte.
 *
 * @param totalFeedKg        Aliment total consommé sur la période (kg)
 * @param totalEggMassKg     Masse totale d'oeufs produits (kg)
 * @returns g aliment / g oeuf, ou null si masse oeuf = 0
 */
export function computeFeedPerEgg(
  totalFeedKg: number,
  totalEggMassKg: number
): number | null {
  if (totalEggMassKg <= 0) return null
  return Math.round((totalFeedKg / totalEggMassKg) * 100) / 100
}

// =============================================================================
// Taux de ponte théorique de référence
// =============================================================================

/**
 * Retourne le taux de ponte théorique ajusté pour un jour d'âge donné.
 */
export async function getLayerTheoreticalLayingRate(
  prisma: PrismaClient,
  breedCode: string,
  ageDay: number,
  senegalProfileCode: SenegalProfileCode,
  farmFactors: FarmAdjustmentFactors | null
): Promise<{ geneticPct: number | null; adjustedPct: number | null }> {
  const points = await getCurvePoints(prisma, breedCode, "PONDEUSE", ageDay, ageDay)
  if (points.length === 0) return { geneticPct: null, adjustedPct: null }

  const point = points[0]
  const geneticPct = point.layingRatePct
  if (geneticPct === null) return { geneticPct: null, adjustedPct: null }

  const profile = resolveSenegalProfile(senegalProfileCode, null)
  const senegalCoef = profile.factors.laying.coefficient
  const farmCoef = farmFactors?.layingFactor ?? 1
  const adjustedPct = Math.round(geneticPct * senegalCoef * farmCoef * 10) / 10

  return { geneticPct, adjustedPct: Math.min(100, adjustedPct) }
}

// =============================================================================
// Comparaison réel vs référence pondeuse
// =============================================================================

/**
 * Compare les données réelles d'un lot pondeuse avec la référence ajustée.
 */
export async function compareLayerVsReference(
  prisma: PrismaClient,
  params: {
    ageDay: number
    actualFeedKg: number | null
    livingBirds: number
    eggsProducedToday: number | null
    actualEggMassGPerBird: number | null
    breedCode: string
    senegalProfileCode: SenegalProfileCode
    farmFactors: FarmAdjustmentFactors | null
  }
): Promise<LayerReferenceComparison> {
  const { ageDay, actualFeedKg, livingBirds, eggsProducedToday } = params

  const points = await getCurvePoints(prisma, params.breedCode, "PONDEUSE", ageDay, ageDay)

  const actualFeedGPerBird =
    actualFeedKg !== null && livingBirds > 0
      ? Math.round((actualFeedKg * 1000) / livingBirds * 10) / 10
      : null

  const actualLayingRatePct =
    eggsProducedToday !== null ? computeLayingRate(eggsProducedToday, livingBirds) : null

  if (points.length === 0) {
    return {
      ageDay,
      actualLayingRatePct,
      adjustedLayingRatePct: null,
      layingRateDeviationPts: null,
      actualFeedGPerBird,
      adjustedFeedGPerBird: null,
      feedDeviationPct: null,
      actualEggMassGPerBird: params.actualEggMassGPerBird,
      adjustedEggMassGPerBird: null,
      actualFeedPerEggG: null,
      adjustedFeedPerEggG: null,
    }
  }

  const point = points[0]
  const ref = getAdjustedSingleDay(point, params.senegalProfileCode, params.farmFactors)

  const profile = resolveSenegalProfile(params.senegalProfileCode, null)
  const layingCoef = profile.factors.laying.coefficient * (params.farmFactors?.layingFactor ?? 1)

  const adjustedLayingRatePct =
    point.layingRatePct !== null
      ? Math.round(Math.min(100, point.layingRatePct * layingCoef) * 10) / 10
      : null

  const layingRateDeviationPts =
    actualLayingRatePct !== null && adjustedLayingRatePct !== null
      ? Math.round((actualLayingRatePct - adjustedLayingRatePct) * 10) / 10
      : null

  const feedDeviationPct =
    actualFeedGPerBird !== null && ref.farm > 0
      ? Math.round(((actualFeedGPerBird - ref.farm) / ref.farm) * 100 * 10) / 10
      : null

  const adjustedEggMassGPerBird =
    point.eggMassGPerBird !== null
      ? Math.round(point.eggMassGPerBird * layingCoef * 10) / 10
      : null

  const adjustedFeedPerEggG = point.feedPerEggG

  const actualFeedPerEggG =
    actualFeedKg !== null &&
    params.actualEggMassGPerBird !== null &&
    params.actualEggMassGPerBird > 0
      ? computeFeedPerEgg(actualFeedKg, (params.actualEggMassGPerBird * livingBirds) / 1000)
      : null

  return {
    ageDay,
    actualLayingRatePct,
    adjustedLayingRatePct,
    layingRateDeviationPts,
    actualFeedGPerBird,
    adjustedFeedGPerBird: ref.farm,
    feedDeviationPct,
    actualEggMassGPerBird: params.actualEggMassGPerBird,
    adjustedEggMassGPerBird,
    actualFeedPerEggG,
    adjustedFeedPerEggG,
  }
}
