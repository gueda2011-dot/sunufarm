/**
 * SunuFarm — Benchmarks Collectifs
 *
 * Calcule des benchmarks statistiques depuis le pool anonymisé de
 * BatchOutcomeSnapshot. Les benchmarks sont utilisés pour contextualiser
 * les alertes et les analyses IA avec des données réelles de terrain.
 *
 * Logique de fallback :
 *   1. Benchmark collectif précis (même race + région + saison) si ≥ MIN_SAMPLE
 *   2. Benchmark collectif élargi (race + type de lot) si ≥ MIN_SAMPLE
 *   3. Benchmark collectif très large (type de lot uniquement)
 *   4. null si pas assez de données — l'appelant doit gérer ce cas
 *
 * Ces fonctions sont PURE READ — pas d'effet de bord, pas de mutation.
 */

import prisma from "@/src/lib/prisma"
import { BatchType } from "@/src/generated/prisma/client"
import { getAdjustedCurveForBatch } from "@/src/lib/feed-reference"

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const MIN_SAMPLE_PRECISE = 10 // minimum pour un benchmark précis
const MIN_SAMPLE_BROAD = 5 // minimum pour un benchmark élargi
const MAX_SEASON_LAG_MONTHS = 2 // fenêtre de saisonnalité (±2 mois)
const MAX_SNAPSHOTS_FOR_BENCHMARK = 500 // plafond de snapshots chargés

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CollectiveBenchmark {
  sampleSize: number
  scope: "precise" | "broad" | "type_only"

  // Mortalité finale
  p10MortalityRate: number | null // top 10% (meilleurs)
  p25MortalityRate: number | null
  medianMortalityRate: number | null
  p75MortalityRate: number | null

  // FCR
  medianFCR: number | null
  p25FCR: number | null
  p75FCR: number | null

  // Marge
  medianMarginRate: number | null
  p25MarginRate: number | null

  // Prix de vente
  medianSalePricePerKgFcfa: number | null

  // Météo (contexte)
  avgHeatStressDays: number | null

  // Filtres utilisés (pour affichage dans l'UI)
  usedRegionCode: string | null
  usedBreedCode: string | null
  usedMonths: number[]

  // Référence ajustée du lot courant (si le contexte permet de la calculer)
  adjustedReference: {
    ageDay: number
    dailyFeedGPerBird: number | null
    rawGeneticFeedGPerBird: number | null
    source: "genetic" | "senegal" | "farm" | null
    senegalProfileCode: string | null
    curveVersion: string | null
  } | null
}

interface BenchmarkContext {
  batchType: BatchType
  breedCode?: string | null
  regionCode?: string | null
  entryMonth?: number
  batchId?: string
  farmId?: string
  ageDay?: number
}

// ---------------------------------------------------------------------------
// Helpers statistiques (purs)
// ---------------------------------------------------------------------------

function percentile(sortedValues: number[], p: number): number | null {
  if (sortedValues.length === 0) return null
  const idx = Math.floor((p / 100) * (sortedValues.length - 1))
  return sortedValues[Math.max(0, Math.min(idx, sortedValues.length - 1))]
}

function extractNonNull<T extends number>(arr: Array<T | null | undefined>): T[] {
  return arr.filter((v): v is T => v !== null && v !== undefined && Number.isFinite(v))
}

function computeStats(values: number[]): {
  p10: number | null; p25: number | null
  median: number | null; p75: number | null
} {
  if (values.length === 0) return { p10: null, p25: null, median: null, p75: null }
  const sorted = [...values].sort((a, b) => a - b)
  return {
    p10: percentile(sorted, 10),
    p25: percentile(sorted, 25),
    median: percentile(sorted, 50),
    p75: percentile(sorted, 75),
  }
}

function getAdjacentMonths(month: number, radius: number): number[] {
  const months: number[] = []
  for (let delta = -radius; delta <= radius; delta++) {
    const m = ((month - 1 + delta) % 12 + 12) % 12 + 1
    months.push(m)
  }
  return [...new Set(months)]
}

function buildFromSnapshots(
  snapshots: Array<{
    finalMortalityRatePct: number
    finalFCR: number | null
    finalMarginRatePct: number | null
    avgSalePricePerKgFcfa: number | null
    heatStressDays: number | null
  }>,
  scope: CollectiveBenchmark["scope"],
  context: { regionCode?: string | null; breedCode?: string | null; months: number[] },
): CollectiveBenchmark {
  const mortalityRates = extractNonNull(snapshots.map((s) => s.finalMortalityRatePct))
  const fcrs = extractNonNull(snapshots.map((s) => s.finalFCR))
  const margins = extractNonNull(snapshots.map((s) => s.finalMarginRatePct))
  const prices = extractNonNull(snapshots.map((s) => s.avgSalePricePerKgFcfa))
  const heatDays = extractNonNull(snapshots.map((s) => s.heatStressDays))

  const mortalityStats = computeStats(mortalityRates)
  const fcrStats = computeStats(fcrs)
  const marginStats = computeStats(margins)
  const priceStats = computeStats(prices)

  return {
    sampleSize: snapshots.length,
    scope,
    p10MortalityRate: mortalityStats.p10,
    p25MortalityRate: mortalityStats.p25,
    medianMortalityRate: mortalityStats.median,
    p75MortalityRate: mortalityStats.p75,
    medianFCR: fcrStats.median,
    p25FCR: fcrStats.p25,
    p75FCR: fcrStats.p75,
    medianMarginRate: marginStats.median,
    p25MarginRate: marginStats.p25,
    medianSalePricePerKgFcfa: priceStats.median ? Math.round(priceStats.median) : null,
    avgHeatStressDays: heatDays.length > 0
      ? Math.round(heatDays.reduce((s, v) => s + v, 0) / heatDays.length)
      : null,
    usedRegionCode: context.regionCode ?? null,
    usedBreedCode: context.breedCode ?? null,
    usedMonths: context.months,
    adjustedReference: null,
  }
}

async function resolveAdjustedReferenceContext(
  context: BenchmarkContext,
): Promise<CollectiveBenchmark["adjustedReference"]> {
  if (
    !context.batchId ||
    !context.farmId ||
    !context.breedCode ||
    context.ageDay == null ||
    (context.batchType !== BatchType.CHAIR && context.batchType !== BatchType.PONDEUSE)
  ) {
    return null
  }

  const { curve, senegalProfileCode, farmFactors } = await getAdjustedCurveForBatch(prisma, {
    batchId: context.batchId,
    farmId: context.farmId,
    batchType: context.batchType,
    breedCode: context.breedCode,
    startAgeDay: context.ageDay,
    endAgeDay: context.ageDay,
  })

  const point = curve[0]
  if (!point) {
    return {
      ageDay: context.ageDay,
      dailyFeedGPerBird: null,
      rawGeneticFeedGPerBird: null,
      source: null,
      senegalProfileCode,
      curveVersion: null,
    }
  }

  return {
    ageDay: context.ageDay,
    dailyFeedGPerBird: point.dailyFeedGPerBird,
    rawGeneticFeedGPerBird: point.rawGeneticFeedG,
    source: farmFactors ? "farm" : senegalProfileCode !== "STANDARD_LOCAL" ? "senegal" : "genetic",
    senegalProfileCode,
    curveVersion: point.version,
  }
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Retourne le benchmark collectif le plus précis disponible pour un contexte donné.
 * Applique une stratégie de fallback progressive si le sample est insuffisant.
 */
export async function getCollectiveBenchmark(
  context: BenchmarkContext,
): Promise<CollectiveBenchmark | null> {
  const { batchType, breedCode, regionCode, entryMonth } = context
  const adjustedReference = await resolveAdjustedReferenceContext(context)

  const months = entryMonth
    ? getAdjacentMonths(entryMonth, MAX_SEASON_LAG_MONTHS)
    : []

  const selectFields = {
    finalMortalityRatePct: true,
    finalFCR: true,
    finalMarginRatePct: true,
    avgSalePricePerKgFcfa: true,
    heatStressDays: true,
  } as const

  // --- Niveau 1 : précis (race + région + saison) ---
  if (breedCode && regionCode && months.length > 0) {
    const precise = await prisma.batchOutcomeSnapshot.findMany({
      where: {
        batchType,
        breedCode,
        regionCode,
        entryMonth: { in: months },
      },
      select: selectFields,
      take: MAX_SNAPSHOTS_FOR_BENCHMARK,
    })

    if (precise.length >= MIN_SAMPLE_PRECISE) {
      return {
        ...buildFromSnapshots(precise, "precise", { regionCode, breedCode, months }),
        adjustedReference,
      }
    }
  }

  // --- Niveau 2 : élargi (race + type de lot, sans région/saison) ---
  if (breedCode) {
    const broad = await prisma.batchOutcomeSnapshot.findMany({
      where: { batchType, breedCode },
      select: selectFields,
      take: MAX_SNAPSHOTS_FOR_BENCHMARK,
    })

    if (broad.length >= MIN_SAMPLE_BROAD) {
      return {
        ...buildFromSnapshots(broad, "broad", {
          regionCode: null,
          breedCode,
          months: months,
        }),
        adjustedReference,
      }
    }
  }

  // --- Niveau 3 : très large (type de lot uniquement) ---
  const typeOnly = await prisma.batchOutcomeSnapshot.findMany({
    where: { batchType },
    select: selectFields,
    take: MAX_SNAPSHOTS_FOR_BENCHMARK,
  })

  if (typeOnly.length >= MIN_SAMPLE_BROAD) {
    return {
      ...buildFromSnapshots(typeOnly, "type_only", {
        regionCode: null,
        breedCode: null,
        months: [],
      }),
      adjustedReference,
    }
  }

  return null
}

/**
 * Retourne les statistiques globales du pool collectif (pour l'affichage admin).
 */
export async function getCollectivePoolStats(): Promise<{
  totalSnapshots: number
  byType: Record<string, number>
  byRegion: Record<string, number>
  byBreed: Record<string, number>
  latestSnapshotAt: Date | null
}> {
  const [total, byTypeRaw, byRegionRaw, byBreedRaw, latest] = await Promise.all([
    prisma.batchOutcomeSnapshot.count(),

    prisma.batchOutcomeSnapshot.groupBy({
      by: ["batchType"],
      _count: { id: true },
    }),

    prisma.batchOutcomeSnapshot.groupBy({
      by: ["regionCode"],
      _count: { id: true },
      where: { regionCode: { not: null } },
    }),

    prisma.batchOutcomeSnapshot.groupBy({
      by: ["breedCode"],
      _count: { id: true },
      where: { breedCode: { not: null } },
    }),

    prisma.batchOutcomeSnapshot.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ])

  const byType: Record<string, number> = {}
  for (const row of byTypeRaw) {
    byType[row.batchType] = row._count.id
  }

  const byRegion: Record<string, number> = {}
  for (const row of byRegionRaw) {
    if (row.regionCode) byRegion[row.regionCode] = row._count.id
  }

  const byBreed: Record<string, number> = {}
  for (const row of byBreedRaw) {
    if (row.breedCode) byBreed[row.breedCode] = row._count.id
  }

  return {
    totalSnapshots: total,
    byType,
    byRegion,
    byBreed,
    latestSnapshotAt: latest?.createdAt ?? null,
  }
}

/**
 * Formate un message d'insight à partir d'un benchmark collectif.
 * Utilisé pour enrichir les analyses IA et les cartes prédictives.
 */
export function formatCollectiveBenchmarkInsight(
  benchmark: CollectiveBenchmark,
  currentMortalityRatePct: number,
): {
  label: string
  comparaison: "above" | "below" | "on_par"
  message: string
} {
  const medianMortality = benchmark.medianMortalityRate

  if (medianMortality === null) {
    return {
      label: "Benchmark collectif",
      comparaison: "on_par",
      message: "Données de référence insuffisantes pour une comparaison.",
    }
  }

  const delta = currentMortalityRatePct - medianMortality
  const scopeLabel = benchmark.scope === "precise"
    ? `${benchmark.sampleSize} lots similaires (même race, région, saison)`
    : benchmark.scope === "broad"
      ? `${benchmark.sampleSize} lots de même race`
      : `${benchmark.sampleSize} lots de même type`

  if (delta > 1) {
    return {
      label: "Au-dessus de la médiane",
      comparaison: "above",
      message: `Mortalité actuelle ${currentMortalityRatePct.toFixed(1)}% vs médiane ${medianMortality.toFixed(1)}% sur ${scopeLabel}.`,
    }
  }

  if (delta < -1) {
    return {
      label: "En-dessous de la médiane",
      comparaison: "below",
      message: `Excellente performance : mortalité ${currentMortalityRatePct.toFixed(1)}% vs médiane ${medianMortality.toFixed(1)}% sur ${scopeLabel}.`,
    }
  }

  return {
    label: "Dans la médiane",
    comparaison: "on_par",
    message: `Mortalité dans la normale : ${currentMortalityRatePct.toFixed(1)}% vs médiane ${medianMortality.toFixed(1)}% sur ${scopeLabel}.`,
  }
}
