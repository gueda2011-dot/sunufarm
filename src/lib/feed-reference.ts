/**
 * SunuFarm — Dispatcher du référentiel alimentaire 3 niveaux
 *
 * Point d'entrée unique pour obtenir la référence ajustée pour un lot.
 *
 * Pipeline de calcul :
 *   référence utile = génétique × profil_sénégal × facteur_ferme (si ACTIVE)
 *
 * Sélection du profil Sénégal (priorité décroissante) :
 *   1. Lot   : Batch.senegalProfileOverride
 *   2. Ferme : Farm.senegalProfileCode
 *   3. Global: STANDARD_LOCAL
 *
 * Application du facteur ferme :
 *   Uniquement si FarmAdjustmentProfile.status = 'ACTIVE'
 *   → En OBSERVING ou SUGGESTED : facteurs observés mais non appliqués.
 */

import type { PrismaClient } from "@/src/generated/prisma"
import {
  getCurvePoints,
  applyAdjustments,
  getAdjustedSingleDay,
  type CurveDay,
  type AdjustedReference,
  type FarmAdjustmentFactors,
} from "@/src/lib/feed-reference-core"
import { resolveSenegalProfile, type SenegalProfileCode } from "@/src/constants/senegal-profiles"

// =============================================================================
// Résolution du contexte d'ajustement
// =============================================================================

/**
 * Résout le profil Sénégal effectif pour un lot donné.
 * Lit Batch.senegalProfileOverride et Farm.senegalProfileCode depuis la DB.
 */
export async function resolveBatchSenegalProfile(
  prisma: PrismaClient,
  batchId: string
): Promise<SenegalProfileCode> {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: {
      senegalProfileOverride: true,
      building: {
        select: {
          farm: { select: { senegalProfileCode: true } },
        },
      },
    },
  })

  const override = batch?.senegalProfileOverride as SenegalProfileCode | null
  const farmCode = batch?.building?.farm?.senegalProfileCode as SenegalProfileCode | null

  return override ?? farmCode ?? "STANDARD_LOCAL"
}

/**
 * Retourne les facteurs d'ajustement ferme si le profil est ACTIVE, null sinon.
 * En OBSERVING ou SUGGESTED : les facteurs sont calculés mais non appliqués.
 */
export async function resolveFarmAdjustmentFactors(
  prisma: PrismaClient,
  farmId: string
): Promise<FarmAdjustmentFactors | null> {
  const profile = await prisma.farmAdjustmentProfile.findUnique({
    where: { farmId },
    select: {
      status: true,
      feedFactor: true,
      weightFactor: true,
      fcrFactor: true,
      layingFactor: true,
    },
  })

  if (!profile || profile.status !== "ACTIVE") return null

  return {
    feedFactor: profile.feedFactor ?? 1,
    weightFactor: profile.weightFactor ?? 1,
    fcrFactor: profile.fcrFactor ?? 1,
    layingFactor: profile.layingFactor ?? 1,
  }
}

// =============================================================================
// API principale : courbes ajustées pour une période
// =============================================================================

/**
 * Retourne la courbe de référence ajustée pour une période donnée.
 *
 * @param batchType  "CHAIR" | "PONDEUSE"
 * @param breedCode  Code souche (ex: "COBB500", "ISA_BROWN")
 * @param startAgeDay Premier jour d'âge de la période
 * @param endAgeDay   Dernier jour d'âge de la période
 * @param senegalProfileCode Profil Sénégal à appliquer
 * @param farmFactors Facteurs ferme si status=ACTIVE, null sinon
 */
export async function getAdjustedCurveForPeriod(
  prisma: PrismaClient,
  params: {
    batchType: "CHAIR" | "PONDEUSE"
    breedCode: string
    startAgeDay: number
    endAgeDay: number
    senegalProfileCode: SenegalProfileCode
    farmFactors: FarmAdjustmentFactors | null
  }
): Promise<CurveDay[]> {
  const { batchType, breedCode, startAgeDay, endAgeDay, senegalProfileCode, farmFactors } = params

  const points = await getCurvePoints(
    prisma,
    breedCode,
    batchType,
    startAgeDay,
    endAgeDay
  )

  if (points.length === 0) return []

  return applyAdjustments(points, senegalProfileCode, farmFactors)
}

/**
 * Retourne la référence ajustée pour un seul jour d'âge.
 * Pratique pour les diagnostics dashboard (comparaison jour par jour).
 */
export async function getAdjustedReferenceForDay(
  prisma: PrismaClient,
  params: {
    batchType: "CHAIR" | "PONDEUSE"
    breedCode: string
    ageDay: number
    senegalProfileCode: SenegalProfileCode
    farmFactors: FarmAdjustmentFactors | null
  }
): Promise<AdjustedReference | null> {
  const points = await getCurvePoints(
    prisma,
    params.breedCode,
    params.batchType,
    params.ageDay,
    params.ageDay
  )

  if (points.length === 0) return null

  return getAdjustedSingleDay(points[0], params.senegalProfileCode, params.farmFactors)
}

/**
 * Résolution complète depuis un batchId — charge profil Sénégal et facteurs ferme
 * depuis la DB, puis retourne la courbe ajustée pour la période.
 *
 * Raccourci pratique pour les server actions.
 */
export async function getAdjustedCurveForBatch(
  prisma: PrismaClient,
  params: {
    batchId: string
    farmId: string
    batchType: "CHAIR" | "PONDEUSE"
    breedCode: string | null
    startAgeDay: number
    endAgeDay: number
  }
): Promise<{ curve: CurveDay[]; senegalProfileCode: SenegalProfileCode; farmFactors: FarmAdjustmentFactors | null }> {
  if (!params.breedCode) {
    return { curve: [], senegalProfileCode: "STANDARD_LOCAL", farmFactors: null }
  }

  const [senegalProfileCode, farmFactors] = await Promise.all([
    resolveBatchSenegalProfile(prisma, params.batchId),
    resolveFarmAdjustmentFactors(prisma, params.farmId),
  ])

  const curve = await getAdjustedCurveForPeriod(prisma, {
    batchType: params.batchType,
    breedCode: params.breedCode,
    startAgeDay: params.startAgeDay,
    endAgeDay: params.endAgeDay,
    senegalProfileCode,
    farmFactors,
  })

  return { curve, senegalProfileCode, farmFactors }
}
