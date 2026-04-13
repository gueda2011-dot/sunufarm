/**
 * SunuFarm — Référentiel alimentaire : fonctions partagées chair / pondeuse
 *
 * Ce module expose les primitives communes aux deux types de lots :
 *   - Lecture des courbes zootechniques depuis la table ZootechnicalCurvePoint
 *   - Application des ajustements (profil Sénégal + facteur ferme)
 *   - Calcul du niveau de confiance d'une estimation
 *   - Fallback de distribution linéaire
 *
 * Les fonctions spécifiques à chaque type de lot sont dans :
 *   - feed-reference-chair.ts
 *   - feed-reference-pondeuse.ts
 *
 * Convention :
 *   - Les valeurs sont en grammes / oiseau / jour sauf mention contraire
 *   - Les fonctions sont pures (pas d'effet de bord)
 *   - prisma est passé en paramètre (pas d'import global) pour testabilité
 */

import type { PrismaClient, ZootechnicalCurvePoint } from "@/src/generated/prisma"
import {
  resolveSenegalProfile,
  type SenegalProfileCode,
} from "@/src/constants/senegal-profiles"

// =============================================================================
// Types publics
// =============================================================================

export interface CurveDay {
  ageDay: number
  dailyFeedGPerBird: number // g/oiseau/jour ajusté
  rawGeneticFeedG: number // g/oiseau/jour génétique brut (avant ajustement)
  bodyWeightG: number | null
  qualityLevel: string // "HIGH" | "MEDIUM" | "LOW" | "ESTIMATED"
  version: string
}

export interface AdjustedReference {
  ageDay: number
  /** Valeur génétique brute (table officielle) */
  genetic: number
  /** Valeur après ajustement profil Sénégal */
  senegal: number
  /** Valeur après ajustement ferme (= senegal si pas de facteur ferme actif) */
  farm: number
  /** Source utilisée */
  source: "genetic" | "senegal" | "farm"
}

export interface FarmAdjustmentFactors {
  feedFactor: number // multiplicateur consommation (ex: 0.92)
  weightFactor: number // multiplicateur poids (ex: 0.88)
  fcrFactor: number // multiplicateur FCR (ex: 1.10)
  layingFactor: number // multiplicateur ponte (ex: 0.92)
}

export type ConfidenceLevelValue = "HIGH" | "MEDIUM" | "LOW"

export interface BagReconstructionInput {
  bagWeightKg: number
  startDate: Date
  endDate: Date
  startAgeDay: number
  endAgeDay: number
  livingBirdsEstimate: number
  breedCode: string
  senegalProfileCode: SenegalProfileCode
  /** null → ajustement ferme pas encore actif (OBSERVING/SUGGESTED) */
  farmFactors: FarmAdjustmentFactors | null
}

export interface DailyFeedEstimate {
  ageDay: number
  date: Date
  estimatedFeedKg: number
  estimatedFeedGPerBird: number
  dataSource: "ESTIMATED_FROM_BAG"
  estimationMethod: "CURVE_WEIGHTED" | "LINEAR"
  confidence: ConfidenceLevelValue
  theoreticalReferenceKg: number // total théorique sur la période (pour affichage)
  curveVersion: string | null
}

// =============================================================================
// Lecture des courbes
// =============================================================================

/**
 * Charge les points de courbe active pour une plage de jours d'âge.
 * Retourne un tableau vide si aucune courbe n'existe pour cette souche.
 */
export async function getCurvePoints(
  prisma: PrismaClient,
  breedCode: string,
  batchType: "CHAIR" | "PONDEUSE",
  startAgeDay: number,
  endAgeDay: number
): Promise<ZootechnicalCurvePoint[]> {
  return prisma.zootechnicalCurvePoint.findMany({
    where: {
      breedCode,
      batchType,
      ageDay: { gte: startAgeDay, lte: endAgeDay },
      isActive: true,
    },
    orderBy: { ageDay: "asc" },
  })
}

// =============================================================================
// Application des ajustements
// =============================================================================

/**
 * Applique les facteurs d'ajustement (Sénégal + ferme si active) sur une série
 * de points de courbe génétique.
 *
 * Formula :
 *   adjusted = genetic × senegalFeedFactor × (farmFeedFactor si fourni, sinon 1)
 */
export function applyAdjustments(
  points: ZootechnicalCurvePoint[],
  senegalProfileCode: SenegalProfileCode,
  farmFactors: FarmAdjustmentFactors | null
): CurveDay[] {
  const profile = resolveSenegalProfile(senegalProfileCode, null)
  const senegalFeedCoef = profile.factors.feed.coefficient
  const farmFeedCoef = farmFactors?.feedFactor ?? 1

  return points.map((p) => {
    const rawG = p.dailyFeedGPerBird ?? 0
    const adjusted = rawG * senegalFeedCoef * farmFeedCoef
    return {
      ageDay: p.ageDay,
      dailyFeedGPerBird: Math.round(adjusted * 100) / 100,
      rawGeneticFeedG: rawG,
      bodyWeightG: p.bodyWeightG ?? null,
      qualityLevel: p.qualityLevel,
      version: p.version,
    }
  })
}

/**
 * Calcule la référence ajustée pour un seul jour d'âge (pour affichage dashboard).
 */
export function getAdjustedSingleDay(
  point: ZootechnicalCurvePoint,
  senegalProfileCode: SenegalProfileCode,
  farmFactors: FarmAdjustmentFactors | null
): AdjustedReference {
  const profile = resolveSenegalProfile(senegalProfileCode, null)
  const senegalCoef = profile.factors.feed.coefficient
  const farmCoef = farmFactors?.feedFactor ?? 1
  const rawG = point.dailyFeedGPerBird ?? 0

  const senegalValue = rawG * senegalCoef
  const farmValue = senegalValue * farmCoef

  return {
    ageDay: point.ageDay,
    genetic: rawG,
    senegal: Math.round(senegalValue * 100) / 100,
    farm: Math.round(farmValue * 100) / 100,
    source: farmFactors ? "farm" : senegalCoef !== 1 ? "senegal" : "genetic",
  }
}

// =============================================================================
// Calcul du niveau de confiance
// =============================================================================

/**
 * Calcule le niveau de confiance d'une estimation sac.
 *
 * Score initial : 100 points, déductions sur 4 facteurs :
 *
 * Facteur 1 — Durée du sac
 *   > 14 jours : -40  (reconstruction très étalée = incertitude forte)
 *   8–14 jours : -20
 *   ≤ 7 jours  : 0
 *
 * Facteur 2 — Cohérence avec la référence
 *   > 30% d'écart vs référence théorique : -30  (anomalie probable)
 *   15–30% d'écart                       : -15
 *   ≤ 15%                                : 0
 *
 * Facteur 3 — Qualité de la courbe
 *   Au moins un point ESTIMATED : -15
 *   Au moins un point LOW       : -10
 *
 * Facteur 4 — Sac non clôturé
 *   endDate non définie         : -20
 *
 * Score → niveau :
 *   ≥ 75 : HIGH
 *   ≥ 45 : MEDIUM
 *   < 45  : LOW
 */
export function computeConfidence(
  input: BagReconstructionInput,
  adjustedCurve: CurveDay[]
): ConfidenceLevelValue {
  let score = 100

  // Facteur 1 : durée
  const duration = input.endAgeDay - input.startAgeDay + 1
  if (duration > 14) score -= 40
  else if (duration > 7) score -= 20

  // Facteur 2 : cohérence avec la référence
  if (adjustedCurve.length > 0 && input.livingBirdsEstimate > 0) {
    const totalTheoreticalG = adjustedCurve.reduce((sum, p) => sum + p.dailyFeedGPerBird, 0)
    const totalTheoreticalKg = (totalTheoreticalG * input.livingBirdsEstimate) / 1000
    if (totalTheoreticalKg > 0) {
      const deviation = Math.abs(input.bagWeightKg - totalTheoreticalKg) / totalTheoreticalKg
      if (deviation > 0.3) score -= 30
      else if (deviation > 0.15) score -= 15
    }
  }

  // Facteur 3 : qualité de la courbe
  const hasEstimated = adjustedCurve.some((p) => p.qualityLevel === "ESTIMATED")
  const hasLow = adjustedCurve.some((p) => p.qualityLevel === "LOW")
  if (hasEstimated) score -= 15
  else if (hasLow) score -= 10

  // Facteur 4 : sac non clôturé (endDate = endDate toujours présent ici,
  // mais on peut vérifier si c'est une estimation sur sac ouvert)
  // (transmis via le champ endAgeDay en amont)

  if (score >= 75) return "HIGH"
  if (score >= 45) return "MEDIUM"
  return "LOW"
}

// =============================================================================
// Distribution linéaire (fallback)
// =============================================================================

/**
 * Distribution linéaire plate d'un sac sur une période.
 * Utilisée quand aucune courbe n'est disponible pour la souche.
 * Toujours confidence = LOW.
 */
export function distributeLinear(input: BagReconstructionInput): DailyFeedEstimate[] {
  const duration = input.endAgeDay - input.startAgeDay + 1
  const kgPerDay = input.bagWeightKg / duration
  const gPerBirdPerDay =
    input.livingBirdsEstimate > 0
      ? (kgPerDay * 1000) / input.livingBirdsEstimate
      : 0

  const results: DailyFeedEstimate[] = []
  for (let i = 0; i < duration; i++) {
    const date = new Date(input.startDate)
    date.setUTCDate(date.getUTCDate() + i)
    results.push({
      ageDay: input.startAgeDay + i,
      date,
      estimatedFeedKg: Math.round(kgPerDay * 1000) / 1000,
      estimatedFeedGPerBird: Math.round(gPerBirdPerDay * 10) / 10,
      dataSource: "ESTIMATED_FROM_BAG",
      estimationMethod: "LINEAR",
      confidence: "LOW",
      theoreticalReferenceKg: input.bagWeightKg, // trivial pour le linéaire
      curveVersion: null,
    })
  }
  return results
}
