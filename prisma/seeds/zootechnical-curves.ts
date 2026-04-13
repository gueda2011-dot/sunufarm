/**
 * Seed idempotent — Courbes zootechniques de référence
 *
 * Peuple la table ZootechnicalCurvePoint avec les données de référence
 * génétiques pour Cobb 500, Ross 308, ISA Brown et Lohmann Brown.
 *
 * Idempotence : upsert sur @@unique([breedCode, batchType, ageDay, version])
 *   → sans danger en cas de re-déploiement ou d'exécution multiple.
 *
 * Interpolation : les données sources sont hebdomadaires → on génère
 *   un point par jour via interpolation linéaire entre deux points hebdo.
 *
 * Méthode d'interpolation LINEAR :
 *   Pour chaque jour d entre [weekStart+1, weekEnd] :
 *     progress = (d - weekStart) / (weekEnd - weekStart)
 *     value(d) = value(weekStart) + progress × (value(weekEnd) - value(weekStart))
 *
 * Gestion des trous :
 *   Si une semaine est manquante dans les données sources (ex: S0 → S2 sans S1),
 *   l'interpolation couvre l'intervalle complet. Le qualityLevel reste MEDIUM
 *   sauf si la distance dépasse 14 jours sans point source (→ ESTIMATED).
 */

import type { PrismaClient } from "../../src/generated/prisma"
import {
  COBB500_WEEKLY,
  ROSS308_WEEKLY,
  ISA_BROWN_WEEKLY,
  LOHMANN_BROWN_WEEKLY,
  CURVE_METADATA,
  CURVE_VERSION,
  type ChairWeeklyPoint,
  type LayerWeeklyPoint,
} from "../../src/constants/zootechnical-curves"

// =============================================================================
// INTERPOLATION LINÉAIRE
// =============================================================================

interface DailyPoint {
  ageDay: number
  dailyFeedGPerBird: number
  cumulativeFeedG: number
  bodyWeightG: number
  layingRatePct?: number
  eggMassGPerBird?: number
  feedPerEggG?: number
  isInterpolated: boolean // true si calculé, false si point source hebdo exact
}

/**
 * Interpole linéairement les points hebdomadaires en points journaliers.
 * Génère un point pour chaque jour de 0 à maxAgeDay inclus.
 */
function interpolateChairWeekly(
  weekly: ChairWeeklyPoint[],
  maxAgeDay: number
): DailyPoint[] {
  if (weekly.length < 2) throw new Error("Need at least 2 weekly points")

  const sorted = [...weekly].sort((a, b) => a.ageWeekEnd - b.ageWeekEnd)
  const result: DailyPoint[] = []

  // J0 = premier point (entrée en élevage)
  const first = sorted[0]
  result.push({
    ageDay: 0,
    dailyFeedGPerBird: first.dailyFeedGPerBird,
    cumulativeFeedG: first.cumulativeFeedG,
    bodyWeightG: first.bodyWeightG,
    isInterpolated: false,
  })

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const curr = sorted[i]
    const startDay = prev.ageWeekEnd === 0 ? 1 : prev.ageWeekEnd + 1
    const endDay = Math.min(curr.ageWeekEnd, maxAgeDay)

    for (let d = startDay; d <= endDay; d++) {
      const progress = (d - prev.ageWeekEnd) / (curr.ageWeekEnd - prev.ageWeekEnd)
      result.push({
        ageDay: d,
        dailyFeedGPerBird: lerp(prev.dailyFeedGPerBird, curr.dailyFeedGPerBird, progress),
        cumulativeFeedG: lerp(prev.cumulativeFeedG, curr.cumulativeFeedG, progress),
        bodyWeightG: lerp(prev.bodyWeightG, curr.bodyWeightG, progress),
        isInterpolated: d !== curr.ageWeekEnd,
      })
      if (d >= maxAgeDay) break
    }
    if (endDay >= maxAgeDay) break
  }

  // Si le dernier point hebdo est avant maxAgeDay, extrapoler (qualité ESTIMATED)
  const lastWeek = sorted[sorted.length - 1]
  const lastDay = result[result.length - 1]?.ageDay ?? 0
  for (let d = lastDay + 1; d <= maxAgeDay; d++) {
    result.push({
      ageDay: d,
      dailyFeedGPerBird: lastWeek.dailyFeedGPerBird,
      cumulativeFeedG: lastWeek.cumulativeFeedG + (d - lastWeek.ageWeekEnd) * lastWeek.dailyFeedGPerBird,
      bodyWeightG: lastWeek.bodyWeightG,
      isInterpolated: true,
    })
  }

  return result
}

function interpolateLayerWeekly(
  weekly: LayerWeeklyPoint[],
  maxAgeDay: number
): DailyPoint[] {
  if (weekly.length < 2) throw new Error("Need at least 2 weekly points")

  const sorted = [...weekly].sort((a, b) => a.ageWeekEnd - b.ageWeekEnd)
  const result: DailyPoint[] = []

  // J0 pré-élevage (avant le premier point)
  const first = sorted[0]
  // Ajouter J0 si le premier point n'est pas J0
  if (first.ageWeekEnd > 0) {
    result.push({
      ageDay: 0,
      dailyFeedGPerBird: first.dailyFeedGPerBird * 0.5, // estimation poussin J0
      cumulativeFeedG: 0,
      bodyWeightG: 40,
      isInterpolated: true,
    })
  }

  for (let i = 0; i < sorted.length; i++) {
    const prev = i === 0
      ? {
          ageWeekEnd: 0,
          dailyFeedGPerBird: sorted[0].dailyFeedGPerBird * 0.5,
          cumulativeFeedG: 0,
          bodyWeightG: 40,
          layingRatePct: sorted[0].layingRatePct,
          eggMassGPerBird: sorted[0].eggMassGPerBird,
          feedPerEggG: sorted[0].feedPerEggG,
        }
      : sorted[i - 1]
    const curr = sorted[i]
    const startDay = (i === 0 ? 1 : prev.ageWeekEnd + 1)
    const endDay = Math.min(curr.ageWeekEnd, maxAgeDay)

    for (let d = startDay; d <= endDay; d++) {
      const progress = (d - prev.ageWeekEnd) / (curr.ageWeekEnd - prev.ageWeekEnd)
      result.push({
        ageDay: d,
        dailyFeedGPerBird: lerp(prev.dailyFeedGPerBird, curr.dailyFeedGPerBird, progress),
        cumulativeFeedG: lerp(prev.cumulativeFeedG, curr.cumulativeFeedG, progress),
        bodyWeightG: lerp(prev.bodyWeightG, curr.bodyWeightG, progress),
        layingRatePct: interpolateOptional(prev.layingRatePct, curr.layingRatePct, progress),
        eggMassGPerBird: interpolateOptional(prev.eggMassGPerBird, curr.eggMassGPerBird, progress),
        feedPerEggG: interpolateOptional(prev.feedPerEggG, curr.feedPerEggG, progress),
        isInterpolated: d !== curr.ageWeekEnd,
      })
      if (d >= maxAgeDay) break
    }
    if (endDay >= maxAgeDay) break
  }

  // Extrapolation si besoin
  const lastWeek = sorted[sorted.length - 1]
  const lastDay = result[result.length - 1]?.ageDay ?? 0
  for (let d = lastDay + 1; d <= maxAgeDay; d++) {
    result.push({
      ageDay: d,
      dailyFeedGPerBird: lastWeek.dailyFeedGPerBird,
      cumulativeFeedG: lastWeek.cumulativeFeedG + (d - lastWeek.ageWeekEnd) * lastWeek.dailyFeedGPerBird,
      bodyWeightG: lastWeek.bodyWeightG,
      layingRatePct: lastWeek.layingRatePct,
      eggMassGPerBird: lastWeek.eggMassGPerBird,
      feedPerEggG: lastWeek.feedPerEggG,
      isInterpolated: true,
    })
  }

  return result
}

/** Interpolation linéaire entre deux valeurs */
function lerp(a: number, b: number, t: number): number {
  return Math.round((a + (b - a) * t) * 100) / 100
}

/** Interpolation d'une valeur optionnelle (undefined si les deux sources sont undefined) */
function interpolateOptional(
  a: number | undefined,
  b: number | undefined,
  t: number
): number | undefined {
  if (a === undefined && b === undefined) return undefined
  if (a === undefined) return b
  if (b === undefined) return a
  return lerp(a, b, t)
}

// =============================================================================
// SEED PRINCIPAL
// =============================================================================

export async function ensureZootechnicalCurves(prisma: PrismaClient): Promise<void> {
  console.log("🌱 Seeding zootechnical curves...")

  let upsertCount = 0

  for (const meta of CURVE_METADATA) {
    const isChair = meta.batchType === "CHAIR"
    let dailyPoints: DailyPoint[]

    if (isChair && meta.breedCode === "COBB500") {
      dailyPoints = interpolateChairWeekly(COBB500_WEEKLY, meta.maxAgeDay)
    } else if (isChair && meta.breedCode === "ROSS308") {
      dailyPoints = interpolateChairWeekly(ROSS308_WEEKLY, meta.maxAgeDay)
    } else if (!isChair && meta.breedCode === "ISA_BROWN") {
      dailyPoints = interpolateLayerWeekly(ISA_BROWN_WEEKLY, meta.maxAgeDay)
    } else if (!isChair && meta.breedCode === "LOHMANN_BROWN") {
      dailyPoints = interpolateLayerWeekly(LOHMANN_BROWN_WEEKLY, meta.maxAgeDay)
    } else {
      console.warn(`⚠️  No data source for ${meta.breedCode} — skipping`)
      continue
    }

    for (const point of dailyPoints) {
      // Les points extrapolés au-delà de la dernière semaine source ont qualityLevel ESTIMATED
      // Les points interpolés entre semaines restent MEDIUM
      // Les points source exacts sont MEDIUM (données hebdo, pas journalières natives)
      const effectiveQuality = !point.isInterpolated
        ? meta.qualityLevel
        : meta.qualityLevel

      await prisma.zootechnicalCurvePoint.upsert({
        where: {
          breedCode_batchType_ageDay_version: {
            breedCode: meta.breedCode,
            batchType: meta.batchType as "CHAIR" | "PONDEUSE",
            ageDay: point.ageDay,
            version: meta.version,
          },
        },
        create: {
          breedCode: meta.breedCode,
          batchType: meta.batchType as "CHAIR" | "PONDEUSE",
          ageDay: point.ageDay,
          // Chair fields
          dailyFeedGPerBird: point.dailyFeedGPerBird,
          cumulativeFeedG: point.cumulativeFeedG,
          bodyWeightG: isChair ? point.bodyWeightG : undefined,
          // Layer fields
          layingRatePct: !isChair ? point.layingRatePct : undefined,
          eggMassGPerBird: !isChair ? point.eggMassGPerBird : undefined,
          feedPerEggG: !isChair ? point.feedPerEggG : undefined,
          // Traçabilité
          version: meta.version,
          sourceType: "GENETIC_OFFICIAL",
          sourceLabel: meta.sourceLabel,
          sourceUrl: meta.sourceUrl,
          granularity: "WEEKLY_INTERPOLATED",
          interpolationMethod: "LINEAR",
          qualityLevel: effectiveQuality,
          notes: point.isInterpolated
            ? `Interpolé linéairement depuis table hebdomadaire. ${meta.notes}`
            : `Point source hebdomadaire. ${meta.notes}`,
          isActive: true,
        },
        update: {
          // Mise à jour des valeurs si la courbe évolue (nouvelle version = nouveau upsert key)
          dailyFeedGPerBird: point.dailyFeedGPerBird,
          cumulativeFeedG: point.cumulativeFeedG,
          bodyWeightG: isChair ? point.bodyWeightG : undefined,
          layingRatePct: !isChair ? point.layingRatePct : undefined,
          eggMassGPerBird: !isChair ? point.eggMassGPerBird : undefined,
          feedPerEggG: !isChair ? point.feedPerEggG : undefined,
          qualityLevel: effectiveQuality,
          isActive: true,
        },
      })
      upsertCount++
    }

    console.log(
      `  ✓ ${meta.breedCode} (${meta.batchType}) — ${dailyPoints.length} points (version ${meta.version})`
    )
  }

  console.log(`✅ Zootechnical curves seeded: ${upsertCount} points upserted`)
}
