/**
 * SunuFarm — Calcul des facteurs d'ajustement ferme (état OBSERVING)
 *
 * Ce module calcule les facteurs d'ajustement observés pour une ferme donnée,
 * en comparant les performances réelles de ses lots clôturés aux références
 * génétiques ajustées au profil Sénégal actif.
 *
 * RÈGLE CRITIQUE : ce module ne modifie JAMAIS FarmAdjustmentProfile.
 *   - Il calcule et retourne les facteurs observés (état OBSERVING).
 *   - L'écriture en base est du ressort de l'action serveur dédiée,
 *     après validation explicite du manager/owner (transition SUGGESTED → ACTIVE).
 *
 * Algorithme :
 *   1. Charger les N derniers lots CLÔTURÉS de la ferme (avec données complètes).
 *   2. Pour chaque lot, calculer :
 *        feedFactor   = totalFeedKg_réel / totalFeedKg_génétique_ajusté_sénégal
 *        weightFactor = avgFinalWeightG_réel / avgFinalWeightG_génétique_ajusté_sénégal
 *        fcrFactor    = FCR_réel / FCR_génétique_ajusté_sénégal
 *        layingFactor = avgLayingRatePct_réelle / avgLayingRatePct_génétique (pondeuse)
 *   3. Prendre la médiane des facteurs sur l'ensemble des lots (robuste aux outliers).
 *   4. Retourner les facteurs + métadonnées (count, période, confiance).
 *
 * Seuil de suggestion :
 *   Si basedOnBatchCount >= minBatchesForSuggestion ET écart > 5% vs 1.0
 *   → la ferme peut passer à SUGGESTED (décision de l'action serveur).
 */

import type { PrismaClient } from "@/src/generated/prisma"
import {
  getCurvePoints,
  applyAdjustments,
  type FarmAdjustmentFactors,
} from "@/src/lib/feed-reference-core"
import {
  resolveSenegalProfile,
  type SenegalProfileCode,
} from "@/src/constants/senegal-profiles"

// =============================================================================
// Types
// =============================================================================

export interface FarmObservedFactors {
  /** Facteurs observés (médiane sur les lots analysés) */
  feedFactor: number
  weightFactor: number
  fcrFactor: number
  layingFactor: number

  /** Méta-données de confiance */
  basedOnBatchCount: number
  basedOnPeriodMonths: number | null
  /** true si écart > 5% sur au moins un facteur ET count >= minBatchesForSuggestion */
  suggestionReady: boolean

  /** Détail par lot (pour affichage admin) */
  perBatchDetails: PerBatchDetail[]
}

export interface PerBatchDetail {
  batchId: string
  batchNumber: string
  breedCode: string | null
  batchType: "CHAIR" | "PONDEUSE"
  durationDays: number
  observedFeedFactor: number | null
  observedWeightFactor: number | null
  observedFCR: number | null
  geneticFCR: number | null
  closedAt: Date
}

// =============================================================================
// Utilitaires statistiques
// =============================================================================

/**
 * Médiane d'un tableau de nombres (valeur centrale robuste aux outliers).
 * Retourne null si le tableau est vide.
 */
function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Arrondit à 3 décimales (précision suffisante pour les facteurs multiplicatifs).
 */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

// =============================================================================
// Calcul des facteurs observés
// =============================================================================

/**
 * Calcule les facteurs d'ajustement observés pour une ferme.
 *
 * @param prisma       Instance Prisma
 * @param farmId       Identifiant de la ferme
 * @param senegalProfileCode  Profil Sénégal actif (lot > ferme > STANDARD_LOCAL)
 * @param options      Options de calcul
 *
 * @returns Facteurs observés + métadonnées. Ne modifie pas la base de données.
 */
export async function computeFarmObservedFactors(
  prisma: PrismaClient,
  farmId: string,
  senegalProfileCode: SenegalProfileCode,
  options: {
    /** Nombre max de lots à analyser (les plus récents en premier) */
    maxBatches?: number
    /** Seuil de lots pour déclencher une suggestion */
    minBatchesForSuggestion?: number
    /** Fenêtre temporelle maximale en mois */
    maxPeriodMonths?: number
  } = {}
): Promise<FarmObservedFactors> {
  const {
    maxBatches = 10,
    minBatchesForSuggestion = 3,
    maxPeriodMonths = 18,
  } = options

  // Fenêtre temporelle
  const cutoffDate = new Date()
  cutoffDate.setMonth(cutoffDate.getMonth() - maxPeriodMonths)

  // Charger les lots clôturés de la ferme avec les données nécessaires
  const batches = await prisma.batch.findMany({
    where: {
      building: { farmId },
      status: "CLOSED",
      closedAt: { gte: cutoffDate },
      deletedAt: null,
    },
    orderBy: { closedAt: "desc" },
    take: maxBatches,
    select: {
      id: true,
      number: true,
      type: true,
      entryDate: true,
      entryCount: true,
      entryAgeDay: true,
      entryWeightG: true,
      closedAt: true,
      senegalProfileOverride: true,
      breed: {
        select: { code: true },
      },
      dailyRecords: {
        select: { feedKg: true, mortality: true, date: true },
        orderBy: { date: "asc" },
      },
      weightRecords: {
        select: { avgWeightG: true, batchAgeDay: true },
        orderBy: { batchAgeDay: "desc" },
        take: 1,
      },
    },
  })

  if (batches.length === 0) {
    return {
      feedFactor: 1,
      weightFactor: 1,
      fcrFactor: 1,
      layingFactor: 1,
      basedOnBatchCount: 0,
      basedOnPeriodMonths: null,
      suggestionReady: false,
      perBatchDetails: [],
    }
  }

  const feedFactors: number[] = []
  const weightFactors: number[] = []
  const fcrFactors: number[] = []
  const layingFactors: number[] = []
  const perBatchDetails: PerBatchDetail[] = []

  for (const batch of batches) {
    if (!batch.closedAt) continue

    const breedCode = batch.breed?.code ?? null
    const batchType = batch.type as "CHAIR" | "PONDEUSE"
    const durationDays = Math.round(
      (batch.closedAt.getTime() - batch.entryDate.getTime()) / 86_400_000
    )

    // Profil Sénégal effectif pour ce lot
    const effectiveProfile =
      (batch.senegalProfileOverride as SenegalProfileCode | null) ??
      senegalProfileCode
    const senegalProfile = resolveSenegalProfile(effectiveProfile, null)

    // Effectif moyen (approximation conservatrice)
    const totalMortality = batch.dailyRecords.reduce(
      (sum, r) => sum + r.mortality,
      0
    )
    const avgLivingBirds = Math.max(
      1,
      batch.entryCount - Math.floor(totalMortality / 2)
    )

    // Consommation réelle totale
    const totalActualFeedKg = batch.dailyRecords.reduce(
      (sum, r) => sum + (r.feedKg ?? 0),
      0
    )

    const detail: PerBatchDetail = {
      batchId: batch.id,
      batchNumber: batch.number,
      breedCode,
      batchType,
      durationDays,
      observedFeedFactor: null,
      observedWeightFactor: null,
      observedFCR: null,
      geneticFCR: null,
      closedAt: batch.closedAt,
    }

    if (breedCode && durationDays > 0) {
      // Âge de début et de fin de lot
      const startAgeDay = batch.entryAgeDay ?? 0
      const endAgeDay = startAgeDay + durationDays - 1

      // Charger la courbe génétique pour la période du lot
      const curvePoints = await getCurvePoints(
        prisma,
        breedCode,
        batchType,
        startAgeDay,
        endAgeDay
      )

      if (curvePoints.length > 0) {
        // Appliquer le profil Sénégal (sans facteur ferme — c'est ce qu'on veut mesurer)
        const adjustedCurve = applyAdjustments(curvePoints, effectiveProfile, null)

        // Consommation théorique sur la période (avec ajustement Sénégal)
        const totalTheoreticalFeedG = adjustedCurve.reduce(
          (sum, p) => sum + p.dailyFeedGPerBird,
          0
        )
        const totalTheoreticalFeedKg =
          (totalTheoreticalFeedG * avgLivingBirds) / 1000

        // Feed factor = réel / théorique
        if (totalTheoreticalFeedKg > 0 && totalActualFeedKg > 0) {
          const ff = totalActualFeedKg / totalTheoreticalFeedKg
          // Écarter les valeurs aberrantes (< 0.5 ou > 2.0)
          if (ff >= 0.5 && ff <= 2.0) {
            feedFactors.push(ff)
            detail.observedFeedFactor = round3(ff)
          }
        }

        // Weight factor — utiliser la dernière pesée disponible
        const lastWeightRecord = batch.weightRecords[0]
        if (lastWeightRecord && lastWeightRecord.avgWeightG > 0) {
          const lastAgeDay = startAgeDay + durationDays - 1
          const weightPoint = adjustedCurve.find(
            (p) => p.ageDay === lastAgeDay
          ) ?? adjustedCurve[adjustedCurve.length - 1]

          if (weightPoint?.bodyWeightG) {
            const theoreticalWeightG =
              weightPoint.bodyWeightG *
              senegalProfile.factors.weight.coefficient

            if (theoreticalWeightG > 0) {
              const wf = lastWeightRecord.avgWeightG / theoreticalWeightG
              if (wf >= 0.5 && wf <= 2.0) {
                weightFactors.push(wf)
                detail.observedWeightFactor = round3(wf)
              }
            }
          }
        }

        // FCR factor — uniquement pour les lots chair avec pesées
        if (batchType === "CHAIR") {
          const lastWeight = batch.weightRecords[0]?.avgWeightG ?? null
          const entryWeight = batch.entryWeightG ?? 0

          if (lastWeight && lastWeight > entryWeight && avgLivingBirds > 0) {
            const totalWeightGainKg =
              ((lastWeight - entryWeight) * avgLivingBirds) / 1000
            if (totalWeightGainKg > 0 && totalActualFeedKg > 0) {
              const actualFCR = totalActualFeedKg / totalWeightGainKg

              // Trouver le FCR génétique de référence depuis la courbe
              // (approximation : ratio consommation cumulée / gain poids cumulé)
              const cumulativeFeedG = curvePoints.reduce(
                (sum, p) => sum + (p.dailyFeedGPerBird ?? 0),
                0
              )
              const lastCurveWeightG =
                curvePoints[curvePoints.length - 1]?.bodyWeightG
              const firstCurveWeightG = curvePoints[0]?.bodyWeightG

              if (
                lastCurveWeightG &&
                firstCurveWeightG &&
                lastCurveWeightG > firstCurveWeightG
              ) {
                const geneticFeedKg =
                  (cumulativeFeedG * avgLivingBirds) / 1000
                const geneticWeightGainKg =
                  ((lastCurveWeightG - firstCurveWeightG) * avgLivingBirds) /
                  1000
                const geneticFCR =
                  geneticWeightGainKg > 0
                    ? geneticFeedKg / geneticWeightGainKg
                    : null

                if (geneticFCR && geneticFCR > 0) {
                  const senegalFCR =
                    geneticFCR * senegalProfile.factors.fcr.coefficient
                  const fcrF = actualFCR / senegalFCR
                  if (fcrF >= 0.5 && fcrF <= 3.0) {
                    fcrFactors.push(fcrF)
                    detail.observedFCR = round3(actualFCR)
                    detail.geneticFCR = round3(senegalFCR)
                  }
                }
              }
            }
          }
        }
      }
    }

    perBatchDetails.push(detail)
  }

  // Calculer les médianes
  const medFeed = median(feedFactors) ?? 1
  const medWeight = median(weightFactors) ?? 1
  const medFCR = median(fcrFactors) ?? 1
  // Laying factor : pas encore calculé (nécessite EggProductionRecord)
  // → placeholder à 1 jusqu'à Phase 4
  const medLaying = median(layingFactors) ?? 1

  // Déterminer si on est prêt pour une suggestion
  const batchCount = batches.length
  const significantDeviation =
    Math.abs(medFeed - 1) > 0.05 ||
    Math.abs(medWeight - 1) > 0.05 ||
    Math.abs(medFCR - 1) > 0.05
  const suggestionReady =
    batchCount >= minBatchesForSuggestion && significantDeviation

  // Calculer la période couverte
  const oldestBatch = batches[batches.length - 1]
  const newestBatch = batches[0]
  let basedOnPeriodMonths: number | null = null
  if (oldestBatch.closedAt && newestBatch.closedAt) {
    const diffMs =
      newestBatch.closedAt.getTime() - oldestBatch.closedAt.getTime()
    basedOnPeriodMonths = Math.max(1, Math.round(diffMs / (30 * 86_400_000)))
  }

  return {
    feedFactor: round3(medFeed),
    weightFactor: round3(medWeight),
    fcrFactor: round3(medFCR),
    layingFactor: round3(medLaying),
    basedOnBatchCount: batchCount,
    basedOnPeriodMonths,
    suggestionReady,
    perBatchDetails,
  }
}

// =============================================================================
// Écart vs profil Sénégal actif
// =============================================================================

/**
 * Calcule l'écart entre les facteurs observés et les coefficients Sénégal actifs.
 * Utilisé pour décider si une suggestion est pertinente.
 *
 * @returns Écarts en pourcentage (positif = ferme consomme plus / pèse moins que prévu)
 */
export function computeFactorDeviations(
  observed: FarmObservedFactors,
  senegalProfileCode: SenegalProfileCode
): {
  feedDeviationPct: number
  weightDeviationPct: number
  fcrDeviationPct: number
  layingDeviationPct: number
} {
  const profile = resolveSenegalProfile(senegalProfileCode, null)

  return {
    feedDeviationPct:
      Math.round((observed.feedFactor / profile.factors.feed.coefficient - 1) * 100 * 10) / 10,
    weightDeviationPct:
      Math.round((observed.weightFactor / profile.factors.weight.coefficient - 1) * 100 * 10) / 10,
    fcrDeviationPct:
      Math.round((observed.fcrFactor / profile.factors.fcr.coefficient - 1) * 100 * 10) / 10,
    layingDeviationPct:
      Math.round((observed.layingFactor / profile.factors.laying.coefficient - 1) * 100 * 10) / 10,
  }
}

// =============================================================================
// Conversion vers FarmAdjustmentFactors (pour usage en calcul)
// =============================================================================

/**
 * Convertit les facteurs observés en FarmAdjustmentFactors utilisables
 * par le moteur de référence.
 *
 * NE DOIT ÊTRE UTILISÉ QUE SI LE PROFIL EST EN ÉTAT ACTIVE.
 * Cette fonction ne vérifie pas l'état du profil — c'est la responsabilité
 * de resolveFarmAdjustmentFactors() dans feed-reference.ts.
 */
export function observedToAdjustmentFactors(
  observed: FarmObservedFactors
): FarmAdjustmentFactors {
  return {
    feedFactor: observed.feedFactor,
    weightFactor: observed.weightFactor,
    fcrFactor: observed.fcrFactor,
    layingFactor: observed.layingFactor,
  }
}
