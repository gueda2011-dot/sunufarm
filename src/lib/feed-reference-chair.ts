/**
 * SunuFarm — Référentiel alimentaire : logique spécifique CHAIR (broilers)
 *
 * Fonctions propres aux lots de poulets de chair :
 *   - FCR (Feed Conversion Ratio / Indice de Consommation)
 *   - ADG / GMQ (Average Daily Gain / Gain Moyen Quotidien)
 *   - Poids théorique par souche et âge
 *   - Comparaison réel vs référence ajustée
 *
 * Ces fonctions sont pures. Les références zootechniques sont lues via
 * feed-reference-core.ts → ZootechnicalCurvePoint.
 */

import type { PrismaClient } from "@/src/generated/prisma"
import {
  getCurvePoints,
  applyAdjustments,
  getAdjustedSingleDay,
  type FarmAdjustmentFactors,
  type AdjustedReference,
} from "@/src/lib/feed-reference-core"
import {
  resolveSenegalProfile,
  type SenegalProfileCode,
} from "@/src/constants/senegal-profiles"

// =============================================================================
// Types chair
// =============================================================================

export interface ChairReferenceComparison {
  ageDay: number
  /** Consommation réelle journalière en g/oiseau/jour */
  actualFeedGPerBird: number | null
  /** Référence génétique en g/oiseau/jour */
  geneticFeedG: number | null
  /** Référence ajustée Sénégal (+ ferme si active) en g/oiseau/jour */
  adjustedFeedG: number | null
  /** Écart en % vs référence ajustée (positif = consommation supérieure) */
  deviationPct: number | null
  /** Poids réel en g (si pesée disponible) */
  actualWeightG: number | null
  /** Poids théorique ajusté en g */
  adjustedWeightG: number | null
  weightDeviationPct: number | null
}

export interface ChairFCRResult {
  /** FCR calculé = totalFeedKg / totalWeightGainKg */
  fcr: number | null
  /** FCR de référence ajusté Sénégal pour l'âge courant */
  referenceFCR: number | null
  /** Écart FCR réel vs référence (+ = dégradé, - = meilleur) */
  fcrDeltaVsReference: number | null
}

// =============================================================================
// FCR (Indice de consommation)
// =============================================================================

/**
 * Calcule le FCR réel d'un lot chair.
 *
 * FCR = totalFeedKg / totalWeightGainKg
 * Un FCR bas est meilleur (moins d'aliment pour le même gain de poids).
 * Cobb 500 objectif industriel : ~1.7–1.8 à 35 jours.
 * Sénégal standard : ~1.9–2.1.
 *
 * @returns null si le gain de poids est nul ou inconnu
 */
export function computeBroilerFCR(
  totalFeedKg: number,
  totalWeightGainKg: number
): number | null {
  if (totalWeightGainKg <= 0 || totalFeedKg < 0) return null
  return Math.round((totalFeedKg / totalWeightGainKg) * 100) / 100
}

/**
 * FCR de référence ajusté pour un profil Sénégal donné.
 * Utilise le FCR génétique × fcrFactor du profil.
 *
 * Valeurs génétiques approximatives (à J35) :
 *   COBB500 : 1.75 | ROSS308 : 1.78
 * Après ajustement STANDARD_LOCAL : ~1.93–1.96
 */
export function computeReferenceFCR(
  geneticFCR: number,
  senegalProfileCode: SenegalProfileCode,
  farmFactors: FarmAdjustmentFactors | null
): number {
  const profile = resolveSenegalProfile(senegalProfileCode, null)
  const senegalCoef = profile.factors.fcr.coefficient
  const farmCoef = farmFactors?.fcrFactor ?? 1
  return Math.round(geneticFCR * senegalCoef * farmCoef * 100) / 100
}

// =============================================================================
// Gain Moyen Quotidien (ADG / GMQ)
// =============================================================================

/**
 * Gain moyen quotidien (Average Daily Gain).
 *
 * ADG = (poidsActuel - poidsEntrée) / nbJours
 * Exprimé en g/jour.
 *
 * @returns null si ageDays = 0
 */
export function computeADG(
  currentWeightG: number,
  entryWeightG: number,
  ageDays: number
): number | null {
  if (ageDays <= 0) return null
  const gain = currentWeightG - entryWeightG
  if (gain < 0) return null
  return Math.round((gain / ageDays) * 10) / 10
}

// =============================================================================
// Poids théorique de référence
// =============================================================================

/**
 * Retourne le poids théorique ajusté pour un jour d'âge donné.
 * Lit depuis ZootechnicalCurvePoint (version active).
 */
export async function getChairTheoreticalWeight(
  prisma: PrismaClient,
  breedCode: string,
  ageDay: number,
  senegalProfileCode: SenegalProfileCode,
  farmFactors: FarmAdjustmentFactors | null
): Promise<{ geneticG: number | null; adjustedG: number | null }> {
  const points = await getCurvePoints(prisma, breedCode, "CHAIR", ageDay, ageDay)
  if (points.length === 0) return { geneticG: null, adjustedG: null }

  const point = points[0]
  const geneticG = point.bodyWeightG

  if (geneticG === null) return { geneticG: null, adjustedG: null }

  const profile = resolveSenegalProfile(senegalProfileCode, null)
  const senegalCoef = profile.factors.weight.coefficient
  const farmCoef = farmFactors?.weightFactor ?? 1
  const adjustedG = Math.round(geneticG * senegalCoef * farmCoef)

  return { geneticG, adjustedG }
}

// =============================================================================
// Comparaison réel vs référence
// =============================================================================

/**
 * Compare les données réelles d'un lot chair avec la référence ajustée.
 * Utilisé pour construire les graphiques de suivi et les diagnostics.
 */
export async function compareChairVsReference(
  prisma: PrismaClient,
  params: {
    ageDay: number
    actualFeedKg: number | null
    livingBirds: number
    actualWeightG: number | null
    breedCode: string
    senegalProfileCode: SenegalProfileCode
    farmFactors: FarmAdjustmentFactors | null
  }
): Promise<ChairReferenceComparison> {
  const { ageDay, actualFeedKg, livingBirds, actualWeightG, breedCode } = params

  const points = await getCurvePoints(prisma, breedCode, "CHAIR", ageDay, ageDay)

  if (points.length === 0) {
    return {
      ageDay,
      actualFeedGPerBird:
        actualFeedKg !== null && livingBirds > 0
          ? Math.round((actualFeedKg * 1000) / livingBirds * 10) / 10
          : null,
      geneticFeedG: null,
      adjustedFeedG: null,
      deviationPct: null,
      actualWeightG,
      adjustedWeightG: null,
      weightDeviationPct: null,
    }
  }

  const point = points[0]
  const ref: AdjustedReference = getAdjustedSingleDay(
    point,
    params.senegalProfileCode,
    params.farmFactors
  )

  const actualFeedGPerBird =
    actualFeedKg !== null && livingBirds > 0
      ? Math.round((actualFeedKg * 1000) / livingBirds * 10) / 10
      : null

  const deviationPct =
    actualFeedGPerBird !== null && ref.farm > 0
      ? Math.round(((actualFeedGPerBird - ref.farm) / ref.farm) * 100 * 10) / 10
      : null

  const profile = resolveSenegalProfile(params.senegalProfileCode, null)
  const adjustedWeightG =
    point.bodyWeightG !== null
      ? Math.round(
          point.bodyWeightG *
            profile.factors.weight.coefficient *
            (params.farmFactors?.weightFactor ?? 1)
        )
      : null

  const weightDeviationPct =
    actualWeightG !== null && adjustedWeightG !== null && adjustedWeightG > 0
      ? Math.round(((actualWeightG - adjustedWeightG) / adjustedWeightG) * 100 * 10) / 10
      : null

  return {
    ageDay,
    actualFeedGPerBird,
    geneticFeedG: point.dailyFeedGPerBird,
    adjustedFeedG: ref.farm,
    deviationPct,
    actualWeightG,
    adjustedWeightG,
    weightDeviationPct,
  }
}
